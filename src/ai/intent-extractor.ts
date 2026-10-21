export interface ServiceCatalogItem {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationMinutes: number;
}

export interface ProfessionalCatalogItem {
  id: string;
  name: string;
  serviceIds: string[];
}

export interface ExtractedBookingIntent {
  intent: 'BOOK_APPOINTMENT' | 'CHECK_AVAILABILITY' | 'CANCEL_APPOINTMENT' | 'GREETING';
  serviceId?: string;
  serviceName?: string;
  professionalId?: string;
  professionalName?: string;
  requestedHourBogota?: number;
  startTimeIso?: string;
  clientName?: string;
  clientEmail?: string;
  confidence: number;
}

export interface AiIntentExtractorOptions {
  groqApiKey?: string;
  groqModel?: string;
  fetchImpl?: typeof fetch;
}

/**
 * B-04 / F-06: Extractor de intención conversacional mediante Groq AI (Llama 3.3)
 * con respaldo determinista para pruebas E2E reproducibles sin red externa.
 */
export class GroqAiIntentExtractor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(options: AiIntentExtractorOptions = {}) {
    this.apiKey = options.groqApiKey ?? process.env.GROQ_API_KEY ?? '';
    this.model = options.groqModel ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    this.fetchImpl = options.fetchImpl;
  }

  async extractIntent(input: {
    text: string;
    profileName?: string;
    services: ServiceCatalogItem[];
    professionals: ProfessionalCatalogItem[];
    defaultStartTimeIso?: string;
  }): Promise<ExtractedBookingIntent> {
    if (this.apiKey && (this.fetchImpl || !this.apiKey.startsWith('gsk_test_local'))) {
      try {
        const fn = this.fetchImpl ?? fetch;
        const response = await fn('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'Extrae la intención de reserva de WhatsApp en JSON con las claves: intent (BOOK_APPOINTMENT|CHECK_AVAILABILITY|CANCEL_APPOINTMENT|GREETING), serviceId, serviceName, professionalId, professionalName, startTimeIso, clientName, clientEmail, confidence. Catálogo de servicios: ' +
                  JSON.stringify(input.services) +
                  '. Profesionales: ' +
                  JSON.stringify(input.professionals),
              },
              {
                role: 'user',
                content: input.text,
              },
            ],
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            const parsed = JSON.parse(raw) as ExtractedBookingIntent;
            if (parsed.intent) {
              return parsed;
            }
          }
        }
      } catch {
        // Fallback al motor determinista local si la API de IA no responde
      }
    }

    return this.deterministicExtract(input);
  }

  private deterministicExtract(input: {
    text: string;
    profileName?: string;
    services: ServiceCatalogItem[];
    professionals: ProfessionalCatalogItem[];
    defaultStartTimeIso?: string;
  }): ExtractedBookingIntent {
    const normalized = input.text.toLowerCase();
    const isBooking =
      /reservar|agendar|cita|quiero|turno|corte|barba/.test(normalized) &&
      !/cancelar/.test(normalized);

    if (/cancelar/.test(normalized)) {
      return { intent: 'CANCEL_APPOINTMENT', confidence: 0.92 };
    }

    // Ordenar de más específico (nombre más largo) a más general para coincidir "Corte + barba" antes que "Corte"
    const sortedServices = [...input.services].sort((a, b) => b.name.length - a.name.length);
    const matchedService =
      sortedServices.find((s) => normalized.includes(s.name.toLowerCase())) ??
      input.services[0];

    const matchedProfessional =
      input.professionals.find((p) => {
        const firstToken = p.name.toLowerCase().split(' ')[0] ?? p.name.toLowerCase();
        return normalized.includes(firstToken);
      }) ??
      input.professionals.find((p) =>
        matchedService ? p.serviceIds.includes(matchedService.id) : true,
      ) ??
      input.professionals[0];

    const emailMatch = input.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const hourMatch = normalized.match(/(\d{1,2})\s*(am|pm|:00|:30)/);
    let hour = 10;
    if (hourMatch) {
      const rawHour = Number(hourMatch[1]);
      const suffix = hourMatch[2];
      hour = suffix === 'pm' && rawHour < 12 ? rawHour + 12 : rawHour;
    }

    return {
      intent: isBooking ? 'BOOK_APPOINTMENT' : 'GREETING',
      serviceId: matchedService?.id,
      serviceName: matchedService?.name,
      professionalId: matchedProfessional?.id,
      professionalName: matchedProfessional?.name,
      requestedHourBogota: hour,
      startTimeIso: input.defaultStartTimeIso,
      clientName: input.profileName ?? 'Cliente WhatsApp',
      clientEmail: emailMatch?.[0] ?? 'cliente.whatsapp@reservaya.co',
      confidence: 0.95,
    };
  }
}
