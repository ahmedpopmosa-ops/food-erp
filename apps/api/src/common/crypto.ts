import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { config } from '../config';

/** 256-bit random token, URL-safe. */
export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Constant-time comparison of a presented token against a stored SHA-256 hex digest. */
export function matchesHash(presented: string, storedHash: string): boolean {
  const a = Buffer.from(sha256(presented), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Argon2id (the library default algorithm) with parameters from configuration (doc 05 §5). */
export const hashPassword = (password: string) =>
  hash(password, { memoryCost: config().ARGON2_MEMORY_KIB, timeCost: config().ARGON2_TIME_COST, parallelism: 1 });

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password; with no stored hash it still performs one verification against a dummy hash so
 * response time does not reveal whether an account exists or has a password.
 */
export async function verifyPassword(storedHash: string | null | undefined, password: string): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(storedHash, password).catch(() => false);
}
