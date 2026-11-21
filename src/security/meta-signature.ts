import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Comparación en tiempo constante para secretos y firmas criptográficas
 * (mitiga ataques de timing — auditoría de seguridad 9e21024).
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * B-04 / RNF-27: Calcula la firma HMAC-SHA256 de un payload de Meta en formato `sha256=<hex>`.
 */
export function signMetaPayload(rawBody: string | Buffer, appSecret: string): string {
  const hmac = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return `sha256=${hmac}`;
}

/**
 * B-04 / RNF-27 / PR #1 (9e21024): Valida de forma segura en tiempo constante el encabezado
 * `X-Hub-Signature-256` enviado por Meta WhatsApp Cloud API.
 *
 * - Fail-closed: si no hay ningún secreto válido configurado, rechaza (`false`).
 * - Soporta rotación de doble secreto (`WHATSAPP_APP_SECRET` y `WHATSAPP_APP_SECRET_ALT`)
 *   aceptando `string | string[]`.
 */
export function verifyMetaSignature(input: {
  rawBody: string | Buffer | undefined;
  signatureHeader: string | undefined;
  appSecret: string | string[];
}): boolean {
  const { rawBody, signatureHeader, appSecret } = input;
  const secrets = (Array.isArray(appSecret) ? appSecret : [appSecret])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);

  if (!rawBody || !signatureHeader || secrets.length === 0) {
    return false;
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  for (const secret of secrets) {
    const expected = signMetaPayload(rawBody, secret);
    if (safeEqual(signatureHeader.trim(), expected)) {
      return true;
    }
  }
  return false;
}
