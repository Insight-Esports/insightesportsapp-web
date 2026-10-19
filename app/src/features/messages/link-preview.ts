// messages/link-preview.ts — LinkPreviewService.swift for the browser.
//
// Rich cards for links in DMs (TikToks, Reels, YouTube, tweets, anything).
//
//   TikTok, YouTube  → their public oEmbed endpoints, straight from the
//                      browser: no server hop, nothing logged anywhere. A
//                      CORS or network miss falls through to the server.
//   Short share links (tiktok.com/t/…, vm.tiktok.com, vt.tiktok.com, t.co)
//                    → the server: a browser can't follow a cross-origin
//                      redirect to learn the canonical URL; services/
//                      linkPreview.js does (manual hops) and answers with
//                      web_url = the resolved page.
//   Everything else  → GET /api/links/preview?url= through /api/backend,
//     (or an oEmbed miss)  which answers {title, author, thumbnail_url,
//                      app_url, web_url}, or 404 NO_PREVIEW → plain card.
//
// Opening: the web has no native-app hop — web_url (or the URL itself) in a
// new tab. app_url schemes are never emitted here.
//
// Cached per URL in a module Map for the page's lifetime: a thread full of
// links renders from cache on every reopen of the pane.
"use client";

import { useEffect, useState } from "react";
import { api, endpoints } from "@/lib/api";

export interface LinkPreview {
  title: string | null;
  author: string | null;
  thumbnail: string | null;   // https image URL (the backend's /img proxy form is fine: imageSrc() rewrites it)
  webURL: string;             // canonical web URL — what a click opens
}

/** A card with nothing to show but the host: the plain-link fallback. */
export function previewIsEmpty(p: LinkPreview | null | undefined): boolean {
  return !p || (p.title == null && p.author == null && p.thumbnail == null);
}

const TTL = 7 * 86_400_000;
/** A plain card (no title/thumbnail) is retried sooner — the service may have been slow or offline. */
const EMPTY_TTL = 10 * 60_000;

const cache = new Map<string, { at: number; preview: LinkPreview }>();
const inFlight = new Map<string, Promise<LinkPreview>>();
const listeners = new Set<(url: string) => void>();

export function cachedPreview(url: string): LinkPreview | null {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > (previewIsEmpty(hit.preview) ? EMPTY_TTL : TTL)) return null;
  return hit.preview;
}

/** Starts a fetch if nothing (fresh) is cached. Safe to call on every mount. */
export function warmPreview(url: string): Promise<LinkPreview> {
  const have = cachedPreview(url);
  if (have) return Promise.resolve(have);
  const running = inFlight.get(url);
  if (running) return running;
  const task = fetchPreview(url).then((p) => {
    cache.set(url, { at: Date.now(), preview: p });
    inFlight.delete(url);
    listeners.forEach((l) => { try { l(url); } catch { /* listener bug */ } });
    return p;
  });
  inFlight.set(url, task);
  return task;
}

/** The preview for a URL, re-rendering when it lands. null while loading. */
export function useLinkPreview(url: string): LinkPreview | null {
  const [preview, setPreview] = useState<LinkPreview | null>(() => cachedPreview(url));
  useEffect(() => {
    let active = true;
    const have = cachedPreview(url);
    setPreview(have);
    if (have) return;
    const onLanded = (u: string) => { if (active && u === url) setPreview(cachedPreview(url)); };
    listeners.add(onLanded);
    void warmPreview(url);
    return () => { active = false; listeners.delete(onLanded); };
  }, [url]);
  return preview;
}

// ── Fetch ─────────────────────────────────────────────────────────────────
/** Share-sheet links are short redirectors (tiktok.com/t/…, vm.tiktok.com;
 *  youtu.be is fine — oEmbed takes it). The browser can't follow a
 *  cross-origin redirect, so these go to the server, which can. */
export function isShortLink(u: URL): boolean {
  const h = u.host.toLowerCase();
  return h === "vm.tiktok.com" || h === "vt.tiktok.com" || h === "t.co" || (h.includes("tiktok.com") && u.pathname.startsWith("/t/"));
}

async function fetchPreview(original: string): Promise<LinkPreview> {
  let u: URL;
  try { u = new URL(original); } catch { return { title: null, author: null, thumbnail: null, webURL: original }; }
  const host = u.host.toLowerCase();
  if (!isShortLink(u)) {
    if (host.includes("tiktok.com")) {
      const p = await oEmbed("https://www.tiktok.com/oembed?url=", u);
      if (p) return p;
    }
    if (host.includes("youtu")) {
      const p = await oEmbed("https://www.youtube.com/oembed?format=json&url=", u);
      if (p) return p;
    }
  }
  // Server: Instagram, X, short links, and any oEmbed miss.
  try {
    const r = await api.get<{ title?: string | null; author?: string | null; thumbnail_url?: string | null; thumbnail?: string | null; web_url?: string | null }>(endpoints.linkPreview(u.href));
    const web = typeof r?.web_url === "string" && r.web_url ? r.web_url : u.href;
    return { title: r?.title ?? null, author: r?.author ?? null, thumbnail: r?.thumbnail_url ?? r?.thumbnail ?? null, webURL: web };
  } catch {
    // NO_PREVIEW / offline: a plain card that still opens the page.
    return { title: null, author: null, thumbnail: null, webURL: u.href };
  }
}

/** Public oEmbed call, 6 s budget, no auth, no cookies. null on any miss (a
 *  CORS refusal surfaces as a network error here and falls through). */
async function oEmbed(endpoint: string, u: URL): Promise<LinkPreview | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(endpoint + encodeURIComponent(u.href), { headers: { Accept: "application/json" }, credentials: "omit", signal: ctrl.signal });
    if (r.status !== 200) return null;
    const o = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: o.title ?? null, author: o.author_name ?? null, thumbnail: o.thumbnail_url ?? null, webURL: u.href };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Where a click goes: the canonical web page (never a native scheme). */
export function openURLFor(preview: LinkPreview | null, fallback: string): string {
  const web = preview?.webURL ?? fallback;
  try {
    const u = new URL(web);
    if (u.protocol === "http:" || u.protocol === "https:") return web;
  } catch { /* fall through */ }
  return fallback;
}

export function clearLinkPreviews() { cache.clear(); }
