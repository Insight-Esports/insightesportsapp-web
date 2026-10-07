// messages/media.ts — DMMediaService for the browser: encrypted photos and
// videos in DMs. The server stays a blind relay.
//
//   send:    prepare (photo → ≤1600px JPEG; video → MP4 as picked, ≤60 s,
//            poster frame from a <video>) → encrypt with a RANDOM per-file
//            AES-256-GCM key → POST /dm/uploads → PUT bytes to upload_url →
//            describe it inside the message envelope.
//   receive: GET /dm/uploads/:id → {url} (signed, 10 min) → fetch bytes with
//            no auth → decrypt with the envelope's key → object URL (memory).
//
// Feature-gated by /status → features.dm_media (photos) and dm_video.
"use client";

import { api, endpoints } from "@/lib/api";
import { b64decode, b64encode, importFileKey, openBytes, randomFileKey, sealBytes, type DMEnvelope } from "./crypto";
import type { DMMedia } from "./types";

export const MAX_IMAGE_SIDE = 1600;
export const IMAGE_QUALITY = 0.82;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50_000_000;
export const MAX_IMAGE_BYTES = 6_000_000;

export class DMMediaError extends Error {
  constructor(public kind: "unreadable" | "tooLong" | "tooLarge" | "exportFailed" | "uploadFailed" | "downloadFailed" | "badKey" | "expired" | "unavailable", message: string) {
    super(message); this.name = "DMMediaError";
  }
}

export interface PreparedMedia {
  kind: "image" | "video";
  bytes: Uint8Array;        // JPEG or MP4, plaintext
  mime: string;
  width: number;
  height: number;
  duration?: number;
  poster?: Uint8Array;      // video only, JPEG
  previewURL: string;       // object URL the sender's bubble shows at once
}

// ── Prepare ───────────────────────────────────────────────────────────────
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new DMMediaError("unreadable", "That file couldn't be read.")); };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new DMMediaError("exportFailed", "The photo couldn't be prepared."))), "image/jpeg", quality));
}

/** Downscale so the longest side is ≤ maxSide (never up), re-encode as JPEG. */
export async function prepareImage(file: Blob): Promise<PreparedMedia> {
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const f = longest > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longest : 1;
  const w = Math.max(1, Math.floor(img.naturalWidth * f));
  const h = Math.max(1, Math.floor(img.naturalHeight * f));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new DMMediaError("exportFailed", "The photo couldn't be prepared.");
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = await canvasToJpeg(canvas, IMAGE_QUALITY);
  if (jpeg.size > MAX_IMAGE_BYTES) throw new DMMediaError("tooLarge", `That file is too large (${Math.round(jpeg.size / 1_000_000)} MB).`);
  return { kind: "image", bytes: new Uint8Array(await jpeg.arrayBuffer()), mime: "image/jpeg", width: w, height: h, previewURL: URL.createObjectURL(jpeg) };
}

/** Videos are sent as picked (the browser can't transcode cheaply); length and size are enforced, a poster frame is grabbed at 0.5 s. */
export async function prepareVideo(file: File): Promise<PreparedMedia> {
  if (file.size > MAX_VIDEO_BYTES) throw new DMMediaError("tooLarge", `That file is too large (${Math.round(file.size / 1_000_000)} MB).`);
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new DMMediaError("unreadable", "That file couldn't be read."));
  });
  const seconds = video.duration;
  if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
    URL.revokeObjectURL(url);
    throw new DMMediaError("tooLong", `Videos are limited to ${MAX_VIDEO_SECONDS} seconds (this one is ${Math.round(seconds)}s).`);
  }
  // Poster at 0.5 s (or the start of a shorter clip)
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = Math.min(0.5, Math.max(0, (Number.isFinite(seconds) ? seconds : 1) / 2));
    setTimeout(resolve, 1500);
  });
  const w = video.videoWidth || 0, h = video.videoHeight || 0;
  let poster: Uint8Array | undefined;
  let previewURL = url;
  if (w > 0 && h > 0) {
    const f = Math.min(1, 480 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(w * f)); canvas.height = Math.max(1, Math.floor(h * f));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpeg = await canvasToJpeg(canvas, 0.7);
        poster = new Uint8Array(await jpeg.arrayBuffer());
        previewURL = URL.createObjectURL(jpeg);
      } catch { /* a poster is optional */ }
    }
  }
  return { kind: "video", bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type || "video/mp4", width: w, height: h, duration: Number.isFinite(seconds) ? seconds : undefined, poster, previewURL };
}

