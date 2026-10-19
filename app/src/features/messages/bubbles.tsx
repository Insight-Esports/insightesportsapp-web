// messages/bubbles.tsx — the thread's pieces (MessagesView.swift):
// MessageBubble (mine right in violet, theirs left on surface, the
// avatar at the end of their run), LinkPreviewBubble (TikTok/YouTube via
// public oEmbed from the browser, everything else via /api/links/preview;
// a plain host card when there's no preview), MediaBubble (a photo or a
// video poster sized by the envelope's aspect; tap → viewer; "Uploading"
// while this browser is still sending a video's bytes), MediaViewer
// (full-screen photo / inline video; holds the poster with a clock while
// the sender is still uploading, plays on dm:media_ready), TypingBubble.
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock, Image as ImageIcon, Link2, MessageSquareText, Music2, Play, SquarePlay, Tv, Video, X, RotateCw } from "lucide-react";
import { clsx } from "@/lib/format";
import { imageSrc, InitialAvatar, Spinner } from "@/components/ui";
import { DMMediaError, imageURL, videoURL } from "./media";
import { onDM } from "./service";
import { openURLFor, previewIsEmpty, useLinkPreview } from "./link-preview";
import { clock, durationClock } from "./format-dm";
import type { UploadState } from "./use-thread";
import { isPendingId, mediaAspect, type DMMedia, type DMMessage } from "./types";

// ── MessageBubble ─────────────────────────────────────────────────────────
export function MessageBubble({ message, seenLabel, endsRun, avatarURL, initialsName, showTime, onToggleTime, onOpenMedia, onRetry, uploadState = null, onRetryUpload }: {
  message: DMMessage;
  seenLabel: string | null;
  endsRun: boolean;
  avatarURL: string | null;
  initialsName: string;
  showTime: boolean;
  onToggleTime: () => void;
  onOpenMedia: (m: DMMessage) => void;
  onRetry: (id: string) => void;
  /** Set while THIS browser is still uploading the video's bytes (or gave up). */
  uploadState?: UploadState | null;
  onRetryUpload?: (blobId: string) => void;
}) {
  const mine = message.isMine;
  const failed = !!message.failed;
  return (
    <div className={clsx("flex flex-col gap-[3px]", mine ? "items-end" : "items-start")}>
      <div className={clsx("flex items-end gap-2 max-w-full", mine && "flex-row-reverse")}>
        {!mine ? (
          endsRun ? <InitialAvatar name={initialsName} imageURL={avatarURL} size={24} /> : <span className="size-6 shrink-0" />
        ) : null}
        <div className={clsx("min-w-0", mine ? "ml-[70px]" : "mr-[70px]")}>
          {message.media ? (
            <MediaBubble message={message} onOpen={onOpenMedia} onRetry={onRetry} uploadState={uploadState} onRetryUpload={onRetryUpload} />
          ) : message.linkURL ? (
            <LinkPreviewBubble url={message.linkURL} isMine={mine} />
          ) : (
            <button
              type="button"
              onClick={failed ? () => onRetry(message.id) : onToggleTime}
              className={clsx(
                "block text-left px-3.5 py-[9px] rounded-[18px] t-body-md whitespace-pre-wrap break-words",
                mine ? "bg-violet text-white" : "bg-surface text-primary",
                !message.decrypted && "italic !text-muted",
                isPendingId(message.id) && !failed && "opacity-70",
                failed && "opacity-60",
              )}
            >
              {message.text}
            </button>
          )}
        </div>
      </div>
      {failed ? (
        <button type="button" onClick={() => onRetry(message.id)} className={clsx("flex items-center gap-1 t-label-sm text-error hover:underline", mine ? "pr-1" : "pl-9")}>
          <RotateCw size={11} />Not sent · Tap to retry
        </button>
      ) : null}
      {showTime ? <span className={clsx("t-label-sm text-muted", mine ? "pr-1" : "pl-9")}>{clock(message.createdAt)}</span> : null}
      {seenLabel && !failed ? <span className="t-label-sm text-muted pr-1">{seenLabel}</span> : null}
    </div>
  );
}

