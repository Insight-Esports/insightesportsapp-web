// messages/keys.ts — the browser's DMKeys.
//
// The app keeps one X25519 key pair per device in the Keychain. The backend
// encrypts every message to ONE recipient key version, so a browser that
// minted its own key would silently cut the phone off (and vice versa).
// Instead the browser is a LINKED device, WhatsApp Web style: the phone
// shows its current private key as a QR / code (Settings → Link web), the
// browser imports it and from then on reads and writes with the phone's key.
//
// Storage: IndexedDB, origin-bound. Nothing is ever published from here —
// the phone owns the key; this file only verifies that what was scanned is
// the account's current key (GET /dm/keys/:me) and remembers its version.
"use client";

import { b64decode, b64encode, publicKeyFor } from "./crypto";

const DB_NAME = "insight-dm";
const STORE = "keys";
const CURRENT = "current";

export interface StoredKey {
  privateKey: Uint8Array;  // 32 bytes
  publicKey: Uint8Array;   // 32 bytes
  version: number;         // the key_version the server knows this key as
  userId: string;          // the account the key belongs to
  linkedAt: number;
}

/** Link payload, as the phone shows it: INSIGHT-DM:1:<base64 private key>:<version> */
export const LINK_PREFIX = "INSIGHT-DM:1:";

export function parseLinkPayload(text: string): { privateKey: Uint8Array; version: number } | null {
  const t = text.trim();
  if (!t.toUpperCase().startsWith(LINK_PREFIX)) return null;
  const rest = t.slice(LINK_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep < 0) return null;
  const keyPart = rest.slice(0, sep);
  const version = parseInt(rest.slice(sep + 1), 10);
  if (!Number.isFinite(version) || version < 1) return null;
  let privateKey: Uint8Array;
  try { privateKey = b64decode(keyPart); } catch { return null; }
  if (privateKey.length !== 32) return null;
  return { privateKey, version };
}

export function buildLinkPayload(privateKey: Uint8Array, version: number): string {
  return `${LINK_PREFIX}${b64encode(privateKey)}:${version}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
    t.oncomplete = () => db.close();
  }));
}

let memo: StoredKey | null | undefined;

/** The linked key for this account, or null when the browser isn't linked. */
export async function loadKey(userId: string): Promise<StoredKey | null> {
  if (memo !== undefined && (memo === null || memo.userId === userId)) return memo;
  try {
    const k = (await tx<StoredKey | undefined>("readonly", (s) => s.get(CURRENT))) ?? null;
    memo = k && k.userId === userId ? k : null;
  } catch {
    memo = null;
  }
  return memo;
}

/** Every version the browser can open: the current one, plus older ones kept from earlier links. */
export async function loadKeyForVersion(userId: string, version: number): Promise<StoredKey | null> {
  const cur = await loadKey(userId);
  if (cur?.version === version) return cur;
  try {
    const k = (await tx<StoredKey | undefined>("readonly", (s) => s.get(`v${version}`))) ?? null;
    return k && k.userId === userId ? k : null;
  } catch {
    return null;
  }
}

export async function saveKey(k: StoredKey): Promise<void> {
  await tx("readwrite", (s) => s.put(k, CURRENT));
  await tx("readwrite", (s) => s.put(k, `v${k.version}`));
  memo = k;
}

export async function clearKeys(): Promise<void> {
  memo = undefined;
  try { await tx("readwrite", (s) => s.clear()); } catch { /* nothing to clear */ }
}

/** Derived public key as the server stores it (base64 raw). */
export function publicKeyBase64(privateKey: Uint8Array): string {
  return b64encode(publicKeyFor(privateKey));
}
