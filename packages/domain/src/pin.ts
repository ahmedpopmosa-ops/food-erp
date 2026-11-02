/**
 * POS PIN hashing with PBKDF2-SHA256 via WebCrypto, so the server (setting a PIN) and the POS (verifying it
 * offline, in Node or the Tauri webview) share one implementation. Format:
 * `pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>`.
 *
 * A 4–6 digit PIN is a weak secret whatever the hash: it only unlocks POS permissions, attempts are locked out
 * locally, and hashes are only sent to devices of the employee's branches (ADR-0009, ADR-0013).
 */

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const PIN_PATTERN = /^\d{4,6}$/;

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, iterations = 600_000): Promise<string> {
  if (!PIN_PATTERN.test(pin)) throw new RangeError('PIN must be 4-6 digits');
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(await derive(pin, salt, iterations))}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iter || !salt || !hash || !PIN_PATTERN.test(pin)) return false;
  const actual = await derive(pin, unb64(salt), Number(iter));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