// ── Upload ────────────────────────────────────────────────────────────────
async function put(bytes: Uint8Array, conversationId: string, kind: "image" | "video"): Promise<string> {
  const ticket = await api.post<{ id?: string; upload_url?: string }>(endpoints.dmUploadCreate, {
    conversationId, contentType: "application/octet-stream", size: bytes.length, kind,
  });
  if (!ticket?.id || !ticket.upload_url) throw new DMMediaError("uploadFailed", "Upload failed (0).");
  let r: Response;
  try {
    r = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit });
  } catch {
    throw new DMMediaError("uploadFailed", "Upload failed (network).");
  }
  if (!r.ok) throw new DMMediaError("uploadFailed", `Upload failed (${r.status}).`);
  return ticket.id;
}

/** Encrypts and uploads one attachment (plus its poster) and returns the envelope that describes it. */
export async function uploadMedia(media: PreparedMedia, conversationId: string): Promise<DMEnvelope> {
  const { key, base64 } = await randomFileKey();
  const sealed = await sealBytes(media.bytes, key);
  const id = await put(sealed.bytes, conversationId, media.kind);
  const env: DMEnvelope = { t: media.kind, w: media.width, h: media.height, id, key: base64, nonce: b64encode(sealed.nonce), mime: media.mime, size: sealed.bytes.length };
  if (media.duration != null) env.dur = media.duration;
  if (media.poster) {
    const ps = await sealBytes(media.poster, key);
    env.poster = await put(ps.bytes, conversationId, "image");
    env.pnonce = b64encode(ps.nonce);
  }
  // Sender-side cache: what we just sent opens without a download.
  blobCache.set(id, sealed.bytes);
  decryptedCache.set(id, media.kind === "image" ? media.previewURL : URL.createObjectURL(new Blob([media.bytes as BlobPart], { type: media.mime })));
  if (env.poster && media.poster) decryptedCache.set(env.poster, URL.createObjectURL(new Blob([media.poster as BlobPart], { type: "image/jpeg" })));
  return env;
}

// ── Download ──────────────────────────────────────────────────────────────
const blobCache = new Map<string, Uint8Array>();      // encrypted bytes
const decryptedCache = new Map<string, string>();     // id → object URL
const inFlight = new Map<string, Promise<Uint8Array>>();

async function encryptedBlob(id: string): Promise<Uint8Array> {
  const hit = blobCache.get(id);
  if (hit) return hit;
  const running = inFlight.get(id);
  if (running) return running;
  const task = (async () => {
    let meta: { url?: string; download_url?: string };
    try {
      meta = await api.get(endpoints.dmUpload(id));
    } catch (e) {
      const code = (e as { code?: string | null })?.code ?? null;
      const status = (e as { status?: number })?.status ?? 0;
      if (status === 410 || code === "UPLOAD_EXPIRED") throw new DMMediaError("expired", "expired");
      if (status === 404) throw new DMMediaError("unavailable", "unavailable");
      throw new DMMediaError("downloadFailed", `Couldn't load media (${status}).`);
    }
    const url = meta?.url ?? meta?.download_url;
    if (!url) throw new DMMediaError("downloadFailed", "Couldn't load media (0).");
    const r = await fetch(url);
    if (!r.ok) throw new DMMediaError("downloadFailed", `Couldn't load media (${r.status}).`);
    return new Uint8Array(await r.arrayBuffer());
  })();
  inFlight.set(id, task);
  try {
    const bytes = await task;
    blobCache.set(id, bytes);
    return bytes;
  } finally {
    inFlight.delete(id);
  }
}

async function decryptedURL(id: string, keyBase64: string, nonceBase64: string, mime: string): Promise<string> {
  const hit = decryptedCache.get(id);
  if (hit) return hit;
  const blob = await encryptedBlob(id);
  const key = await importFileKey(keyBase64);
  const plain = await openBytes(blob, b64decode(nonceBase64), key);
  const url = URL.createObjectURL(new Blob([plain as BlobPart], { type: mime }));
  decryptedCache.set(id, url);
  return url;
}

/** Object URL of the decrypted image, or a video's poster. Throws DMMediaError("expired" | "unavailable" | …). */
export async function imageURL(media: DMMedia): Promise<string | null> {
  const id = media.kind === "image" ? media.blobId : media.posterId ?? "";
  const nonce = media.kind === "image" ? media.nonce : media.posterNonce ?? "";
  if (!id) return null;
  return decryptedURL(id, media.key, nonce, "image/jpeg");
}

/** Object URL of the decrypted, playable video. */
export async function videoURL(media: DMMedia): Promise<string> {
  return decryptedURL(media.blobId, media.key, media.nonce, media.mime || "video/mp4");
}

export function clearMediaCaches() {
  for (const u of decryptedCache.values()) URL.revokeObjectURL(u);
  decryptedCache.clear(); blobCache.clear();
}
