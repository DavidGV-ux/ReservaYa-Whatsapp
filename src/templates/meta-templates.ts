/**
 * B-06: Soporte de plantillas aprobadas de Meta (WABA) en español (texto + HTML + payload business-initiated).
 */
export interface BusinessTemplatePayload {
  templateName: 'reservaya_bienvenida_es' | 'reservaya_recibo_pago_es' | 'reservaya_recordatorio_cita_es';
  languageCode: 'es';
  text: string;
  html: string;
  metaApiBody: {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'template';
    template: {
      name: string;
      language: { code: 'es' };
      components: Array<{
        type: 'body';
        parameters: Array<{ type: 'text'; text: string }>;
      }>;
    };
  };
}

export function buildMetaWelcomeTemplate(input: {
  toPhone: string;
  clientName: string;
  tenantName: string;
}): BusinessTemplatePayload {
  const cleanPhone = input.toPhone.replace(/\D/g, '');
  const text = `Hola ${input.clientName}, te damos la bienvenida a ${input.tenantName} en ReservaYa. Responde este mensaje con el servicio y horario que deseas agendar.`;
  const html = `<!DOCTYPE html><html lang="es"><body><h2>¡Bienvenido(a) a ${input.tenantName}!</h2><p>Hola <strong>${input.clientName}</strong>, ya puedes agendar tus citas por WhatsApp y pagar tu anticipo con enlace seguro.</p></body></html>`;

  return {
    templateName: 'reservaya_bienvenida_es',
    languageCode: 'es',
    text,
    html,
    metaApiBody: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: 'reservaya_bienvenida_es',
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: input.clientName },
              { type: 'text', text: input.tenantName },
            ],
          },
        ],
      },
    },
  };
}

export function buildMetaPaymentReceiptTemplate(input: {
  toPhone: string;
  clientName: string;
  tenantName: string;
  serviceName: string;
  dateTimeFormatted: string;
  paymentReference: string;
  paidAmountFormatted: string;
}): BusinessTemplatePayload {
  const cleanPhone = input.toPhone.replace(/\D/g, '');
  const text =
    `✅ Cita confirmada en ${input.tenantName}.\n` +
    `Cliente: ${input.clientName}\n` +
    `Servicio: ${input.serviceName}\n` +
    `Fecha: ${input.dateTimeFormatted}\n` +
    `Referencia: ${input.paymentReference}\n` +
    `Anticipo pagado: ${input.paidAmountFormatted}`;

  const html =
    `<!DOCTYPE html><html lang="es"><body>` +
    `<h2>✅ Recibo de Pago y Confirmación — ${input.tenantName}</h2>` +
    `<p>Hola <strong>${input.clientName}</strong>, tu pago con referencia <code>${input.paymentReference}</code> por <strong>${input.paidAmountFormatted}</strong> fue aprobado para el servicio <strong>${input.serviceName}</strong> el <strong>${input.dateTimeFormatted}</strong>.</p>` +
    `</body></html>`;

  return {
    templateName: 'reservaya_recibo_pago_es',
    languageCode: 'es',
    text,
    html,
    metaApiBody: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: 'reservaya_recibo_pago_es',
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: input.clientName },
              { type: 'text', text: input.tenantName },
              { type: 'text', text: input.serviceName },
              { type: 'text', text: input.dateTimeFormatted },
              { type: 'text', text: input.paymentReference },
              { type: 'text', text: input.paidAmountFormatted },
            ],
          },
        ],
      },
    },
  };
}
