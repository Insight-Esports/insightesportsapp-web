// StreamPlayer.tsx — "Watch" on a live match (LiveMatchView's Watch pill +
// StreamPlayerSheet). Twitch plays inline: the stream's embed_url in an
// iframe with parent=<the host we're served on> (Twitch's embed
// requirement — it must name the exact page host, so it is read from
// window.location, never hardcoded). Anything else — YouTube, Kick, a
// non-embed URL — opens on its own site in a new tab.
//
// One stream → the pill plays it; several → a small menu (platform +
// language) picks one. The pill is hidden by the caller when streams are
// null/empty or the match is decided.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Play, Radio } from "lucide-react";
import { Sheet, Spinner } from "@/components/ui";
import { clsx } from "@/lib/format";
import { isTwitchStream, preferredStream, streamKey, type MatchStream } from "@/lib/types";

/** Twitch's player URL with our host added as a `parent` (theirs kept), autoplay on. */
export function twitchEmbedSrc(embedURL: string, hostname: string): string | null {
  try {
    const u = new URL(embedURL);
    if (hostname && !u.searchParams.getAll("parent").includes(hostname)) u.searchParams.append("parent", hostname);
    u.searchParams.set("autoplay", "true");
    if (!u.searchParams.has("muted")) u.searchParams.set("muted", "false");
    return u.toString();
  } catch {
    return null;
  }
}

/** Plays inline (Twitch with an embed_url) vs. opens externally. */
export function playsInline(s: MatchStream): boolean {
  return isTwitchStream(s) && !!s.embedURL;
}

function openExternally(s: MatchStream) {
  const url = s.url ?? s.embedURL;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function platformLabel(s: MatchStream): string {
  const p = (s.platform ?? "").toLowerCase();
  if (p.includes("twitch") || isTwitchStream(s)) return "Twitch";
  if (p.includes("youtube")) return "YouTube";
  if (p.includes("kick")) return "Kick";
  if (p && p !== "other") return p[0].toUpperCase() + p.slice(1);
  try { return new URL(s.url ?? "").hostname.replace(/^www\./, ""); } catch { return "Stream"; }
}

function StreamMenuItem({ s, onPick }: { s: MatchStream; onPick: (s: MatchStream) => void }) {
  const lang = s.language?.toUpperCase();
  const inline = playsInline(s);
  return (
    <button type="button" role="menuitem" onClick={() => onPick(s)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface/60">
      {inline ? <Play size={10} className="text-violet shrink-0" fill="currentColor" /> : <ExternalLink size={10} className="text-muted shrink-0" />}
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="t-label-md text-primary truncate">{platformLabel(s)}{lang ? <span className="text-muted"> · {lang}</span> : null}</span>
        {s.channel ? <span className="t-label-sm text-muted truncate">{s.channel}</span> : null}
      </span>
      {s.official ? <span className="text-[9px] font-bold tracking-[0.8px] text-violet px-1.5 py-px rounded-full border border-violet shrink-0">OFFICIAL</span> : null}
      {s.placeholder ? <span className="t-label-sm text-muted shrink-0">Demo</span> : null}
    </button>
  );
}

/**
 * The violet "▶ Watch" capsule from the HUD's top row. Renders nothing
 * without a playable stream; the caller also hides it once the match ends.
 */
export function WatchPill({ streams, title, className }: { streams: MatchStream[] | null | undefined; title: string; className?: string }) {
  const [menu, setMenu] = useState(false);
  const [watching, setWatching] = useState<MatchStream | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const list = streams ?? [];
  const preferred = preferredStream(list);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  if (!preferred) return null;

  const pick = (s: MatchStream) => {
    setMenu(false);
    if (playsInline(s)) setWatching(s);
    else openExternally(s);
  };
  const onClick = () => {
    if (list.length > 1) setMenu((v) => !v);
    else pick(preferred);
  };

  return (
    <span ref={wrap} className={clsx("relative inline-flex", className)}>
      <button
        type="button"
        onClick={onClick}
        aria-haspopup={list.length > 1 ? "menu" : undefined}
        aria-expanded={list.length > 1 ? menu : undefined}
        title={list.length > 1 ? "Choose a stream" : playsInline(preferred) ? "Watch on Twitch" : `Open on ${platformLabel(preferred)}`}
        className="inline-flex items-center gap-1 px-[9px] py-1 rounded-full bg-violet text-white t-label-sm hover:bg-violet-light transition-colors"
      >
        <Play size={9} fill="currentColor" strokeWidth={3} />
        Watch
      </button>
      {menu ? (
        <div role="menu" className="absolute right-0 top-7 z-20 min-w-44 max-w-64 rounded-lg bg-card border border-hairline py-1 shadow-xl">
          {list.map((s, i) => <StreamMenuItem key={streamKey(s, i)} s={s} onPick={pick} />)}
        </div>
      ) : null}
      <StreamPlayerSheet stream={watching} title={title} onClose={() => setWatching(null)} />
    </span>
  );
}

/** Twitch's own player in a sheet (ads untouched); "open on Twitch" in the corner. */
export function StreamPlayerSheet({ stream, title, onClose }: { stream: MatchStream | null; title: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  // Twitch rejects any parent that isn't the page's exact host; read it at
  // open time on the client, never from a constant.
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const src = useMemo(() => (stream?.embedURL ? twitchEmbedSrc(stream.embedURL, hostname) : null), [stream, hostname]);
  useEffect(() => { setLoading(true); }, [src]);

  const open = !!stream;
  const trailing = stream?.url ? (
    <a href={stream.url} target="_blank" rel="noopener noreferrer" aria-label="Open on Twitch" className="text-violet hover:text-violet-light">
      <ExternalLink size={18} />
    </a>
  ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg" trailing={trailing}>
      {stream ? (
        <div className="flex flex-col gap-3">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
            {src ? (
              <iframe
                key={src}
                src={src}
                title={`${title} — Twitch stream`}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                onLoad={() => setLoading(false)}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <span className="t-body-md text-secondary">This stream can&apos;t be played here.</span>
              </div>
            )}
            {src && loading ? <div className="absolute inset-0 grid place-items-center pointer-events-none"><Spinner size={22} className="border-white/30 border-t-white" /></div> : null}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Radio size={12} className="text-error shrink-0" />
            <span className="t-label-md text-primary truncate">{stream.channel ? `twitch.tv/${stream.channel}` : "Twitch"}</span>
            {stream.official ? <span className="text-[9px] font-bold tracking-[0.8px] text-violet px-1.5 py-px rounded-full border border-violet shrink-0">OFFICIAL</span> : null}
            {stream.placeholder ? <span className="t-label-sm text-muted shrink-0">Demo stream</span> : null}
            {stream.language ? <span className="t-label-sm text-muted shrink-0">{stream.language.toUpperCase()}</span> : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
