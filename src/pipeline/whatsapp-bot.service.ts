import { IncomingWhatsappJob, MessageQueuePort } from '../queue/sqs-queue';
import {
  GroqAiIntentExtractor,
  ProfessionalCatalogItem,
  ServiceCatalogItem,
} from '../ai/intent-extractor';
import {
  BusinessTemplatePayload,
  buildMetaPaymentReceiptTemplate,
  buildMetaVerificationCodeTemplate,
  buildMetaWelcomeTemplate,
} from '../templates/meta-templates';

export interface OutboundWhatsappMessage {
  to: string;
  kind: 'text' | 'template';
  text: string;
  templatePayload?: BusinessTemplatePayload;
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
}

export type ConversationState =
  | 'started'
  | 'selecting_service'
  | 'pending_payment'
  | 'confirmed'
  | 'redirected_to_web';

export interface ConversationSession {
  conversationId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  fromPhone: string;
  metaPhoneNumberId?: string;
  state: ConversationState;
  appointmentId?: string;
  paymentReference?: string;
  paymentLink?: string;
  lastMessageId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface TenantMappingEntry {
  tenantId: string;
  slug: string;
  name: string;
}

export interface WhatsappBotPipelineResult {
  whatsappMessageId: string;
  intent: string;
  tenantId: string;
  rejected?: boolean;
  rejectionReason?: string;
  conversationState?: ConversationState;
  appointmentId?: string;
  paymentReference?: string;
  paymentLink?: string;
  advanceAmount?: number;
  outboundMessage?: OutboundWhatsappMessage;
}

export interface WhatsappBotServiceDeps {
  backApiBaseUrl: string;
  frontBaseUrl?: string;
  whatsappBotSecret?: string;
  defaultTenantSlug?: string;
  defaultStartTimeIso?: string;
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
  metaApiVersion?: string;
  sessionTimeoutMs?: number;
  allowedPhoneNumberTenants?: Record<string, TenantMappingEntry>;
  queue: MessageQueuePort;
  extractor: GroqAiIntentExtractor;
  fetchImpl?: typeof fetch;
  metaFetchImpl?: typeof fetch;
  onOutboundMessage?: (msg: OutboundWhatsappMessage) => Promise<void> | void;
}

/**
 * B-04 / F-06 / B-06 / RF-4.4 / RF-4.5 / RF-4.6:
 * Orquestador del flujo conversacional de WhatsApp conectado a `Back-Reserva-Ya` y Meta Graph API.
 */
export class WhatsappBotService {
  readonly sentMessages: OutboundWhatsappMessage[] = [];
  readonly processedResults: WhatsappBotPipelineResult[] = [];
  readonly conversations = new Map<string, ConversationSession>();

  private readonly fetchFn: typeof fetch;
  private readonly metaFetchFn?: typeof fetch;
  private readonly baseUrl: string;
  private readonly frontBaseUrl: string;
  private readonly metaPhoneNumberId: string;
  private readonly metaAccessToken: string;
  private readonly metaApiVersion: string;
  private readonly sessionTimeoutMs: number;

