/**
 * PIN and password hashing with WebCrypto (browsers and Node 20+ alike: globalThis.crypto.subtle).
 *
 * Format, byte for byte the same as desktop-go/classroom/hash.go:
 *   "pbkdf2-sha256$<iterations>$<salt>$<hash>"   salt 16 bytes, hash 32 bytes, base64 without padding.
 * With a pepper, the PBKDF2 password is HMAC-SHA256(pepper, secret) instead of the secret.
 *
 * The class server hashes and checks PINs itself; this is for the browser side — checking a PIN on a
 * computer with no class server (a class file loaded on the PC), and the shared test vectors that keep
 * both sides in step. A PIN or password is never stored or logged in the clear.
 */

export const HASH_SCHEME = 'pbkdf2-sha256';
export const PIN_ITERATIONS = 100_000;
export const PASSWORD_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_ITER = 1_000;
const MAX_ITER = 5_000_000;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available (needs https or localhost in a browser, Node 20+)');
  return c.subtle;
}

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

/** Base64 without padding (btoa/atob exist in browsers and Node 16+). */
export function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, '');
}

export function b64decode(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]*$/.test(text)) return null;
  try {
    const bin = atob(text + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function passwordBytes(secret: string, pepper?: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (pepper === undefined || pepper.length === 0) return utf8(secret);
  const keyBytes = typeof pepper === 'string' ? utf8(pepper) : (new Uint8Array(pepper) as Uint8Array<ArrayBuffer>);
  const key = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, utf8(secret)));
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number, pepper?: string | Uint8Array): Promise<Uint8Array> {
  const base = await subtle().importKey('raw', await passwordBytes(secret, pepper), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

/** Hash with a given salt (tests and vectors); use hashSecret for real hashes. */
export async function hashWithSalt(secret: string, salt: Uint8Array, iterations: number, pepper?: string | Uint8Array): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER) throw new RangeError(`iterations out of range: ${iterations}`);
  const s = new Uint8Array(salt) as Uint8Array<ArrayBuffer>;
  return `${HASH_SCHEME}$${iterations}$${b64encode(s)}$${b64encode(await derive(secret, s, iterations, pepper))}`;
}

/** Hash a PIN or password with a fresh random salt. */
export async function hashSecret(secret: string, opts: { iterations?: number; pepper?: string | Uint8Array } = {}): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return hashWithSalt(secret, salt, opts.iterations ?? PIN_ITERATIONS, opts.pepper);
}

/** Same length → compare every byte (no early exit). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** Does secret match the stored hash? A malformed stored value is simply false. */
export async function verifySecret(stored: string, secret: string, pepper?: string | Uint8Array): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_SCHEME || !/^\d{1,7}$/.test(parts[1])) return false;
  const iter = Number(parts[1]);
  if (iter < MIN_ITER || iter > MAX_ITER) return false;
  const salt = b64decode(parts[2]);
  const want = b64decode(parts[3]);
  if (!salt || !want || salt.length === 0 || want.length !== KEY_BYTES) return false;
  try {
    return equalBytes(await derive(secret, salt, iter, pepper), want);
  } catch {
    return false;
  }
}

/** Exactly four ASCII digits. */
export function validPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** 0000-like or 1234-like (the server never issues these). */
export function weakPin(pin: string): boolean {
  let same = true;
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    same &&= d === 0;
    up &&= d === 1;
    down &&= d === -1;
  }
  return same || up || down;
}

/** A random 4-digit PIN (crypto random, unbiased), never a weak one. */
export function newPin(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] >= 4_294_960_000) continue; // 4 294 960 000 = 10 000 × 429 496: drop the uneven tail
    const pin = String(buf[0] % 10_000).padStart(4, '0');
    if (!weakPin(pin)) return pin;
  }
}
