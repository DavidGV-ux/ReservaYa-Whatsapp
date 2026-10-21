import { IncomingWhatsappJob, MessageQueuePort } from '../queue/sqs-queue';
import {
  GroqAiIntentExtractor,
  ProfessionalCatalogItem,
  ServiceCatalogItem,
} from '../ai/intent-extractor';
import {
  BusinessTemplatePayload,
  buildMetaPaymentReceiptTemplate,
  buildMetaWelcomeTemplate,
} from '../templates/meta-templates';

export interface OutboundWhatsappMessage {
  to: string;
  kind: 'text' | 'template';
  text: string;
  templatePayload?: BusinessTemplatePayload;
  metadata?: Record<string, unknown>;
}

export interface WhatsappBotPipelineResult {
  whatsappMessageId: string;
  intent: string;
  tenantId: string;
  appointmentId?: string;
  paymentReference?: string;
  paymentLink?: string;
  advanceAmount?: number;
  outboundMessage: OutboundWhatsappMessage;
}

export interface WhatsappBotServiceDeps {
  backApiBaseUrl: string;
  whatsappBotSecret?: string;
  defaultTenantSlug?: string;
  defaultStartTimeIso?: string;
  queue: MessageQueuePort;
  extractor: GroqAiIntentExtractor;
  fetchImpl?: typeof fetch;
  onOutboundMessage?: (msg: OutboundWhatsappMessage) => Promise<void> | void;
}

/**
 * B-04 / F-06 / B-06: Orquestador del flujo conversacional de WhatsApp conectado a `Back-Reserva-Ya`.
 * Flujo: Webhook Meta (validado) -> SQS -> Intención IA (Groq/AI) -> POST /api/public/:tenantId/appointments
 * -> POST /api/public/:tenantId/appointments/:id/payment-session -> Envío de link de pago -> Confirmación por plantilla.
 */
