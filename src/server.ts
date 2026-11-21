import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { safeEqual, verifyMetaSignature } from './security/meta-signature';
import { SqsMessageQueue } from './queue/sqs-queue';
import { GroqAiIntentExtractor } from './ai/intent-extractor';
import { WhatsappBotService } from './pipeline/whatsapp-bot.service';
import { buildMetaWelcomeTemplate } from './templates/meta-templates';

export interface BuildBotAppOptions {
  metaVerifyToken?: string;
  metaAppSecret?: string;
  metaAppSecretAlt?: string;
  whatsappBotSecret?: string;
  internalServiceSecret?: string;
  verifyCodeRateLimitMax?: number;
  verifyCodeRateLimitWindowMs?: number;
  botService: WhatsappBotService;
  autoDrainQueue?: boolean;
}

function createSlidingWindowRateLimiter(windowMs: number, maxRequests: number) {
  const buckets = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || String(req.headers['x-forwarded-for'] ?? 'unknown');
    const now = Date.now();
    const recent = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ ok: false, error: 'Too many requests' });
      return;
    }
    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}

export function buildBotApp(options: BuildBotAppOptions) {
  const app = express();
  // PR #1 (9e21024): Sin defaults en texto plano; todos los secretos son fail-closed si faltan.
  const verifyToken = (
    options.metaVerifyToken ??
    process.env.WHATSAPP_VERIFY_TOKEN ??
    process.env.META_VERIFY_TOKEN ??
    ''
  ).trim();
  const appSecrets = [
    options.metaAppSecret ?? process.env.WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET ?? '',
    options.metaAppSecretAlt ??
      process.env.WHATSAPP_APP_SECRET_ALT ??
      process.env.META_APP_SECRET_ALT ??
      '',
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const botSecret = (options.whatsappBotSecret ?? process.env.WHATSAPP_BOT_SECRET ?? '').trim();
  const internalServiceSecret = (
    options.internalServiceSecret ??
    process.env.INTERNAL_SERVICE_SECRET ??
    ''
  ).trim();
  // RNF-27: Cuando SQS está activo, el webhook encola y responde inmediatamente (< 5 s)
  const autoDrain = options.autoDrainQueue ?? !process.env.SQS_QUEUE_URL;

  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'reservaya-whatsapp' });
  });

  // 1. Handshake de verificación del Webhook de Meta (fail-closed si falta verifyToken)
  const handleWebhookVerify = (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : '';
    const challenge = req.query['hub.challenge'];

    if (
      verifyToken &&
      mode === 'subscribe' &&
      safeEqual(token, verifyToken) &&
      typeof challenge === 'string'
    ) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(403).json({ error: 'Invalid Meta webhook verification token' });
  };
  app.get('/webhook/whatsapp', handleWebhookVerify);
  app.get('/webhook', handleWebhookVerify);

  // 2. Recepción de eventos de Meta Cloud API con firma HMAC-SHA256 obligatoria y soporte de rotación (9e21024)
  const handleWebhookPost = async (req: Request & { rawBody?: Buffer }, res: Response) => {
    const signatureHeader =
      typeof req.headers['x-hub-signature-256'] === 'string'
        ? req.headers['x-hub-signature-256']
        : undefined;

    const validSignature = verifyMetaSignature({
      rawBody: req.rawBody,
      signatureHeader,
      appSecret: appSecrets,
    });

    if (!validSignature) {
      res.status(401).json({ error: 'Invalid or missing X-Hub-Signature-256 header' });
      return;
    }

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== 'text' || !msg.id || !msg.from) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const bodyText = typeof msg.text?.body === 'string' ? msg.text.body : '';
    if (bodyText.length > 4096) {
      res.status(400).json({ error: 'Message body exceeds 4096 character limit' });
      return;
    }

    const fromPhone = String(msg.from).startsWith('+') ? String(msg.from) : `+${msg.from}`;
    const profileName = value?.contacts?.[0]?.profile?.name;
    const metaPhoneNumberId =
      typeof value?.metadata?.phone_number_id === 'string'
        ? value.metadata.phone_number_id
        : undefined;

    const enqueueResult = await options.botService.receiveAndEnqueue({
      whatsappMessageId: String(msg.id),
      fromPhone,
      metaPhoneNumberId,
      profileName,
      text: bodyText,
      receivedAt: new Date().toISOString(),
    });

    const processed =
      autoDrain && enqueueResult.enqueued ? await options.botService.processQueue() : [];

    res.status(200).json({
      status: 'accepted',
      enqueued: enqueueResult.enqueued,
      deduplicated: enqueueResult.deduplicated,
      sqsMessageId: enqueueResult.sqsMessageId,
      processedCount: processed.length,
      result: processed[0],
    });
  };
  app.post('/webhook/whatsapp', handleWebhookPost);
  app.post('/webhook', handleWebhookPost);

  // 3. Webhook interno desde Back-Reserva-Ya (fail-closed: obligatorio WHATSAPP_BOT_SECRET)
  app.post('/internal/events', async (req, res) => {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const headerSecret =
      typeof req.headers['x-whatsapp-secret'] === 'string'
        ? req.headers['x-whatsapp-secret'].trim()
        : '';
    const provided = headerSecret || bearer;

    if (!botSecret || !provided || !safeEqual(provided, botSecret)) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing whatsapp bot secret' });
      return;
    }

    const eventType = req.body?.type;
    if (eventType === 'user.invite') {
      const user = req.body?.user ?? {};
      const welcome = buildMetaWelcomeTemplate({
        toPhone: String(user.phone ?? ''),
        clientName: String(user.name ?? 'Cliente'),
        tenantName: 'ReservaYa',
      });
      await options.botService.emitOutbound({
        to: String(user.phone ?? ''),
        kind: 'template',
        text: welcome.text,
        templatePayload: welcome,
      });
      res.status(200).json({ ok: true, template: welcome.templateName });
      return;
    }

    if (eventType === 'user.verify-code') {
      const user = req.body?.user ?? {};
      const phone = String(user.phone ?? '').trim();
      const code = String(user.code ?? '').trim();
      const name = typeof user.name === 'string' ? user.name : undefined;
      if (!phone || !/^\d{6}$/.test(code)) {
        res.status(400).json({ ok: false, error: 'invalid payload' });
        return;
      }
      const sent = await options.botService.sendVerificationCode({ phone, code, name });
      res.status(200).json({ ok: true, template: sent.templatePayload?.templateName });
      return;
    }

    if (eventType === 'appointment.created') {
      const appt = req.body?.appointment ?? {};
      const tenant = req.body?.tenant ?? {};
      if (appt.clientPhone && appt.paymentStatus === 'approved') {
        const sent = await options.botService.sendPaymentConfirmationTemplate({
          toPhone: String(appt.clientPhone),
          clientName: String(appt.clientName ?? 'Cliente'),
          tenantName: String(tenant.name ?? 'ReservaYa'),
          serviceName: String(appt.serviceName ?? 'Servicio'),
          startTimeIso: String(appt.startTime),
          paymentReference: String(appt.paymentReference ?? appt.id),
          paidAmount: Number(appt.price ?? 0),
          currency: String(appt.currency ?? 'COP'),
        });
        res.status(200).json({ ok: true, templateSent: sent.templatePayload?.templateName });
        return;
      }
      res.status(200).json({ ok: true, recorded: true });
      return;
    }

    res.status(202).json({ ok: false, reason: 'unhandled_event_type' });
  });

  // 4. Endpoint interno /user/verify-code portado de PR #1 (9e21024): fail-closed + rate limiter
  const verifyCodeLimiter = createSlidingWindowRateLimiter(
    options.verifyCodeRateLimitWindowMs ?? 60_000,
    options.verifyCodeRateLimitMax ?? 10,
  );
  const requireInternalSecret = (req: Request, res: Response, next: NextFunction) => {
    const provided =
      typeof req.headers['x-internal-secret'] === 'string'
        ? req.headers['x-internal-secret'].trim()
        : '';
    if (!internalServiceSecret || !provided || !safeEqual(provided, internalServiceSecret)) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    next();
  };

  app.post(
    '/user/verify-code',
    requireInternalSecret,
    verifyCodeLimiter,
    async (req: Request, res: Response) => {
      const body = req.body ?? {};
      const user = body.user ?? body;
      const phone = typeof user?.phone === 'string' ? user.phone.trim() : '';
      const code = String(user?.code ?? '').trim();
      const name = typeof user?.name === 'string' ? user.name.trim() : undefined;

      if (!phone || !/^\d{6}$/.test(code)) {
        res.status(400).json({ ok: false, error: 'invalid payload' });
        return;
      }

      const sent = await options.botService.sendVerificationCode({ phone, code, name });
      res.status(200).json({
        ok: true,
        template: sent.templatePayload?.templateName,
        providerMessageId: sent.providerMessageId,
      });
    },
  );

  return app;
}

export function createDefaultBotRuntime() {
  const queue = new SqsMessageQueue();
  const extractor = new GroqAiIntentExtractor();
  const botService = new WhatsappBotService({
    backApiBaseUrl: process.env.BACK_API_BASE_URL ?? 'http://localhost:3000',
    frontBaseUrl: process.env.FRONT_BASE_URL,
    whatsappBotSecret: process.env.WHATSAPP_BOT_SECRET,
    queue,
    extractor,
  });
  const app = buildBotApp({ botService });
  return { app, botService, queue };
}

if (
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  import.meta.url &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { app } = createDefaultBotRuntime();
  const port = Number(process.env.PORT ?? 3100);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[reservaya-whatsapp] listening on :${port}`);
  });
}