  constructor(private readonly deps: WhatsappBotServiceDeps) {
    this.fetchFn = deps.fetchImpl ?? fetch;
    this.metaFetchFn = deps.metaFetchImpl;
    this.baseUrl = deps.backApiBaseUrl.replace(/\/+$/, '');
    this.frontBaseUrl = (
      deps.frontBaseUrl ??
      process.env.FRONT_BASE_URL ??
      'http://localhost:4200'
    ).replace(/\/+$/, '');
    this.metaPhoneNumberId = (
      deps.metaPhoneNumberId ??
      process.env.WHATSAPP_PHONE_NUMBER_ID ??
      process.env.WHATSAPP_PHONE_ID ??
      ''
    ).trim();
    this.metaAccessToken = (
      deps.metaAccessToken ??
      process.env.WHATSAPP_ACCESS_TOKEN ??
      process.env.WHATSAPP_TOKEN ??
      ''
    ).trim();
    this.metaApiVersion = (
      deps.metaApiVersion ??
      process.env.WHATSAPP_API_VERSION ??
      'v22.0'
    ).trim();
    this.sessionTimeoutMs = deps.sessionTimeoutMs ?? 15 * 60_000;
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

  private conversationKey(tenantId: string, fromPhone: string): string {
    return `${tenantId}:${fromPhone}`;
  }

  private upsertConversation(input: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    fromPhone: string;
    metaPhoneNumberId?: string;
    messageId: string;
    state: ConversationState;
    appointmentId?: string;
    paymentReference?: string;
    paymentLink?: string;
    nowIso?: string;
  }): ConversationSession {
    const key = this.conversationKey(input.tenantId, input.fromPhone);
    const nowMs = input.nowIso ? Date.parse(input.nowIso) : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const existing = this.conversations.get(key);
    const session: ConversationSession = {
      conversationId: existing?.conversationId ?? `conv-${input.tenantId}-${input.fromPhone.replace(/\D/g, '')}`,
      tenantId: input.tenantId,
      tenantSlug: input.tenantSlug,
      tenantName: input.tenantName,
      fromPhone: input.fromPhone,
      metaPhoneNumberId: input.metaPhoneNumberId ?? existing?.metaPhoneNumberId,
      state: input.state,
      appointmentId: input.appointmentId ?? existing?.appointmentId,
      paymentReference: input.paymentReference ?? existing?.paymentReference,
      paymentLink: input.paymentLink ?? existing?.paymentLink,
      lastMessageId: input.messageId,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      expiresAt: new Date(nowMs + this.sessionTimeoutMs).toISOString(),
    };
    this.conversations.set(key, session);
    return session;
  }