export class WhatsappBotService {
  readonly sentMessages: OutboundWhatsappMessage[] = [];
  readonly processedResults: WhatsappBotPipelineResult[] = [];
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly deps: WhatsappBotServiceDeps) {
    this.fetchFn = deps.fetchImpl ?? fetch;
    this.baseUrl = deps.backApiBaseUrl.replace(/\/+$/, '');
  }

  async receiveAndEnqueue(job: IncomingWhatsappJob) {
    return this.deps.queue.enqueue(job);
  }

  async processQueue(): Promise<WhatsappBotPipelineResult[]> {
    const batchResults: WhatsappBotPipelineResult[] = [];
    await this.deps.queue.drain(async (job) => {
      const res = await this.processSingleJob(job);
      this.processedResults.push(res);
      batchResults.push(res);
    });
    return batchResults;
  }

  async processSingleJob(job: IncomingWhatsappJob): Promise<WhatsappBotPipelineResult> {
    // 1. Consultar identidad del teléfono en Back-Reserva-Ya (/api/whatsapp/lookup)
    const lookupRes = await this.fetchFn(
      `${this.baseUrl}/api/whatsapp/lookup?phone=${encodeURIComponent(job.fromPhone)}`,
      {
        headers: this.deps.whatsappBotSecret
          ? { 'x-whatsapp-secret': this.deps.whatsappBotSecret }
          : {},
      },
    );

    const identity = lookupRes.ok
      ? ((await lookupRes.json()) as {
          tenantId?: string;
          slug?: string;
          tenantName?: string;
          clientName?: string;
        })
      : {};

    // 2. Resolver el tenant destino (por lookup, sugerencia o directorio público)
    let tenantId = identity.tenantId;
    let tenantSlug = identity.slug ?? job.tenantHintSlug ?? this.deps.defaultTenantSlug;
    let tenantName = identity.tenantName ?? 'Barber Estilo';

    if (!tenantId) {
      if (tenantSlug) {
        const tenantRes = await this.fetchFn(
          `${this.baseUrl}/api/public/tenants/${encodeURIComponent(tenantSlug)}`,
        );
        if (tenantRes.ok) {
          const t = (await tenantRes.json()) as { tenantId: string; slug: string; name: string };
          tenantId = t.tenantId;
          tenantSlug = t.slug;
          tenantName = t.name;
        }
      }
      if (!tenantId) {
        const dirRes = await this.fetchFn(`${this.baseUrl}/api/public/tenants`);
        const dir = (await dirRes.json()) as Array<{
          tenantId: string;
          slug: string;
          name: string;
        }>;
        const first = dir[0];
        if (!first) {
          throw new Error('No hay tenants activos en Back-Reserva-Ya');
        }
        tenantId = first.tenantId;
        tenantSlug = first.slug;
        tenantName = first.name;
      }
    }

    // 3. Obtener catálogo de servicios y profesionales activos del tenant
    const [servicesRes, profsRes] = await Promise.all([
      this.fetchFn(`${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/services`),
      this.fetchFn(`${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/professionals`),
    ]);

    const services = (await servicesRes.json()) as ServiceCatalogItem[];
    const professionals = (await profsRes.json()) as ProfessionalCatalogItem[];

    // 4. Extraer intención del mensaje con Groq/AI
    const extracted = await this.deps.extractor.extractIntent({
      text: job.text,
      profileName: job.profileName ?? identity.clientName,
      services,
      professionals,
      defaultStartTimeIso: this.deps.defaultStartTimeIso,
    });

    if (extracted.intent !== 'BOOK_APPOINTMENT' || !extracted.serviceId || !extracted.professionalId) {
      const welcome = buildMetaWelcomeTemplate({
        toPhone: job.fromPhone,
        clientName: extracted.clientName ?? job.profileName ?? 'Cliente',
        tenantName,
      });
      const outbound: OutboundWhatsappMessage = {
        to: job.fromPhone,
        kind: 'template',
        text: welcome.text,
        templatePayload: welcome,
      };
      await this.emitOutbound(outbound);
      return {
        whatsappMessageId: job.whatsappMessageId,
        intent: extracted.intent,
        tenantId,
        outboundMessage: outbound,
      };
    }

    const startTime =
      extracted.startTimeIso ??
      this.deps.defaultStartTimeIso ??
      new Date(Date.now() + 48 * 3_600_000).toISOString();

    // 5. Crear la reserva en Back-Reserva-Ya con source: 'whatsapp' e idempotencyKey ligada al wamid
    const bookingRes = await this.fetchFn(
      `${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/appointments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: extracted.serviceId,
          professionalId: extracted.professionalId,
          startTime,
          clientInfo: {
            name: extracted.clientName ?? job.profileName ?? 'Cliente WhatsApp',
            phone: job.fromPhone,
            email: extracted.clientEmail ?? 'cliente.whatsapp@reservaya.co',
            habeasDataConsent: true,
          },
          source: 'whatsapp',
          idempotencyKey: `wa-${job.whatsappMessageId}`,
        }),
      },
    );

    if (!bookingRes.ok) {
      const errBody = await bookingRes.text();
      throw new Error(`Error creando reserva desde WhatsApp (${bookingRes.status}): ${errBody}`);
    }

    const bookingData = (await bookingRes.json()) as {
      appointment: { id: string; paymentReference?: string; serviceSnapshot: { name: string } };
      intent: { advanceAmount: number; currency: string; paymentReference: string };
    };

    // 6. Generar la sesión y link de pago en Back-Reserva-Ya
    const sessionRes = await this.fetchFn(
      `${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(bookingData.appointment.id)}/payment-session`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'advance' }),
      },
    );

    let paymentLink = `http://localhost:4200/t/${tenantSlug ?? tenantId}/pay/${bookingData.appointment.id}`;
    if (sessionRes.ok) {
      const sessionData = (await sessionRes.json()) as {
        checkoutUrl?: string;
        token?: string;
      };
      if (sessionData.checkoutUrl) {
        paymentLink = sessionData.checkoutUrl;
      } else if (sessionData.token) {
        paymentLink = `${paymentLink}?session=${encodeURIComponent(sessionData.token)}`;
      }
    }

    const outbound: OutboundWhatsappMessage = {
      to: job.fromPhone,
      kind: 'text',
      text:
        `Hola ${extracted.clientName ?? 'Cliente'}, hemos pre-agendado tu cita de "${bookingData.appointment.serviceSnapshot.name}" en ${tenantName}. ` +
        `Para confirmar tu turno, realiza el pago del anticipo (${bookingData.intent.advanceAmount} ${bookingData.intent.currency}, ref: ${bookingData.intent.paymentReference}) en el siguiente enlace seguro: ${paymentLink}`,
      metadata: {
        appointmentId: bookingData.appointment.id,
        paymentReference: bookingData.intent.paymentReference,
        paymentLink,
      },
    };

    await this.emitOutbound(outbound);

    return {
      whatsappMessageId: job.whatsappMessageId,
      intent: extracted.intent,
      tenantId,
      appointmentId: bookingData.appointment.id,
      paymentReference: bookingData.intent.paymentReference,
      paymentLink,
      advanceAmount: bookingData.intent.advanceAmount,
      outboundMessage: outbound,
    };
  }

  /**
   * B-06: Envía confirmación / recibo de pago usando plantilla aprobada de Meta (business-initiated).
   */
  async sendPaymentConfirmationTemplate(input: {
    toPhone: string;
    clientName: string;
    tenantName: string;
    serviceName: string;
    startTimeIso: string;
    paymentReference: string;
    paidAmount: number;
    currency?: string;
  }): Promise<OutboundWhatsappMessage> {
    const formattedDate = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(input.startTimeIso));

    const formattedAmount = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: input.currency ?? 'COP',
      maximumFractionDigits: 0,
    }).format(input.paidAmount);

    const template = buildMetaPaymentReceiptTemplate({
      toPhone: input.toPhone,
      clientName: input.clientName,
      tenantName: input.tenantName,
      serviceName: input.serviceName,
      dateTimeFormatted: formattedDate,
      paymentReference: input.paymentReference,
      paidAmountFormatted: formattedAmount,
    });

    const outbound: OutboundWhatsappMessage = {
      to: input.toPhone,
      kind: 'template',
      text: template.text,
      templatePayload: template,
    };
    await this.emitOutbound(outbound);
    return outbound;
  }

  private async emitOutbound(msg: OutboundWhatsappMessage): Promise<void> {
    this.sentMessages.push(msg);
    if (this.deps.onOutboundMessage) {
      await this.deps.onOutboundMessage(msg);
    }
  }
}
