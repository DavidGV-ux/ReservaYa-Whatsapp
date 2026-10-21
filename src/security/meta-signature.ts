import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * B-04 / RNF-27: Calcula la firma HMAC-SHA256 de un payload de Meta en formato `sha256=<hex>`.
 */
export function signMetaPayload(rawBody: string | Buffer, appSecret: string): string {
  const hmac = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return `sha256=${hmac}`;
}

/**
 * B-04 / RNF-27: Valida de forma segura en tiempo constante el encabezado `X-Hub-Signature-256`
 * enviado por Meta WhatsApp Cloud API.
 */
export function verifyMetaSignature(input: {
  rawBody: string | Buffer | undefined;
  signatureHeader: string | undefined;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = input;
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = signMetaPayload(rawBody, appSecret);
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}
