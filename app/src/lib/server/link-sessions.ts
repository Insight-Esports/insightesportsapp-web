// link-sessions.ts — the in-memory relay behind "Link web" (WhatsApp Web model).
//
// The browser creates a session (its ephemeral X25519 public key + the account
// it is signed in as) and shows the session id in a QR code. The phone scans
// it and, after the server has checked that the phone's JWT belongs to the
// SAME account, drops off the DM private key sealed to the browser's ephemeral
// key. The browser polls, takes the sealed blob (one-shot) and opens it
// locally. The server only ever sees ciphertext: it relays, it cannot read.
//
// Single Railway instance → a Map is enough. Sessions live 5 minutes, are
// swept on every access, and the store is capped so a flood can't grow it.
import "server-only";
import { randomBytes } from "node:crypto";

export const LINK_TTL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 500;

export interface LinkDelivery {
  phonePublicKey: string; // base64 raw X25519 public key (the phone's ephemeral key)
  nonce: string;          // base64, 12 bytes
  ciphertext: string;     // base64, AES-GCM ciphertext || tag
  keyVersion: number;     // the phone's current DM key version
}

export interface LinkSession {
  id: string;
  userId: string;         // the account signed in on the web
  webPublicKey: string;   // base64 raw X25519 public key (the browser's ephemeral key)
  createdAt: number;
  expiresAt: number;
  delivery: LinkDelivery | null;
}

const sessions = new Map<string, LinkSession>();

function sweep(now = Date.now()) {
  for (const [id, s] of sessions) if (s.expiresAt <= now) sessions.delete(id);
}

/** 128 random bits, base64url (22 chars, no padding). */
export function newLinkId(): string {
  return randomBytes(16).toString("base64url");
}

export function createLinkSession(userId: string, webPublicKey: string): LinkSession {
  const now = Date.now();
  sweep(now);
  if (sessions.size >= MAX_SESSIONS) {
    // Drop the oldest so the store never grows past the cap.
    const oldest = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) sessions.delete(oldest.id);
  }
  const s: LinkSession = { id: newLinkId(), userId, webPublicKey, createdAt: now, expiresAt: now + LINK_TTL_MS, delivery: null };
  sessions.set(s.id, s);
  return s;
}

/** The live session with that id, or null when unknown / expired. */
export function getLinkSession(id: string): LinkSession | null {
  sweep();
  return sessions.get(id) ?? null;
}

/** The phone's drop-off. "unknown" = no such (live) session; "delivered" = already done. */
export function deliverLinkSession(id: string, delivery: LinkDelivery): LinkSession | "unknown" | "delivered" {
  const s = getLinkSession(id);
  if (!s) return "unknown";
  if (s.delivery) return "delivered";
  s.delivery = delivery;
  return s;
}

export function deleteLinkSession(id: string): void {
  sessions.delete(id);
}
