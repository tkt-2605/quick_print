import crypto from 'node:crypto';

/** An error whose message is safe to show to the customer. */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export const newId = () => crypto.randomBytes(12).toString('base64url');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Short code the shopkeeper can call out, e.g. "K7M2Q". */
export function newOrderCode() {
  let s = '';
  for (const b of crypto.randomBytes(5)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

export const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
