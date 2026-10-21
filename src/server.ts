import 'dotenv/config';
import express, { Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { verifyMetaSignature } from './security/meta-signature';
import { SqsMessageQueue } from './queue/sqs-queue';
import { GroqAiIntentExtractor } from './ai/intent-extractor';
import { WhatsappBotService } from './pipeline/whatsapp-bot.service';
import { buildMetaWelcomeTemplate } from './templates/meta-templates';

export interface BuildBotAppOptions {
  metaVerifyToken?: string;
  metaAppSecret?: string;
  whatsappBotSecret?: string;
  botService: WhatsappBotService;
  autoDrainQueue?: boolean;
}

export function buildBotApp(options: BuildBotAppOptions) {
  const app = express();
  const verifyToken = options.metaVerifyToken ?? process.env.META_VERIFY_TOKEN ?? 'dev-verify-token';
  const appSecret = options.metaAppSecret ?? process.env.META_APP_SECRET ?? 'dev-meta-app-secret';
  const botSecret = options.whatsappBotSecret ?? process.env.WHATSAPP_BOT_SECRET ?? '';
  const autoDrain = options.autoDrainQueue ?? true;

  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'reservaya-whatsapp', ts: new Date().toISOString() });
  });

  // 1. Handshake de verificación del Webhook de Meta
  app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(403).json({ error: 'Invalid Meta webhook verification token' });
  });

  // 2. Recepción de eventos de WhatsApp Cloud API con validación obligatoria X-Hub-Signature-256 (B-04 / RNF-27)
  app.post('/webhook/whatsapp', async (req: Request & { rawBody?: Buffer }, res: Response) => {
    const signatureHeader =
      typeof req.headers['x-hub-signature-256'] === 'string'
        ? req.headers['x-hub-signature-256']
        : undefined;

    const validSignature = verifyMetaSignature({
      rawBody: req.rawBody,
      signatureHeader,
      appSecret,
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

    const fromPhone = String(msg.from).startsWith('+') ? String(msg.from) : `+${msg.from}`;
    const profileName = value?.contacts?.[0]?.profile?.name;

    const enqueueResult = await options.botService.receiveAndEnqueue({
      whatsappMessageId: String(msg.id),
      fromPhone,
      profileName,
      text: String(msg.text?.body ?? ''),
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
  });

  // 3. Webhook interno desde Back-Reserva-Ya (whatsapp-events.ts: appointment.created / user.invite)
  app.post('/internal/events', async (req, res) => {
    if (botSecret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${botSecret}`) {
        res.status(403).json({ error: 'Invalid whatsapp bot secret' });
        return;
      }
    }

    const eventType = req.body?.type;
    if (eventType === 'user.invite') {
      const user = req.body?.user ?? {};
      const welcome = buildMetaWelcomeTemplate({
        toPhone: String(user.phone ?? ''),
        clientName: String(user.name ?? 'Cliente'),
        tenantName: 'ReservaYa',
      });
      options.botService.sentMessages.push({
        to: String(user.phone ?? ''),
        kind: 'template',
        text: welcome.text,
        templatePayload: welcome,
      });
      res.status(200).json({ ok: true, template: welcome.templateName });
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

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const queue = new SqsMessageQueue();
  const extractor = new GroqAiIntentExtractor();
  const botService = new WhatsappBotService({
    backApiBaseUrl: process.env.BACK_API_BASE_URL ?? 'http://localhost:3000',
    whatsappBotSecret: process.env.WHATSAPP_BOT_SECRET,
    queue,
    extractor,
  });
  const app = buildBotApp({ botService });
  const port = Number(process.env.PORT ?? 3100);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[reservaya-whatsapp] listening on :${port}`);
  });
}
