// entity-header.tsx — the one header for a player or team on the Premium
// screens (parity doc 2026-10-28 §7, iOS EntityLinks.swift):
//
//   [photo / crest]  Name  ● Live                       ›   → player / team page
//                    Team · Game
//   ● LIVE  T1 12 – 9 GEN                       Watch ›   → the live match
//
// - No photo passed → GET /players/:id or /teams/:id ONCE per id (module
//   cache shared by every header on every screen). Lists never do this.
// - The live row reads the app's one shared GET /matches/live copy
//   (lib/live-matches): by the match id when the screen knows it, else by
//   the team id (a player's team). Someone who goes live while the page is
//   open gets the row on the next 10 s refresh. When the match drops off the
//   list the row reads "Result" and opens the result page instead.
// - This row replaces the separate live-match rows each live screen used to
//   draw: screens show the header, not both.
//
// Also exported for other screens (alerts): `useLiveMatchLink`,
// `LiveMatchLink`, `entityHref`, `liveScoreLine`.
"use client";

import { teamLetters } from "@/lib/team-letters";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel, normalizePlayer, normalizeTeam, type Match } from "@/lib/types";
import { liveMatchById, liveMatchForTeam, refreshLiveMatches, scoreFromSide, useLiveMatches } from "@/lib/live-matches";
import { prefetchPlayer, prefetchTeam, recallPlayer, recallTeam, rememberPlayer, rememberTeam } from "@/features/entity-cache";
import { rememberMatch } from "@/features/matches/match-cache";
import { InitialAvatar, LiveBadge, TeamMark } from "./index";

export type EntityType = "player" | "team";

// ── Links ─────────────────────────────────────────────────────────────────
/** The player or team page. */
export function entityHref(type: EntityType, id: string): string {
  return type === "player" ? `/players/${encodeURIComponent(id)}` : `/teams/${encodeURIComponent(id)}`;
}
/** The match page (live view while live, the result once it has ended). */
export function matchPageHref(id: string): string {
  return `/match/${encodeURIComponent(id)}`;
}
const abbr = (name: string) => teamLetters(name) || name.slice(0, 3).toUpperCase();

/** "8 – 5 · leading" — a live match's round score from one team's side. */
export function liveScoreLine(m: Match, teamId: string | null | undefined): string | null {
  const s = scoreFromSide(m, teamId);
  if (!s) return null;
  const [mine, theirs] = s;
  return `${mine} – ${theirs} · ${mine > theirs ? "leading" : mine < theirs ? "trailing" : "level"}`;
}

// ── Entity info (photo / crest + the player's team), once per id ─────────
interface EntityInfo { imageURL: string | null; teamId: string | null; teamName: string | null }
const infoCache = new Map<string, Promise<EntityInfo | null>>();
const infoDone = new Map<string, EntityInfo | null>();

function loadEntity(type: EntityType, id: string): Promise<EntityInfo | null> {
  const key = `${type}:${id}`;
  const hit = infoCache.get(key);
  if (hit) return hit;
  const p: Promise<EntityInfo | null> = (type === "player"
    ? api.get(endpoints.playerDetail(id)).then((raw) => { const pl = normalizePlayer(raw); rememberPlayer(pl); return { imageURL: pl.imageURL, teamId: pl.teamId, teamName: pl.teamName }; })
    : api.get(endpoints.teamDetail(id)).then((raw) => { const t = normalizeTeam(raw); rememberTeam(t); return { imageURL: t.logoURL, teamId: t.id, teamName: t.name }; }))
    .then((info) => { infoDone.set(key, info); return info; })
    .catch(() => { infoCache.delete(key); return null; });   // a later header may retry
  infoCache.set(key, p);
  return p;
}

function recalled(type: EntityType, id: string): EntityInfo | null {
  const done = infoDone.get(`${type}:${id}`);
  if (done) return done;
  if (type === "player") { const p = recallPlayer(id); return p ? { imageURL: p.imageURL, teamId: p.teamId, teamName: p.teamName } : null; }
  const t = recallTeam(id);
  return t ? { imageURL: t.logoURL, teamId: t.id, teamName: t.name } : null;
}

/** What the header knows about the entity: props first, then the caches, then one fetch. */
function useEntityInfo(type: EntityType, id: string, given: { imageURL?: string | null; teamId?: string | null; teamName?: string | null; matchId?: string | null }): EntityInfo {
  const [fetched, setFetched] = useState<{ key: string; info: EntityInfo | null } | null>(null);
  const key = `${type}:${id}`;
  const cached = id ? recalled(type, id) : null;
  const fromFetch = fetched?.key === key ? fetched.info : null;
  const info: EntityInfo = {
    imageURL: given.imageURL ?? fromFetch?.imageURL ?? cached?.imageURL ?? null,
    teamId: type === "team" ? id : given.teamId ?? fromFetch?.teamId ?? cached?.teamId ?? null,
    teamName: type === "team" ? null : given.teamName ?? fromFetch?.teamName ?? cached?.teamName ?? null,
  };
  // Fetch when there's no photo, or (players) no team to look the live match up by.
  const needs = !!id && !fromFetch && (!info.imageURL || (type === "player" && !info.teamId && !given.matchId));
  useEffect(() => {
    if (!needs) return;
    let on = true;
    void loadEntity(type, id).then((r) => { if (on) setFetched({ key: `${type}:${id}`, info: r }); });
    return () => { on = false; };
  }, [needs, type, id]);
  return info;
}

// ── The live match link ───────────────────────────────────────────────────
export interface LiveMatchLinkState {
  /** The live match, while it's on the shared list. */
  match: Match | null;
  /** The match ended (dropped off the list): the row reads "Result". */
  ended: boolean;
  /** The match id the row opens (live or ended). */
  matchId: string | null;
  /** The last copy seen while live (for the ended row's names). */
  lastSeen: Match | null;
}