// ── Link preview ──────────────────────────────────────────────────────────
// TikTok/YouTube resolve in the browser (public oEmbed); Instagram, X, short
// links and anything else go through /api/links/preview. The card shows
// thumbnail, title and author when known, otherwise a plain host card —
// either way it opens the web page in a new tab (no native-app hop on web).
function serviceFor(u: URL): { name: string; glyph: "music" | "reel" | "youtube" | "tv" | "bubble" | "link" } {
  const h = u.host.toLowerCase();
  if (h.includes("tiktok")) return { name: "TikTok", glyph: "music" };
  if (h.includes("instagram")) return { name: "Instagram", glyph: "reel" };
  if (h.includes("youtu")) return { name: "YouTube", glyph: "youtube" };
  if (h.includes("twitch")) return { name: "Twitch", glyph: "tv" };
  if (h.includes("x.com") || h.includes("twitter")) return { name: "X", glyph: "bubble" };
  return { name: h.replace(/^www\./, "") || "Link", glyph: "link" };
}

export function LinkPreviewBubble({ url, isMine }: { url: string; isMine: boolean }) {
  let u: URL | null = null;
  try { u = new URL(url); } catch { u = null; }
  const service = u ? serviceFor(u) : { name: "Link", glyph: "link" as const };
  const host = u ? u.host.replace(/^www\./, "") : "";
  const line = u ? host + u.pathname : url;
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const preview = useLinkPreview(url);
  const href = openURLFor(preview, url);
  const Glyph = service.glyph === "music" ? Music2 : service.glyph === "reel" ? SquarePlay : service.glyph === "youtube" ? Play : service.glyph === "tv" ? Tv : service.glyph === "bubble" ? MessageSquareText : Link2;

  if (preview && !previewIsEmpty(preview)) {
    // Thumbnail on top (16:9, the service's own frame), title, author · service.
    const thumb = !thumbFailed ? imageSrc(preview.thumbnail) : null;
    // author · service — but never "Instagram · Instagram" when the service reports itself as the author.
    const author = preview.author && preview.author.toLowerCase() !== service.name.toLowerCase() ? preview.author : null;
    const byline = [author, !thumb || !author ? service.name : null].filter(Boolean).join(" · ");
    return (
      <a
        href={href} target="_blank" rel="noopener noreferrer"
        className={clsx("flex flex-col w-[240px] max-w-full overflow-hidden rounded-[18px] text-left transition-[filter] hover:brightness-110", isMine ? "bg-violet text-white" : "bg-surface text-primary")}
      >
        {thumb ? (
          <span className="relative block w-full aspect-video bg-card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} onError={() => setThumbFailed(true)} />
            <span className="absolute left-2 bottom-2 flex items-center gap-1 px-[7px] py-[3px] rounded-full bg-black/55 text-white text-[10px] font-semibold">
              <Glyph size={9} strokeWidth={3} />{service.name}
            </span>
          </span>
        ) : null}
        <span className="flex flex-col gap-[3px] px-3 py-2.5 min-w-0">
          {preview.title ? <span className="t-label-md line-clamp-2 break-words">{preview.title}</span> : null}
          {byline ? <span className={clsx("t-label-sm truncate", isMine ? "text-white/80" : "text-muted")}>{byline}</span> : null}
        </span>
      </a>
    );
  }

  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className={clsx("flex items-center gap-2.5 px-3 py-2.5 rounded-[18px] max-w-[320px] transition-[filter] hover:brightness-110", isMine ? "bg-violet text-white" : "bg-surface text-primary")}
    >
      <span className={clsx("grid place-items-center size-[34px] rounded-[9px] shrink-0 overflow-hidden", isMine ? "bg-white/15" : "bg-card")}>
        {host && !faviconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" width={18} height={18} onError={() => setFaviconFailed(true)} referrerPolicy="no-referrer" />
        ) : (
          <Glyph size={15} className={isMine ? "text-white" : "text-violet"} />
        )}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="t-label-md">{service.name}</span>
        <span className={clsx("t-label-sm truncate", isMine ? "text-white/80" : "text-muted")}>{line}</span>
      </span>
      <span className={clsx("flex items-center gap-0.5 t-label-sm shrink-0", isMine ? "text-white/80" : "text-muted")}>Open<ArrowUpRight size={11} /></span>
    </a>
  );
}

// ── Media bubble ──────────────────────────────────────────────────────────
function frameFor(media: DMMedia): { width: number; height: number } {
  const maxW = 240, maxH = 300;
  const a = Math.max(0.4, Math.min(2.5, mediaAspect(media)));
  let w = maxW, h = maxW / a;
  if (h > maxH) { h = maxH; w = maxH * a; }
  return { width: Math.round(w), height: Math.round(h) };
}

