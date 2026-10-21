import { describe, expect, it } from 'vitest';
import { signMetaPayload, verifyMetaSignature } from '../src/security/meta-signature';
import { SqsMessageQueue } from '../src/queue/sqs-queue';
import { GroqAiIntentExtractor } from '../src/ai/intent-extractor';
import {
  buildMetaPaymentReceiptTemplate,
  buildMetaWelcomeTemplate,
} from '../src/templates/meta-templates';

describe('ReservaYa-Whatsapp unit & pipeline checks (B-04, B-05, B-06, B-08)', () => {
  it('valida la firma criptográfica X-Hub-Signature-256 de Meta y rechaza firmas alteradas (B-04 / RNF-27)', () => {
    const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const secret = 'meta-test-secret-key-2026';
    const validSignature = signMetaPayload(rawBody, secret);

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: validSignature,
        appSecret: secret,
      }),
    ).toBe(true);

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        appSecret: secret,
      }),
    ).toBe(false);
  });

  it('encola mensajes en SQS con deduplicación estricta por whatsappMessageId evitando doble procesamiento (B-04 / B-08)', async () => {
    const queue = new SqsMessageQueue();
    const first = await queue.enqueue({
      whatsappMessageId: 'wamid.HBgMNTczMTAxMjM0NTY3FQIAEhgg',
      fromPhone: '+573101234567',
      text: 'Quiero agendar un corte mañana a las 10am',
      receivedAt: new Date().toISOString(),
    });
    const duplicate = await queue.enqueue({
      whatsappMessageId: 'wamid.HBgMNTczMTAxMjM0NTY3FQIAEhgg',
      fromPhone: '+573101234567',
      text: 'Quiero agendar un corte mañana a las 10am',
      receivedAt: new Date().toISOString(),
    });

    expect(first.enqueued).toBe(true);
    expect(first.deduplicated).toBe(false);
    expect(duplicate.enqueued).toBe(false);
    expect(duplicate.deduplicated).toBe(true);
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

  it('construye plantillas aprobadas de Meta para bienvenida y recibo de pago en español (texto + HTML + WABA) (B-06)', () => {
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
  });
});