/**
 * The live match for a known match id, else the one `teamId` is playing in,
 * from the shared GET /matches/live (polled every 10 s while mounted).
 */
export function useLiveMatchLink({ matchId, teamId }: { matchId?: string | null; teamId?: string | null }): LiveMatchLinkState {
  const list = useLiveMatches(true);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let on = true;
    void refreshLiveMatches().then(() => { if (on) setChecked(true); });
    return () => { on = false; };
  }, []);
  const live = (matchId ? liveMatchById(list, matchId) : null) ?? liveMatchForTeam(list, teamId);
  // Remember the last live copy (adjusting state while rendering, not in an effect).
  const [lastSeen, setLastSeen] = useState<Match | null>(null);
  if (live && live !== lastSeen) setLastSeen(live);
  const endedId = !live && checked ? (matchId ?? lastSeen?.id ?? null) : null;
  return { match: live, ended: !!endedId, matchId: live?.id ?? endedId, lastSeen: live ?? lastSeen };
}

/** "● LIVE  T1 12 – 9 GEN  Watch ›" → the live match; "Result ›" once it has ended. */
export function LiveMatchLink({ state, className, from }: { state: LiveMatchLinkState; className?: string; /** Back target for the match page (e.g. a series path). */ from?: string | null }) {
  const { match, ended, matchId, lastSeen } = state;
  if (!matchId || (!match && !ended)) return null;
  const m = match ?? lastSeen;
  return (
    <Link
      href={from ? `${matchPageHref(matchId)}?from=${encodeURIComponent(from)}` : matchPageHref(matchId)}
      onClick={() => { if (m) rememberMatch(m); }}
      className={clsx("flex items-center gap-2 px-3.5 py-2.5 hover:bg-surface/50 transition-colors min-w-0", className)}
    >
      {match ? (
        <>
          <span className="live-dot size-[7px] rounded-full bg-live shrink-0" />
          <span className="t-label-sm font-semibold tracking-[0.08em] text-live shrink-0">LIVE</span>
          <span className="w-1 shrink-0" />
          <TeamMark name={match.team1Name} logoURL={match.team1LogoURL} size={20} />
          <span className="t-label-md text-primary shrink-0">{abbr(match.team1Name)}</span>
          <span className="t-mono-sm text-primary shrink-0">{match.team1Score} – {match.team2Score}</span>
          <span className="t-label-md text-primary shrink-0">{abbr(match.team2Name)}</span>
          <TeamMark name={match.team2Name} logoURL={match.team2LogoURL} size={20} />
        </>
      ) : (
        <>
          <span className="t-label-sm font-semibold tracking-[0.08em] text-muted shrink-0">ENDED</span>
          <span className="w-1 shrink-0" />
          {m ? <span className="t-label-md text-secondary truncate">{abbr(m.team1Name)} vs {abbr(m.team2Name)}</span> : <span className="t-label-md text-secondary truncate">This match is over</span>}
        </>
      )}
      <span className="flex-1" />
      <span className="t-label-md text-violet shrink-0">{match ? "Watch" : "Result"}</span>
      <ChevronRight size={13} className="text-violet shrink-0 -ml-1" />
    </Link>
  );
}

// ── The header ────────────────────────────────────────────────────────────
export interface EntityHeaderProps {
  type: EntityType;
  id: string;
  name: string;
  game: string;
  /** Photo (player) or crest (team) when the screen has it — skips the fetch. */
  imageURL?: string | null;
  /** A player's team, when known (subtitle + the live lookup). */
  teamId?: string | null;
  teamName?: string | null;
  /** The live match the screen already knows (live flows). */
  matchId?: string | null;
  /** The screen opened in live mode: the LIVE badge shows until the live list says otherwise. */
  live?: boolean;
  /** Replaces "Team · Game". */
  subtitle?: string | null;
  className?: string;
}

export function EntityHeader({ type, id, name, game, imageURL, teamId, teamName, matchId, live, subtitle, className }: EntityHeaderProps) {
  const info = useEntityInfo(type, id, { imageURL, teamId, teamName, matchId });
  const link = useLiveMatchLink({ matchId, teamId: info.teamId });
  const isLive = !!link.match || (!!live && !link.ended && !link.matchId);
  const sub = subtitle ?? (type === "player" ? [info.teamName, gameLabel(game)] : ["Team", gameLabel(game)]).filter(Boolean).join(" · ");
  const href = id ? entityHref(type, id) : null;

  const body = (
    <>
      {type === "player"
        ? <InitialAvatar name={name || "?"} imageURL={info.imageURL} size={40} />
        : <TeamMark name={name || "?"} logoURL={info.imageURL} size={40} />}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <span className="t-headline-sm text-primary truncate">{name}</span>
          {isLive ? <LiveBadge className="shrink-0" /> : null}
        </span>
        {sub ? <span className="t-label-sm text-muted truncate">{sub}</span> : null}
      </span>
      <span className="flex-1" />
      {href ? <ChevronRight size={14} className="text-muted shrink-0" /> : null}
    </>
  );

  return (
    <div className={clsx("rounded-xl bg-card border border-border-subtle overflow-hidden", className)}>
      {href ? (
        <Link href={href} onMouseEnter={() => (type === "player" ? prefetchPlayer(id) : prefetchTeam(id))} className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface/50 transition-colors min-w-0">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-3.5 py-3 min-w-0">{body}</div>
      )}
      <LiveMatchLink state={link} className="border-t border-border-subtle" />
    </div>
  );
}
