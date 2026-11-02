import type { LeaseClaims, LicenseLease } from '@ros/contracts';

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fromB64Url = (s: string) =>
  fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

/**
 * Verifies an Ed25519-signed license lease with WebCrypto (Node and the Tauri webview). Returns the claims
 * when the signature is valid and the lease belongs to this device; null otherwise. Expiry is checked by the
 * caller against its clock.
 */
export async function verifyLease(
  publicKeySpkiB64: string,
  lease: LicenseLease,
  deviceId: string,
): Promise<LeaseClaims | null> {
  try {
    const key = await globalThis.crypto.subtle.importKey(
      'spki',
      fromB64(publicKeySpkiB64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const ok = await globalThis.crypto.subtle.verify(
      'Ed25519',
      key,
      fromB64Url(lease.signature),
      new TextEncoder().encode(lease.payload),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64Url(lease.payload))) as LeaseClaims;
    return claims.device_id === deviceId ? claims : null;
  } catch {
    return null;
  }
}
