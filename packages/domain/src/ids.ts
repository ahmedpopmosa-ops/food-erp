/**
 * Identifier helpers shared by the POS and the API (ADR-0005). Pure TypeScript so they behave the same in
 * Node, the browser and the Tauri webview.
 */

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function format(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parse(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new RangeError(`Invalid UUID: ${uuid}`);
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

/** Time-ordered UUIDv7 (RFC 9562): 48-bit unix ms timestamp + 74 random bits. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
}

/** Minimal SHA-1 (only for UUIDv5 name hashing — not a security primitive here). */
function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length * 8;
  const withPadding = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  withPadding.set(data);
  withPadding[data.length] = 0x80;
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 4, ml >>> 0);
  view.setUint32(withPadding.length - 8, Math.floor(ml / 2 ** 32));
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let off = 0; off < withPadding.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h >>> 0));
  return out;
}

/** Name-based UUIDv5 (RFC 9562): the same namespace + name always yields the same id. */
export function uuidv5(name: string, namespace: string): string {
  const ns = parse(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, ns.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
}

/** Id of a child record derived from its parent and a stable key (e.g. invoice line `line:3`). */
export const childId = (parentId: string, key: string) => uuidv5(key, parentId);