/** "notReady": the sender hasn't finished uploading (rare for images, the
 *  poster-first video's poster is in before the send). Re-fetched on
 *  dm:media_ready for that upload id. */
type MediaState = { kind: "loading" } | { kind: "notReady" } | { kind: "ready"; src: string } | { kind: "expired" } | { kind: "unavailable" };

function stateFromError(e: unknown): MediaState {
  if (e instanceof DMMediaError) {
    if (e.kind === "expired") return { kind: "expired" };
    if (e.kind === "notReady") return { kind: "notReady" };
  }
  return { kind: "unavailable" };
}

/** Fires when the sender finished uploading one of these ids (dm:media_ready). */
function useMediaReady(ids: (string | null | undefined)[], onReady: () => void) {
  const key = ids.filter(Boolean).join("|");
  useEffect(() => {
    if (!key) return;
    const want = new Set(key.split("|"));
    return onDM("mediaReady", ({ uploadId }) => { if (want.has(uploadId)) onReady(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** The decrypted picture (or a video's poster) for a message's media, loaded once per blob. */
export function useMediaImage(message: DMMessage): MediaState {
  const media = message.media;
  const pending = isPendingId(message.id);
  const blobId = media?.blobId ?? null;
  const [state, setState] = useState<MediaState>(() => (message.localPreview ? { kind: "ready", src: message.localPreview } : { kind: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const waiting = useRef(false);
  waiting.current = state.kind === "notReady";
  useEffect(() => {
    if (!media || pending || message.localPreview) return;
    let active = true;
    imageURL(media)
      .then((src) => { if (!active) return; setState(src ? { kind: "ready", src } : { kind: "unavailable" }); })
      .catch((e: unknown) => { if (active) setState(stateFromError(e)); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobId, pending, message.localPreview, attempt]);
  useMediaReady([media?.blobId, media?.posterId], () => { if (waiting.current) setAttempt((a) => a + 1); });
  return state;
}

export function MediaBubble({ message, onOpen, onRetry, uploadState = null, onRetryUpload }: {
  message: DMMessage; onOpen: (m: DMMessage) => void; onRetry: (id: string) => void;
  uploadState?: UploadState | null; onRetryUpload?: (blobId: string) => void;
}) {
  const media = message.media!;
  const pending = isPendingId(message.id);
  const failed = !!message.failed;
  const frame = frameFor(media);
  const state = useMediaImage(message);
  const unavailable = state.kind === "expired" || state.kind === "unavailable";
  const label = media.kind === "image"
    ? (state.kind === "expired" ? "Photo expired" : "Photo unavailable")
    : (state.kind === "expired" ? "Video expired" : "Video unavailable");
  return (
    <button
      type="button"
      onClick={() => { if (failed) onRetry(message.id); else if (!pending && !unavailable) onOpen(message); }}
      className="relative block overflow-hidden rounded-[18px] border border-border-subtle bg-surface"
      style={{ width: frame.width, height: frame.height, maxWidth: "100%" }}
      aria-label={media.kind === "image" ? "Photo" : "Video"}
    >
      {state.kind === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.src} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : unavailable ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="flex flex-col items-center gap-1.5 text-muted">
            {media.kind === "image" ? <ImageIcon size={20} /> : <Video size={20} />}
            <span className="t-label-sm">{label}</span>
          </span>
        </span>
      ) : (
        <span className="absolute inset-0 bg-surface animate-pulse" />
      )}
      {media.kind === "video" && !unavailable ? (
        <>
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid place-items-center size-12 rounded-full bg-black/45 text-white"><Play size={22} className="fill-white ml-0.5" /></span>
          </span>
          {media.duration != null ? (
            <span className="absolute right-2 bottom-2 px-[7px] py-[3px] rounded-full bg-black/55 text-white t-mono-sm !text-[11px] !font-semibold">{durationClock(media.duration)}</span>
          ) : null}
        </>
      ) : null}
      {pending && !failed ? (
        <span className="absolute inset-0 grid place-items-center bg-black/25"><Spinner size={22} className="border-white/40 border-t-white" /></span>
      ) : uploadState === "uploading" ? (
        // Sent (the poster is there for both sides); the video bytes are still on their way up.
        <span className="absolute left-2 top-2 flex items-center gap-[5px] px-2 py-1 rounded-full bg-black/55 text-white text-[11px] font-semibold">
          <Spinner size={11} className="border-white/40 border-t-white" />Uploading
        </span>
      ) : uploadState === "failed" ? (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onRetryUpload?.(media.blobId); }}
          className="absolute left-2 top-2 flex items-center gap-[5px] px-2 py-1 rounded-full bg-black/65 text-white text-[11px] font-semibold hover:bg-black/80"
        >
          <RotateCw size={11} />Upload failed · Retry
        </span>
      ) : state.kind === "notReady" ? (
        // The sender is still uploading — hold the frame with a clock, never an error.
        <span className="absolute left-2 top-2 flex items-center gap-[5px] px-2 py-1 rounded-full bg-black/55 text-white text-[11px] font-semibold">
          <Clock size={11} />Processing
        </span>
      ) : null}
      {failed ? (
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-white t-label-md">Tap to retry</span>
      ) : null}
    </button>
  );
}

// ── Full-screen viewer ────────────────────────────────────────────────────
export function MediaViewer({ message, onClose }: { message: DMMessage; onClose: () => void }) {
  const media = message.media;
  const image = useMediaImage(message);
  const [video, setVideo] = useState<string | null>(() => (isPendingId(message.id) && message.localPreview ? message.localPreview : null));
  const [videoError, setVideoError] = useState<string | null>(null);
  /** Video bytes not on the server yet (poster-first send in flight): hold the poster, play on dm:media_ready. */
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  waitingRef.current = waiting;
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    if (!media || media.kind !== "video" || isPendingId(message.id)) return;
    let active = true;
    videoURL(media)
      .then((u) => { if (active) { setWaiting(false); setVideo(u); } })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof DMMediaError && e.kind === "notReady") { setWaiting(true); return; }   // the sender is still uploading — hold the poster
        setVideoError(e instanceof DMMediaError && e.kind === "expired" ? "Video expired" : "Video unavailable");
      });
    return () => { active = false; };
  }, [media, message.id, attempt]);
  useMediaReady([media?.blobId], () => { if (waitingRef.current) setAttempt((a) => a + 1); });

  if (!media) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center" role="dialog" aria-modal onClick={onClose}>
      {media.kind === "video" ? (
        video ? (
          <video src={video} controls autoPlay playsInline className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
        ) : videoError ? (
          <span className="t-body-md text-muted">{videoError}</span>
        ) : waiting ? (
          // Poster-first: the frame they already have, a quiet clock, no error.
          <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {image.kind === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.src} alt="" className="max-w-full max-h-full object-contain select-none" draggable={false} />
            ) : null}
            <span className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/60 text-white t-label-sm">
                <Clock size={13} />Still uploading… it&apos;ll play as soon as it lands.
              </span>
            </span>
          </div>
        ) : (
          <Spinner size={28} className="border-white/40 border-t-white" />
        )
      ) : image.kind === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src} alt=""
          onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
          className={clsx("max-w-full max-h-full object-contain transition-transform duration-200 select-none", zoomed ? "scale-[2] cursor-zoom-out" : "cursor-zoom-in")}
          draggable={false}
        />
      ) : image.kind === "loading" || image.kind === "notReady" ? (
        <Spinner size={28} className="border-white/40 border-t-white" />
      ) : (
        <span className="t-body-md text-muted">{image.kind === "expired" ? "Photo expired" : "Photo unavailable"}</span>
      )}
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 grid place-items-center size-9 rounded-full bg-white/15 text-white hover:bg-white/25"><X size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

// ── Typing indicator (three dots, Instagram's) ────────────────────────────
export function TypingBubble({ avatarURL, initialsName }: { avatarURL: string | null; initialsName: string }) {
  return (
    <div className="flex items-end gap-2 mr-[70px]">
      <InitialAvatar name={initialsName} imageURL={avatarURL} size={24} />
      <span className="flex items-center gap-1 px-3.5 py-3 rounded-[18px] bg-surface">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-muted dm-typing-dot" style={{ animationDelay: `${i * 300}ms` }} />
        ))}
      </span>
      <style>{`@keyframes dm-typing{0%,100%{opacity:.35}33%{opacity:1}66%{opacity:.35}} .dm-typing-dot{animation:dm-typing 900ms steps(1,end) infinite}`}</style>
    </div>
  );
}