  /**
   * RF-4.4: Resuelve el tenant activo a partir del `phone_number_id` de Meta.
   * Retorna `null` si el número no está asociado a ningún negocio activo.
   */
  private async resolveTenantByMetaPhoneNumberId(
    metaPhoneNumberId: string,
  ): Promise<TenantMappingEntry | null> {
    const localHit = this.deps.allowedPhoneNumberTenants?.[metaPhoneNumberId];
    if (localHit) {
      return localHit;
    }

    const res = await this.fetchFn(
      `${this.baseUrl}/api/public/whatsapp/tenant?phoneNumberId=${encodeURIComponent(metaPhoneNumberId)}`,
      {
        headers: this.deps.whatsappBotSecret
          ? { 'x-whatsapp-secret': this.deps.whatsappBotSecret }
          : {},
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Partial<TenantMappingEntry>;
    if (!data.tenantId || !data.slug) {
      return null;
    }
    return {
      tenantId: data.tenantId,
      slug: data.slug,
      name: data.name ?? data.slug,
    };
  }

  /**
   * RF-4.6: Expira conversaciones abandonadas o vencidas marcándolas con estado
   * `redirected_to_web` y enviando el enlace al portal web del negocio.
   */
  async expireStaleConversations(nowIso?: string): Promise<ConversationSession[]> {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const expiredSessions: ConversationSession[] = [];

    for (const [key, session] of this.conversations.entries()) {
      if (session.state === 'confirmed' || session.state === 'redirected_to_web') {
        continue;
      }
      if (Date.parse(session.expiresAt) <= nowMs) {
        const portalUrl = `${this.frontBaseUrl}/t/${encodeURIComponent(session.tenantSlug)}`;
        const updated: ConversationSession = {
          ...session,
          state: 'redirected_to_web',
          updatedAt: new Date(nowMs).toISOString(),
        };
        this.conversations.set(key, updated);
        expiredSessions.push(updated);

        await this.emitOutbound(
          {
            to: session.fromPhone,
            kind: 'text',
            text:
              `Tu sesión de reserva por WhatsApp con ${session.tenantName} ha expirado por inactividad. ` +
              `Puedes continuar y finalizar tu cita directamente en nuestro portal web: ${portalUrl}`,
            metadata: {
              conversationId: session.conversationId,
              state: 'redirected_to_web',
              redirectUrl: portalUrl,
            },
          },
          session.metaPhoneNumberId,
        );
      }
    }

    return expiredSessions;
  }

  async processSingleJob(job: IncomingWhatsappJob): Promise<WhatsappBotPipelineResult> {
    // 1. RF-4.4: Si viene metadata.phone_number_id de Meta, resolver estrictamente contra un tenant activo
    let tenantId: string | undefined;
    let tenantSlug: string | undefined;
    let tenantName: string | undefined;

    if (job.metaPhoneNumberId) {
      const mappedTenant = await this.resolveTenantByMetaPhoneNumberId(job.metaPhoneNumberId);
      if (!mappedTenant) {
        return {
          whatsappMessageId: job.whatsappMessageId,
          intent: 'REJECTED_UNASSIGNED_NUMBER',
          tenantId: '',
          rejected: true,
          rejectionReason: `No active tenant associated with phone_number_id ${job.metaPhoneNumberId}`,
        };
      }
      tenantId = mappedTenant.tenantId;
      tenantSlug = mappedTenant.slug;
      tenantName = mappedTenant.name;
    }

    // 2. Consultar identidad del teléfono en Back-Reserva-Ya (/api/public/whatsapp/lookup)
    const lookupRes = await this.fetchFn(
      `${this.baseUrl}/api/public/whatsapp/lookup?phone=${encodeURIComponent(job.fromPhone)}`,
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

    // 3. Resolver el tenant destino solo si no vino fijado por phone_number_id (flujos locales/sin metadata)
    if (!tenantId) {
      tenantId = identity.tenantId;
      tenantSlug = identity.slug ?? job.tenantHintSlug ?? this.deps.defaultTenantSlug;
      tenantName = identity.tenantName ?? 'Barber Estilo';

      if (!tenantId && tenantSlug) {
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

    tenantSlug = tenantSlug ?? tenantId;
    tenantName = tenantName ?? tenantSlug;

    // 4. RF-4.6: Si el usuario solicita continuar en web o su sesión previa expiró, redirigir al portal
    const existingSession = this.conversations.get(this.conversationKey(tenantId, job.fromPhone));
    const nowMs = Date.parse(job.receivedAt) || Date.now();
    const wantsWebPortal = /portal web|seguir en web|abandonar|salir del chat/i.test(job.text);
    const sessionExpired =
      existingSession &&
      existingSession.state !== 'confirmed' &&
      existingSession.state !== 'redirected_to_web' &&
      Date.parse(existingSession.expiresAt) <= nowMs;

    if (wantsWebPortal || sessionExpired) {
      const portalUrl = `${this.frontBaseUrl}/t/${encodeURIComponent(tenantSlug)}`;
      this.upsertConversation({
        tenantId,
        tenantSlug,
        tenantName,
        fromPhone: job.fromPhone,
        metaPhoneNumberId: job.metaPhoneNumberId,
        messageId: job.whatsappMessageId,
        state: 'redirected_to_web',
        nowIso: new Date(nowMs).toISOString(),
      });
      const outbound: OutboundWhatsappMessage = {
        to: job.fromPhone,
        kind: 'text',
        text: `Puedes completar o gestionar tu reserva en ${tenantName} directamente desde nuestro portal web: ${portalUrl}`,
        metadata: { state: 'redirected_to_web', redirectUrl: portalUrl },
      };
      await this.emitOutbound(outbound, job.metaPhoneNumberId);
      return {
        whatsappMessageId: job.whatsappMessageId,
        intent: 'REDIRECT_TO_WEB',
        tenantId,
        conversationState: 'redirected_to_web',
        outboundMessage: outbound,
      };
    }

    this.upsertConversation({
      tenantId,
      tenantSlug,
      tenantName,
      fromPhone: job.fromPhone,
      metaPhoneNumberId: job.metaPhoneNumberId,
      messageId: job.whatsappMessageId,
      state: 'selecting_service',
      nowIso: new Date(nowMs).toISOString(),
    });

    // 5. Obtener catálogo de servicios y profesionales activos del tenant
    const [servicesRes, profsRes] = await Promise.all([
      this.fetchFn(`${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/services`),
      this.fetchFn(`${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/professionals`),
    ]);

    const services = (await servicesRes.json()) as ServiceCatalogItem[];
    const professionals = (await profsRes.json()) as ProfessionalCatalogItem[];

    // 6. Extraer intención del mensaje con Groq/AI
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
      await this.emitOutbound(outbound, job.metaPhoneNumberId);
      return {
        whatsappMessageId: job.whatsappMessageId,
        intent: extracted.intent,
        tenantId,
        conversationState: 'selecting_service',
        outboundMessage: outbound,
      };
    }

    const startTime =
      extracted.startTimeIso ??
      this.deps.defaultStartTimeIso ??
      new Date(Date.now() + 48 * 3_600_000).toISOString();

    // 7. Crear la reserva en Back-Reserva-Ya con source: 'whatsapp' e idempotencyKey ligada al wamid
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

    // 8. Generar la sesión y link de pago en Back-Reserva-Ya
    const sessionRes = await this.fetchFn(
      `${this.baseUrl}/api/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(bookingData.appointment.id)}/payment-session`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'advance' }),
      },
    );

    let paymentLink = `${this.frontBaseUrl}/t/${tenantSlug}/pay/${bookingData.appointment.id}`;
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

    this.upsertConversation({
      tenantId,
      tenantSlug,
      tenantName,
      fromPhone: job.fromPhone,
      metaPhoneNumberId: job.metaPhoneNumberId,
      messageId: job.whatsappMessageId,
      state: 'pending_payment',
      appointmentId: bookingData.appointment.id,
      paymentReference: bookingData.intent.paymentReference,
      paymentLink,
      nowIso: new Date(nowMs).toISOString(),
    });

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

    await this.emitOutbound(outbound, job.metaPhoneNumberId);

    return {
      whatsappMessageId: job.whatsappMessageId,
      intent: extracted.intent,
      tenantId,
      conversationState: 'pending_payment',
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
    metaPhoneNumberId?: string;
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
    await this.emitOutbound(outbound, input.metaPhoneNumberId);
    return outbound;
  }

  /**
   * PR #1 (9e21024) / B-06: Envía código de verificación OTP de 6 dígitos al usuario.
   */
  async sendVerificationCode(input: {
    phone: string;
    code: string;
    name?: string;
    metaPhoneNumberId?: string;
  }): Promise<OutboundWhatsappMessage> {
    const template = buildMetaVerificationCodeTemplate({
      toPhone: input.phone,
      code: input.code,
      clientName: input.name,
    });

    const outbound: OutboundWhatsappMessage = {
      to: input.phone,
      kind: 'template',
      text: template.text,
      templatePayload: template,
      metadata: {
        type: 'user.verify-code',
      },
    };
    await this.emitOutbound(outbound, input.metaPhoneNumberId);
    return outbound;
  }

  /**
   * Envío real hacia Meta WhatsApp Cloud API (Graph API).
   * - Si hay credenciales configuradas o `metaFetchImpl` inyectado, realiza `POST /{apiVersion}/{phoneNumberId}/messages`.
   * - En producción (`NODE_ENV === 'production'`), exige credenciales reales (fail-closed).
   */
  async emitOutbound(
    msg: OutboundWhatsappMessage,
    overridePhoneNumberId?: string,
  ): Promise<void> {
    const phoneNumberId = (overridePhoneNumberId ?? this.metaPhoneNumberId).trim();
    const accessToken = this.metaAccessToken;

    if (
      process.env.NODE_ENV === 'production' &&
      !this.deps.onOutboundMessage &&
      !this.metaFetchFn &&
      (!phoneNumberId || !accessToken)
    ) {
      throw new Error(
        'Meta WhatsApp error: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required in production',
      );
    }

    if (this.metaFetchFn || (phoneNumberId && accessToken)) {
      const fn = this.metaFetchFn ?? fetch;
      const cleanTo = msg.to.replace(/\D/g, '');
      const payload =
        msg.kind === 'template' && msg.templatePayload
          ? msg.templatePayload.metaApiBody
          : {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: cleanTo,
              type: 'text',
              text: {
                preview_url: true,
                body: msg.text,
              },
            };

      const url = `https://graph.facebook.com/${this.metaApiVersion}/${phoneNumberId || '000000'}/messages`;
      const response = await fn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { code?: number; message?: string };
      };

      if (!response.ok) {
        const errCode = body.error?.code
          ? `${response.status}/${body.error.code}`
          : String(response.status);
        throw new Error(
          `Meta Graph API error (${errCode}): ${body.error?.message ?? 'Unknown error'}`,
        );
      }

      msg.providerMessageId = body.messages?.[0]?.id;
    }

    this.sentMessages.push(msg);
    if (this.deps.onOutboundMessage) {
      await this.deps.onOutboundMessage(msg);
    }
  }
}
