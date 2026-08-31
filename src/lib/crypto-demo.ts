/*
 * Demo-scale cryptography for teaching. RSA keys here are intentionally
 * tiny (~256-bit n) so every intermediate value fits on screen.
 * AES-GCM and SHA-256 use the browser's real Web Crypto API.
 */

export type CryptoMethod = "rsa" | "aes" | "hash";

export const METHOD_LABELS: Record<CryptoMethod, string> = {
  rsa: "RSA (toy 256-bit)",
  aes: "AES-256-GCM",
  hash: "SHA-256 (hash only)",
};

export interface CryptoRun {
  method: CryptoMethod;
  /** Log lines revealed one per animation tick. */
  encSteps: string[];
  /** Key/value artifacts shown after the run. */
  artifacts: { label: string; value: string }[];
  /** Runs the reverse operation, returning steps + verification outcome. */
  reverse: () => Promise<ReverseResult>;
  reverseLabel: string;
}

export interface ReverseResult {
  steps: string[];
  revealed: string;
  ok: boolean;
  verdict: string;
}

/* ---------- BigInt helpers ---------- */

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

function randomBigIntBelow(limit: bigint): bigint {
  const bytes = Math.ceil(limit.toString(2).length / 8);
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  return n % limit;
}

/** Miller-Rabin primality test, k random rounds. */
function isProbablePrime(n: bigint, k = 16): boolean {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  // n - 1 = 2^r * d
  let d = n - 1n;
  let r = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  for (let i = 0; i < k; i++) {
    const a = 2n + randomBigIntBelow(n - 3n);
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let j = 0n; j < r - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function randomPrime(bits: number): { prime: bigint; tested: number } {
  let tested = 0;
  for (;;) {
    // Random odd number with the top bit set.
    let candidate = randomBigIntBelow(1n << BigInt(bits));
    candidate |= 1n << BigInt(bits - 1);
    candidate |= 1n;
    tested++;
    if (isProbablePrime(candidate)) return { prime: candidate, tested };
  }
}

/* ---------- Encoding helpers ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bigintToBytes(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = n;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/* ---------- RSA ---------- */

async function runRsa(message: string): Promise<CryptoRun> {
  const steps: string[] = [];
  const msgBytes = enc.encode(message);

  const { prime: p, tested: testedP } = randomPrime(128);
  steps.push(`Generating prime p — Miller-Rabin accepted after ${testedP} candidate(s)`);
  steps.push(`p = ${p}`);
  const { prime: q, tested: testedQ } = randomPrime(128);
  while (q === p) {
    // Vanishingly unlikely, but keep p ≠ q honest.
    return runRsa(message);
  }
  steps.push(`Generating prime q — Miller-Rabin accepted after ${testedQ} candidate(s)`);
  steps.push(`q = ${q}`);

  const n = p * q;
  steps.push(`Computing modulus n = p × q (${n.toString(2).length} bits)`);
  steps.push(`n = ${n}`);
  const phi = (p - 1n) * (q - 1n);
  steps.push(`Computing φ(n) = (p−1)(q−1) = ${phi}`);

  let e = 65537n;
  if (gcd(e, phi) !== 1n) e = 257n;
  if (gcd(e, phi) !== 1n) e = 17n;
  steps.push(`Choosing public exponent e = ${e} (gcd(e, φ(n)) = 1)`);
  const d = modInverse(e, phi);
  steps.push(`Computing private exponent d = e⁻¹ mod φ(n)`);
  steps.push(`d = ${d}`);

  // Block-encrypt the UTF-8 message: each block must be < n.
  const blockBytes = Math.floor((n.toString(2).length - 1) / 8);
  const blocks: bigint[] = [];
  const lens: number[] = [];
  for (let i = 0; i < msgBytes.length; i += blockBytes) {
    const chunk = msgBytes.slice(i, i + blockBytes);
    lens.push(chunk.length);
    let m = 0n;
    for (const b of chunk) m = (m << 8n) | BigInt(b);
    blocks.push(m);
  }
  steps.push(
    `Splitting message into ${blocks.length} numeric block(s) of ≤ ${blockBytes} bytes (m < n)`,
  );
  const cipherBlocks = blocks.map((m) => modPow(m, e, n));
  steps.push(`Encrypting each block: c = m^e mod n (${cipherBlocks.length} block(s))`);
  steps.push(`Ciphertext ready — ${cipherBlocks.length} big-integer block(s)`);

  const artifacts = [
    { label: "p", value: p.toString() },
    { label: "q", value: q.toString() },
    { label: "n", value: n.toString() },
    { label: "φ(n)", value: phi.toString() },
    { label: "e", value: e.toString() },
    { label: "d", value: d.toString() },
    { label: "ciphertext", value: truncate(cipherBlocks.join(" · "), 220) },
  ];

  return {
    method: "rsa",
    encSteps: steps,
    artifacts,
    reverseLabel: "Decrypt",
    reverse: async () => {
      const rsteps: string[] = [];
      rsteps.push(`Decrypting ${cipherBlocks.length} block(s): m = c^d mod n`);
      const plainBlocks = cipherBlocks.map((c) => modPow(c, d, n));
      // Restore each block at its true length — a short final block must not
      // be padded to full block size or the reassembly offsets shift.
      const out = new Uint8Array(msgBytes.length);
      let off = 0;
      plainBlocks.forEach((m, i) => {
        out.set(bigintToBytes(m, lens[i]!), off);
        off += lens[i]!;
      });
      const revealed = dec.decode(out);
      rsteps.push(`Reassembled ${msgBytes.length} byte(s) of plaintext`);
      const ok = revealed === message;
      rsteps.push(ok ? "Plaintext matches the original message ✓" : "Plaintext mismatch ✗");
      return {
        steps: rsteps,
        revealed,
        ok,
        verdict: ok
          ? "Recovered text matches the original message."
          : "Recovered text does NOT match the original.",
      };
    },
  };
}

/* ---------- AES-256-GCM ---------- */

async function runAes(message: string): Promise<CryptoRun> {
  const steps: string[] = [];
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  steps.push("Generating key — crypto.subtle.generateKey(AES-GCM, 256-bit)");
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  steps.push(`Key (hex) = ${bytesToHex(rawKey)}`);
  steps.push(`Plaintext = "${truncate(message, 80)}"`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  steps.push(`Random 96-bit IV = ${bytesToHex(iv)}`);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(message));
  const ct = new Uint8Array(ctBuf);
  steps.push(`Encrypting — crypto.subtle.encrypt produced ${ct.length} bytes (incl. GCM auth tag)`);
  steps.push("Ciphertext ready");

  const artifacts = [
    { label: "key (hex)", value: bytesToHex(rawKey) },
    { label: "iv (hex)", value: bytesToHex(iv) },
    { label: "ciphertext (base64)", value: truncate(bytesToBase64(ct), 240) },
  ];

  return {
    method: "aes",
    encSteps: steps,
    artifacts,
    reverseLabel: "Decrypt",
    reverse: async () => {
      const rsteps: string[] = [];
      rsteps.push("Decrypting — crypto.subtle.decrypt(AES-GCM) with same key + IV");
      const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
      const revealed = dec.decode(ptBuf);
      rsteps.push("GCM auth tag verified — ciphertext was not tampered with");
      const ok = revealed === message;
      rsteps.push(ok ? "Plaintext matches the original message ✓" : "Plaintext mismatch ✗");
      return {
        steps: rsteps,
        revealed,
        ok,
        verdict: ok
          ? "Decrypted text matches the original message."
          : "Decrypted text does NOT match the original.",
      };
    },
  };
}

/* ---------- SHA-256 ---------- */

async function runHash(message: string): Promise<CryptoRun> {
  const steps: string[] = [];
  steps.push(`Plaintext = "${truncate(message, 80)}"`);
  steps.push("Hashing — crypto.subtle.digest(SHA-256)");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(message));
  const hex = bytesToHex(digest);
  steps.push(`Digest = ${hex}`);
  steps.push("One-way: there is no key and nothing to decrypt");

  const artifacts = [
    { label: "algorithm", value: "SHA-256" },
    { label: "digest (hex)", value: hex },
  ];

  return {
    method: "hash",
    encSteps: steps,
    artifacts,
    reverseLabel: "Verify integrity",
    reverse: async () => {
      const rsteps: string[] = [];
      const current = (document.querySelector<HTMLTextAreaElement>("#sr-message")?.value ?? message);
      rsteps.push("Re-hashing the current message box contents with SHA-256");
      const again = bytesToHex(await crypto.subtle.digest("SHA-256", enc.encode(current)));
      const ok = again === hex;
      rsteps.push(`Fresh digest = ${again}`);
      rsteps.push(ok ? "Digests match — message unchanged ✓" : "Digests differ — message was modified ✗");
      return {
        steps: rsteps,
        revealed: again,
        ok,
        verdict: ok
          ? "Integrity verified: the message still matches the digest."
          : "Integrity check FAILED: the message changed since hashing.",
      };
    },
  };
}

export function runCrypto(method: CryptoMethod, message: string): Promise<CryptoRun> {
  if (method === "rsa") return runRsa(message);
  if (method === "aes") return runAes(message);
  return runHash(message);
}
