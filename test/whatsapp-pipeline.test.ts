import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { safeEqual, signMetaPayload, verifyMetaSignature } from '../src/security/meta-signature';
import { SqsMessageQueue } from '../src/queue/sqs-queue';
import { GroqAiIntentExtractor } from '../src/ai/intent-extractor';
import {
  buildMetaPaymentReceiptTemplate,
  buildMetaReminderTemplate,
  buildMetaVerificationCodeTemplate,
  buildMetaWelcomeTemplate,
} from '../src/templates/meta-templates';
import { WhatsappBotService } from '../src/pipeline/whatsapp-bot.service';
import { buildBotApp } from '../src/server';

describe('ReservaYa-Whatsapp: seguridad (9e21024), SQS real, Meta API y RF-4.4/RF-4.6', () => {
  it('valida firma X-Hub-Signature-256 con rotación de doble secreto y fail-closed sin secreto (B-04 / 9e21024)', () => {
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const secretPrimary = 'meta-primary-secret-2026';
    const secretAlt = 'meta-alt-rotation-secret-2026';

    const sigPrimary = signMetaPayload(rawBody, secretPrimary);
    const sigAlt = signMetaPayload(rawBody, secretAlt);

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: sigPrimary,
        appSecret: [secretPrimary, secretAlt],
      }),
    ).toBe(true);

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: sigAlt,
        appSecret: [secretPrimary, secretAlt],
      }),
    ).toBe(true);

    // Fail-closed cuando los secretos están vacíos o alterados
    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: sigPrimary,
        appSecret: ['', '   '],
      }),
    ).toBe(false);

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        appSecret: [secretPrimary, secretAlt],
      }),
    ).toBe(false);

    expect(safeEqual('secret-a', 'secret-a')).toBe(true);
    expect(safeEqual('secret-a', 'secret-b')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });

  it('encola mensajes en AWS SQS real (@aws-sdk/client-sqs) con deduplicación FIFO por wamid y exige SQS_QUEUE_URL en producción (B-04 / RNF-27)', async () => {
    const sentCommands: unknown[] = [];
    const mockSqsClient = {
      send: vi.fn(async (cmd: unknown) => {
        sentCommands.push(cmd);
        return { MessageId: 'sqs-real-msg-001' };
      }),
    };

    const sqsQueue = new SqsMessageQueue({
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/reservaya-whatsapp.fifo',
      sqsClient: mockSqsClient,
    });

    const first = await sqsQueue.enqueue({
      whatsappMessageId: 'wamid.FIFO_DEDUP_001',
      fromPhone: '+573101234567',
      metaPhoneNumberId: '10987654321',
      text: 'Quiero agendar un corte mañana a las 10am',
      receivedAt: new Date().toISOString(),
    });
    const duplicate = await sqsQueue.enqueue({
      whatsappMessageId: 'wamid.FIFO_DEDUP_001',
      fromPhone: '+573101234567',
      metaPhoneNumberId: '10987654321',
      text: 'Quiero agendar un corte mañana a las 10am',
      receivedAt: new Date().toISOString(),
    });

    expect(first.enqueued).toBe(true);
    expect(first.deduplicated).toBe(false);
    expect(first.sqsMessageId).toBe('sqs-real-msg-001');
    expect(duplicate.enqueued).toBe(false);
    expect(duplicate.deduplicated).toBe(true);
    expect(mockSqsClient.send).toHaveBeenCalledTimes(1);

    const cmd = sentCommands[0] as SendMessageCommand;
    expect(cmd).toBeInstanceOf(SendMessageCommand);
    expect(cmd.input.MessageDeduplicationId).toBe('wamid.FIFO_DEDUP_001');
    expect(cmd.input.QueueUrl).toContain('reservaya-whatsapp.fifo');

    // En producción sin SQS_QUEUE_URL debe fallar (fail-closed)
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const memQueue = new SqsMessageQueue({ queueUrl: '' });
      await expect(
        memQueue.enqueue({
          whatsappMessageId: 'wamid.PROD_NO_SQS',
          fromPhone: '+573101234567',
          text: 'Hola',
          receivedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(/SQS_QUEUE_URL is required in production/);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('extrae la intención de reserva con IA mapeando servicio y profesional del catálogo (B-04)', async () => {
    const extractor = new GroqAiIntentExtractor();
    const result = await extractor.extractIntent({
      text: 'Hola, quiero reservar un Corte + barba con Juan a las 10am, mi correo es fercho@uptc.edu.co',
      profileName: 'Fernando Rojas',
      services: [
        { id: 'svc-1', name: 'Corte', price: 35000, currency: 'COP', durationMinutes: 30 },
        { id: 'svc-2', name: 'Corte + barba', price: 55000, currency: 'COP', durationMinutes: 60 },
      ],
      professionals: [{ id: 'prof-1', name: 'Juan Pérez', serviceIds: ['svc-1', 'svc-2'] }],
      defaultStartTimeIso: '2026-10-26T15:00:00.000Z',
    });

    expect(result.intent).toBe('BOOK_APPOINTMENT');
    expect(result.serviceId).toBe('svc-2');
    expect(result.professionalId).toBe('prof-1');
    expect(result.clientEmail).toBe('fercho@uptc.edu.co');
  });

  it('construye plantillas aprobadas de Meta en español (bienvenida, recibo, recordatorio y OTP) (B-06)', () => {
    const welcome = buildMetaWelcomeTemplate({
      toPhone: '+573101234567',
      clientName: 'Fernando',
      tenantName: 'Barber Estilo',
    });
    expect(welcome.templateName).toBe('reservaya_bienvenida_es');
    expect(welcome.metaApiBody.type).toBe('template');
    expect(welcome.html).toContain('Barber Estilo');

    const receipt = buildMetaPaymentReceiptTemplate({
      toPhone: '+573101234567',
      clientName: 'Fernando',
      tenantName: 'Barber Estilo',
      serviceName: 'Corte clásico',
      dateTimeFormatted: '26 oct 2026, 10:00 a. m.',
      paymentReference: 'RSV-999',
      paidAmountFormatted: '$ 12.000',
    });
    expect(receipt.templateName).toBe('reservaya_recibo_pago_es');
    expect(receipt.metaApiBody.template.components[0]?.parameters).toHaveLength(6);

    const reminder = buildMetaReminderTemplate({
      toPhone: '+573101234567',
      clientName: 'Fernando',
      tenantName: 'Barber Estilo',
      serviceName: 'Corte clásico',
      dateTimeFormatted: '26 oct 2026, 10:00 a. m.',
    });
    expect(reminder.templateName).toBe('reservaya_recordatorio_cita_es');

    const otp = buildMetaVerificationCodeTemplate({
      toPhone: '+573101234567',
      code: '482910',
      clientName: 'Fernando',
    });
    expect(otp.templateName).toBe('reservaya_codigo_verificacion_es');
    expect(otp.text).toContain('482910');
    expect(otp.metaApiBody.template.components[0]?.parameters[1]?.text).toBe('482910');
  });

  it('server.ts aplica fail-closed en webhook, rotación de 2 secretos, /internal/events y /user/verify-code con rate limit (9e21024)', async () => {
    const metaFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.META_OUTBOUND_01' }] }),
    });

    const botService = new WhatsappBotService({
      backApiBaseUrl: 'http://127.0.0.1:3999',
      metaPhoneNumberId: '10987654321',
      metaAccessToken: 'EAAG_LIVE_TOKEN',
      queue: new SqsMessageQueue(),
      extractor: new GroqAiIntentExtractor(),
      metaFetchImpl: metaFetch as unknown as typeof fetch,
    });

    // 1. Fail-closed sin secretos configurados -> rechaza webhook, /internal/events y /user/verify-code
    const unconfiguredApp = buildBotApp({
      metaVerifyToken: '',
      metaAppSecret: '',
      metaAppSecretAlt: '',
      whatsappBotSecret: '',
      internalServiceSecret: '',
      botService,
    });

    const unauthWebhook = await request(unconfiguredApp)
      .post('/webhook/whatsapp')
      .set('x-hub-signature-256', signMetaPayload('{}', 'anything'))
      .send({});
    expect(unauthWebhook.status).toBe(401);

    const unauthEvents = await request(unconfiguredApp)
      .post('/internal/events')
      .send({ type: 'user.verify-code', user: { phone: '+573101234567', code: '123456' } });
    expect(unauthEvents.status).toBe(401);

    const unauthVerify = await request(unconfiguredApp)
      .post('/user/verify-code')
      .set('x-internal-secret', 'cualquiera')
      .send({ user: { phone: '573001234567', code: '123456' } });
    expect(unauthVerify.status).toBe(401);

    // 2. App configurada con secretos reales y rotación ALT + rate limiter (max 2)
    const securedApp = buildBotApp({
      metaVerifyToken: 'verify-tok-prod',
      metaAppSecret: 'secret-primary',
      metaAppSecretAlt: 'secret-alt-rotation',
      whatsappBotSecret: 'bot-secret-prod',
      internalServiceSecret: 'internal-secret-prod',
      verifyCodeRateLimitMax: 2,
      verifyCodeRateLimitWindowMs: 60_000,
      botService,
      autoDrainQueue: false,
    });

    // Webhook firmado con secreto ALT aceptado -> 200
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [] } }] }],
    });
    const altSigRes = await request(securedApp)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signMetaPayload(payload, 'secret-alt-rotation'))
      .send(payload);
    expect(altSigRes.status).toBe(200);

    // /internal/events con user.verify-code y secret válido -> 200 y llama a Meta Graph API
    const internalOtpRes = await request(securedApp)
      .post('/internal/events')
      .set('authorization', 'Bearer bot-secret-prod')
      .send({
        type: 'user.verify-code',
        user: { phone: '+573101234567', code: '654321', name: 'Fernando' },
      });
    expect(internalOtpRes.status).toBe(200);
    expect(internalOtpRes.body.template).toBe('reservaya_codigo_verificacion_es');

    // /user/verify-code con secret malo -> 401
    const badInternalRes = await request(securedApp)
      .post('/user/verify-code')
      .set('x-internal-secret', 'wrong-secret')
      .send({ user: { phone: '573001234567', code: '123456' } });
    expect(badInternalRes.status).toBe(401);

    // /user/verify-code con secret válido -> 200 (1 y 2) y luego 429 por rate limit
    const ok1 = await request(securedApp)
      .post('/user/verify-code')
      .set('x-internal-secret', 'internal-secret-prod')
      .send({ user: { phone: '573001234567', code: '111222', name: 'Ana' } });
    expect(ok1.status).toBe(200);
    expect(ok1.body.providerMessageId).toBe('wamid.META_OUTBOUND_01');

    const ok2 = await request(securedApp)
      .post('/user/verify-code')
      .set('x-internal-secret', 'internal-secret-prod')
      .send({ user: { phone: '573001234567', code: '333444' } });
    expect(ok2.status).toBe(200);

    const rateLimited = await request(securedApp)
      .post('/user/verify-code')
      .set('x-internal-secret', 'internal-secret-prod')
      .send({ user: { phone: '573001234567', code: '555666' } });
    expect(rateLimited.status).toBe(429);

    // Verificar que Meta Graph API recibió las llamadas reales con Authorization Bearer
    expect(metaFetch).toHaveBeenCalledTimes(3);
    const [metaUrl, metaInit] = metaFetch.mock.calls[0] as [string, RequestInit];
    expect(metaUrl).toBe('https://graph.facebook.com/v22.0/10987654321/messages');
    expect((metaInit.headers as Record<string, string>).Authorization).toBe('Bearer EAAG_LIVE_TOKEN');
  });

  it('RF-4.4 & RF-4.6: resuelve tenant por phone_number_id, rechaza números sin tenant y marca sesiones expiradas como redirected_to_web', async () => {
    const mockBackFetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api/public/whatsapp/tenant?phoneNumberId=999999999')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      if (u.includes('/api/public/whatsapp/tenant?phoneNumberId=111222333')) {
        return new Response(
          JSON.stringify({
            tenantId: 't_barber_estilo',
            slug: 'barber-estilo',
            name: 'Barber Estilo',
          }),
          { status: 200 },
        );
      }
      if (u.includes('/api/public/whatsapp/lookup')) {
        return new Response(JSON.stringify({ role: null }), { status: 200 });
      }
      if (u.includes('/services')) {
        return new Response(
          JSON.stringify([
            { id: 'svc-1', name: 'Corte', price: 40000, currency: 'COP', durationMinutes: 30 },
          ]),
          { status: 200 },
        );
      }
      if (u.includes('/professionals')) {
        return new Response(
          JSON.stringify([{ id: 'prof-1', name: 'Juan', serviceIds: ['svc-1'] }]),
          { status: 200 },
        );
      }
      if (u.includes('/appointments') && !u.includes('/payment-session')) {
        return new Response(
          JSON.stringify({
            appointment: {
              id: 'appt-rf46-01',
              paymentReference: 'RSV-RF46-001',
              serviceSnapshot: { name: 'Corte' },
            },
            intent: { advanceAmount: 12000, currency: 'COP', paymentReference: 'RSV-RF46-001' },
          }),
          { status: 201 },
        );
      }
      if (u.includes('/payment-session')) {
        return new Response(
          JSON.stringify({ checkoutUrl: 'https://portal.reservaya.co/t/barber-estilo/pay/appt-rf46-01?session=tok' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const botService = new WhatsappBotService({
      backApiBaseUrl: 'http://127.0.0.1:3000',
      frontBaseUrl: 'https://portal.reservaya.co',
      whatsappBotSecret: 'bot-secret',
      sessionTimeoutMs: 15 * 60_000,
      queue: new SqsMessageQueue(),
      extractor: new GroqAiIntentExtractor(),
      fetchImpl: mockBackFetch as unknown as typeof fetch,
    });

    // 1. RF-4.4: Número sin tenant activo -> rechazado y descartado
    const rejected = await botService.processSingleJob({
      whatsappMessageId: 'wamid.UNKNOWN_NUM_01',
      fromPhone: '+573001112233',
      metaPhoneNumberId: '999999999',
      text: 'Quiero agendar un corte',
      receivedAt: '2026-11-21T15:00:00.000Z',
    });
    expect(rejected.rejected).toBe(true);
    expect(rejected.intent).toBe('REJECTED_UNASSIGNED_NUMBER');
    expect(botService.sentMessages).toHaveLength(0);

    // 2. RF-4.4 + RF-4.5: Número válido -> crea reserva con estado pending_payment
    const booked = await botService.processSingleJob({
      whatsappMessageId: 'wamid.VALID_NUM_01',
      fromPhone: '+573001112233',
      metaPhoneNumberId: '111222333',
      profileName: 'Fernando',
      text: 'Hola, quiero agendar un Corte con Juan a las 3pm',
      receivedAt: '2026-11-21T15:00:00.000Z',
    });
    expect(booked.rejected).toBeUndefined();
    expect(booked.tenantId).toBe('t_barber_estilo');
    expect(booked.conversationState).toBe('pending_payment');
    expect(booked.appointmentId).toBe('appt-rf46-01');

    // 3. RF-4.6: Tras pasar > 15 min de inactividad, expireStaleConversations marca redirected_to_web y envía link al portal
    const expired = await botService.expireStaleConversations('2026-11-21T15:20:00.000Z');
    expect(expired).toHaveLength(1);
    expect(expired[0]?.state).toBe('redirected_to_web');
    const redirectMsg = botService.sentMessages[botService.sentMessages.length - 1];
    expect(redirectMsg?.text).toContain('https://portal.reservaya.co/t/barber-estilo');
    expect(redirectMsg?.metadata?.state).toBe('redirected_to_web');
  });
});
