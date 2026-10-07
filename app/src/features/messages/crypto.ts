// messages/crypto.ts — the browser half of DMCrypto (DirectMessages.swift).
//
// Recipe, identical to the app (backend/direct-messages-spec.md):
//   x25519-hkdf-sha256+aes-256-gcm
//   key   = HKDF-SHA256(sharedSecret, salt: ∅, info: "insight-dm-v1", 32 bytes)
//   wire  = base64(ciphertext + tag), base64(nonce)
//   plain = JSON envelope {"t":"text","body":"…"} (links / media descriptors too)
//
// X25519 + HKDF come from @noble (pure JS, audited) so every browser agrees;
// AES-256-GCM is WebCrypto, whose output is ciphertext||tag — exactly the
// wire format CryptoKit produces.
"use client";

import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const DM_ALGORITHM = "x25519-hkdf-sha256+aes-256-gcm";
const HKDF_INFO = new TextEncoder().encode("insight-dm-v1");

// ── base64 ─────────────────────────────────────────────────────────────────
export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64decode(s: string): Uint8Array {
  const clean = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** What rides inside the ciphertext (DMEnvelope). */
export interface DMEnvelope {
  t: "text" | "link" | "image" | "video" | string;
  body?: string;
  url?: string;
  w?: number;
  h?: number;
  // attachments
  id?: string;
  key?: string;     // base64, 32 bytes — the per-file key
  nonce?: string;   // base64, 12 bytes — the blob's nonce
  mime?: string;
  size?: number;
  dur?: number;
  poster?: string;  // video: upload id of the poster frame (same key)
  pnonce?: string;  // video: the poster blob's nonce
}

export class DMCryptoError extends Error {
  constructor(public kind: "badKey" | "badCiphertext" | "badEnvelope") { super(kind); this.name = "DMCryptoError"; }
}

// ── Keys ───────────────────────────────────────────────────────────────────
export function publicKeyFor(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

export function randomPrivateKey(): Uint8Array {
  return x25519.utils.randomSecretKey();
}

/** HKDF-SHA256 over the X25519 shared secret → an AES-256-GCM key. */
export async function deriveSymmetricKey(myPrivateKey: Uint8Array, theirPublicKeyBase64: string): Promise<CryptoKey> {
  let theirPub: Uint8Array;
  try { theirPub = b64decode(theirPublicKeyBase64); } catch { throw new DMCryptoError("badKey"); }
  if (theirPub.length !== 32 || myPrivateKey.length !== 32) throw new DMCryptoError("badKey");
  let shared: Uint8Array;
  try { shared = x25519.getSharedSecret(myPrivateKey, theirPub); } catch { throw new DMCryptoError("badKey"); }
  const raw = hkdf(sha256, shared, new Uint8Array(0), HKDF_INFO, 32);
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** A random per-file key (media) as a CryptoKey plus its base64 form. */
export async function randomFileKey(): Promise<{ key: CryptoKey; base64: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { key, base64: b64encode(raw) };
}

export async function importFileKey(base64: string): Promise<CryptoKey> {
  const raw = b64decode(base64);
  if (raw.length !== 32) throw new DMCryptoError("badKey");
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["decrypt", "encrypt"]);
}

// ── Seal / open ────────────────────────────────────────────────────────────
/** Bytes → (ciphertext+tag, nonce). The nonce is 12 random bytes. */
export async function sealBytes(plain: Uint8Array, key: CryptoKey): Promise<{ bytes: Uint8Array; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, plain as BufferSource));
  return { bytes, nonce };
}

export async function openBytes(bytes: Uint8Array, nonce: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  if (bytes.length <= 16 || nonce.length !== 12) throw new DMCryptoError("badCiphertext");
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 }, key, bytes as BufferSource));
  } catch {
    throw new DMCryptoError("badCiphertext");
  }
}

/** Plaintext envelope → (ciphertext+tag, nonce), both base64 — DMCrypto.seal. */
export async function sealEnvelope(envelope: DMEnvelope, key: CryptoKey): Promise<{ ciphertext: string; nonce: string }> {
  const plain = new TextEncoder().encode(JSON.stringify(envelope));
  const { bytes, nonce } = await sealBytes(plain, key);
  return { ciphertext: b64encode(bytes), nonce: b64encode(nonce) };
}

/** DMCrypto.open. */
export async function openEnvelope(ciphertext: string, nonce: string, key: CryptoKey): Promise<DMEnvelope> {
  let wire: Uint8Array, n: Uint8Array;
  try { wire = b64decode(ciphertext); n = b64decode(nonce); } catch { throw new DMCryptoError("badCiphertext"); }
  const plain = await openBytes(wire, n, key);
  try {
    const env = JSON.parse(new TextDecoder().decode(plain));
    if (!env || typeof env !== "object" || typeof env.t !== "string") throw new Error();
    return env as DMEnvelope;
  } catch {
    throw new DMCryptoError("badEnvelope");
  }
}
