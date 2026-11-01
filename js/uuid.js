// Client-side UUID generation following RFC 9562.
// Uses only the browser's Web Crypto API, so nothing ever leaves the page.

const cryptoApi = globalThis.crypto;

export const NAMESPACES = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
};

export const NIL = '00000000-0000-0000-0000-000000000000';
export const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomBytes(n) {
  return cryptoApi.getRandomValues(new Uint8Array(n));
}

export function bytesToUuid(b) {
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidToBytes(uuid) {
  if (!isValid(uuid)) throw new Error(`Invalid UUID: ${uuid}`);
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function isValid(uuid) {
  return typeof uuid === 'string' && UUID_RE.test(uuid);
}

function setVersionAndVariant(b, version) {
  b[6] = (b[6] & 0x0f) | (version << 4);
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562 variant (10xx)
  return b;
}

// ---------------------------------------------------------------------------
// v4: random
// ---------------------------------------------------------------------------
export function v4() {
  return bytesToUuid(setVersionAndVariant(randomBytes(16), 4));
}

// ---------------------------------------------------------------------------
// v1 / v6: Gregorian time based (100ns ticks since 1582-10-15)
// ---------------------------------------------------------------------------
const GREGORIAN_OFFSET_MS = 12219292800000n;
// Random node id with the multicast bit set, as RFC 9562 recommends when
// no real MAC address is used (and browsers can't read one anyway).
const nodeId = (() => {
  const n = randomBytes(6);
  n[0] |= 0x01;
  return n;
})();
let clockSeq = ((randomBytes(2)[0] << 8) | randomBytes(1)[0]) & 0x3fff;
let lastGregorian = 0n;

function nextGregorianTicks() {
  let ticks = (BigInt(Date.now()) + GREGORIAN_OFFSET_MS) * 10000n;
  if (ticks <= lastGregorian) {
    // Same millisecond (or clock went backwards): step forward one tick so
    // every UUID from this page is unique and ordered.
    ticks = lastGregorian + 1n;
  }
  lastGregorian = ticks;
  return ticks;
}

function writeClockSeqAndNode(b) {
  b[8] = 0x80 | ((clockSeq >> 8) & 0x3f);
  b[9] = clockSeq & 0xff;
  b.set(nodeId, 10);
}

export function v1() {
  const t = nextGregorianTicks();
  const timeLow = Number(t & 0xffffffffn);
  const timeMid = Number((t >> 32n) & 0xffffn);
  const timeHi = Number((t >> 48n) & 0x0fffn);
  const b = new Uint8Array(16);
  b[0] = timeLow >>> 24;
  b[1] = (timeLow >>> 16) & 0xff;
  b[2] = (timeLow >>> 8) & 0xff;
  b[3] = timeLow & 0xff;
  b[4] = timeMid >>> 8;
  b[5] = timeMid & 0xff;
  b[6] = 0x10 | (timeHi >>> 8);
  b[7] = timeHi & 0xff;
  writeClockSeqAndNode(b);
  return bytesToUuid(b);
}

export function v6() {
  const t = nextGregorianTicks();
  const timeHigh = Number((t >> 28n) & 0xffffffffn); // top 32 bits
  const timeMid = Number((t >> 12n) & 0xffffn); // next 16 bits
  const timeLow = Number(t & 0x0fffn); // last 12 bits
  const b = new Uint8Array(16);
  b[0] = timeHigh >>> 24;
  b[1] = (timeHigh >>> 16) & 0xff;
  b[2] = (timeHigh >>> 8) & 0xff;
  b[3] = timeHigh & 0xff;
  b[4] = timeMid >>> 8;
  b[5] = timeMid & 0xff;
  b[6] = 0x60 | (timeLow >>> 8);
  b[7] = timeLow & 0xff;
  writeClockSeqAndNode(b);
  return bytesToUuid(b);
}

// ---------------------------------------------------------------------------
// v7: Unix epoch milliseconds + random, sortable
// ---------------------------------------------------------------------------
let lastV7Ms = -1;
let v7Counter = 0; // 12-bit rand_a used as a counter within one millisecond

export function v7() {
  let ms = Date.now();
  if (ms > lastV7Ms) {
    lastV7Ms = ms;
    // Seed the counter in the lower half so there's room to increment.
    v7Counter = ((randomBytes(1)[0] << 3) | (randomBytes(1)[0] & 0x07)) & 0x7ff;
  } else {
    v7Counter++;
    if (v7Counter > 0xfff) {
      lastV7Ms++;
      v7Counter = 0;
    }
    ms = lastV7Ms;
  }
  const b = randomBytes(16);
  // 48-bit big-endian timestamp. Split to stay within safe integer maths.
  const hi = Math.floor(ms / 2 ** 16);
  const lo = ms % 2 ** 16;
  b[0] = (hi >>> 24) & 0xff;
  b[1] = (hi >>> 16) & 0xff;
  b[2] = (hi >>> 8) & 0xff;
  b[3] = hi & 0xff;
  b[4] = lo >>> 8;
  b[5] = lo & 0xff;
  b[6] = 0x70 | (v7Counter >>> 8);
  b[7] = v7Counter & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

// ---------------------------------------------------------------------------
// v3 / v5: name based (MD5 / SHA-1)
// ---------------------------------------------------------------------------
function nameBytes(namespace, name) {
  const ns = uuidToBytes(namespace);
  const nm = new TextEncoder().encode(name);
  const buf = new Uint8Array(ns.length + nm.length);
  buf.set(ns);
  buf.set(nm, ns.length);
  return buf;
}

export async function v5(name, namespace = NAMESPACES.DNS) {
  if (!cryptoApi?.subtle) {
    throw new Error('SHA-1 needs a secure context (https or localhost).');
  }
  const hash = new Uint8Array(await cryptoApi.subtle.digest('SHA-1', nameBytes(namespace, name)));
  return bytesToUuid(setVersionAndVariant(hash.slice(0, 16), 5));
}

export function v3(name, namespace = NAMESPACES.DNS) {
  const hash = md5(nameBytes(namespace, name));
  return bytesToUuid(setVersionAndVariant(hash, 3));
}

// Compact MD5 (RFC 1321). Web Crypto doesn't offer MD5, so v3 needs its own.
function md5(input) {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);

  const len = input.length;
  const padded = new Uint8Array(((len + 8) >> 6) * 64 + 64);
  padded.set(input);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 2 ** 29), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return out;
}

// ---------------------------------------------------------------------------
// Inspect an existing UUID
// ---------------------------------------------------------------------------
export function inspect(uuid) {
  const u = uuid.trim().replace(/^[{(]|[})]$/g, '').replace(/^urn:uuid:/i, '');
  const compact = /^[0-9a-f]{32}$/i.test(u)
    ? `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`
    : u;
  if (!isValid(compact)) return { valid: false };
  const norm = compact.toLowerCase();
  if (norm === NIL) return { valid: true, uuid: norm, version: 'Nil' };
  if (norm === MAX) return { valid: true, uuid: norm, version: 'Max' };

  const b = uuidToBytes(norm);
  const version = b[6] >> 4;
  const variantBits = b[8] >> 5;
  const variant =
    (variantBits & 0b100) === 0 ? 'NCS (reserved)'
      : (variantBits & 0b110) === 0b100 ? 'RFC 9562'
        : (variantBits & 0b111) === 0b110 ? 'Microsoft (reserved)'
          : 'Future (reserved)';

  let timestamp = null;
  const hex = norm.replace(/-/g, '');
  if (variant === 'RFC 9562') {
    if (version === 7) {
      timestamp = new Date(parseInt(hex.slice(0, 12), 16));
    } else if (version === 1 || version === 6) {
      const t = version === 1
        ? BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`)
        : BigInt(`0x${hex.slice(0, 12)}${hex.slice(13, 16)}`);
      timestamp = new Date(Number(t / 10000n - GREGORIAN_OFFSET_MS));
    }
  }
  return { valid: true, uuid: norm, version, variant, timestamp };
}
