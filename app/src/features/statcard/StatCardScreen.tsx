// StatCardScreen.tsx — PlayerStatCardView: one player in one match, on a card.
//
// Top to bottom: who (and the way to their page); the match with its score,
// live or final (and the way to it — from a scoreboard, back to the match
// beneath); their line: kills, deaths, assists and the game's headline stat,
// then the rest of what the scoreboard holds for them; how the game reads
// against their usual, and where they stand among everyone in the match.
// Under the card Premium gets every stat beside its usual; a free account
// gets the header and the way to Premium. Share sends the card as a picture
// (a Premium sharer's picture carries the comparison).
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, ChevronRight, Share, WifiOff } from "lucide-react";
import { AssetIcon, GamePill, InitialAvatar, LiveBadge, Page, SectionHeader, SkeletonBar, TeamMark, Toast } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { withFromMatch } from "@/features/matches/from-match";
import { playerHref } from "@/features/matches/live/sections";
import {
  deltaText, gridRows, hasRead, isDimmed, rowTone, statLabel, statText, usualText, verdictTone, VERDICT_LABEL,
  type CardCell, type CardModel, type Tone, type UsualReading, type UsualRow,
} from "./model";
import { shareCardPicture } from "./share";
import { useStatCard } from "./use-stat-card";

const toneText = (t: Tone) => (t === "good" ? "text-success" : t === "bad" ? "text-error" : "text-secondary");
const toneFill = (t: Tone) => (t === "good" ? "bg-success" : t === "bad" ? "bg-error" : "bg-secondary");

function Rule() {
  return <div className="h-px bg-border-subtle" />;
}

// ── The card's blocks ───────────────────────────────────────────────────────
function Identity({ m }: { m: CardModel }) {
  return (
    <Link href={withFromMatch(playerHref(m.playerId, m.name), m.match.id)} aria-label={`${m.name}: open their page`} className="flex items-center gap-3 p-3.5 hover:bg-surface/40 transition-colors">
      <InitialAvatar name={m.name} imageURL={m.photoURL} size={52} />
      <span className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="t-headline-md text-primary truncate">{m.name}</span>
        {m.detail ? (
          <span className="flex items-center gap-1.5 min-w-0">
            {m.teamName ? <TeamMark name={m.teamName} logoURL={m.teamLogoURL} size={16} /> : null}
            <span className="t-label-md text-secondary truncate">{m.detail}</span>
          </span>
        ) : null}
      </span>
      <ChevronRight size={13} strokeWidth={2.5} className="text-muted shrink-0" />
    </Link>
  );
}

function ScoreBlock({ m }: { m: CardModel }) {
  const team = (side: 1 | 2) => {
    const dim = isDimmed(m, side);
    const name = side === 1 ? m.match.team1Name : m.match.team2Name;
    const score = m.score ? (side === 1 ? m.score.team1 : m.score.team2) : null;
    return (
      <span className="flex items-center gap-2.5">
        <TeamMark name={name} logoURL={side === 1 ? m.match.team1LogoURL : m.match.team2LogoURL} size={22} />
        <span className={clsx("t-body-lg truncate", dim ? "text-secondary" : "text-primary")}>{name}</span>
        <span className="flex-1" />
        <span className={clsx("t-score text-[18px] leading-none", dim ? "text-muted" : "text-primary")}>{score ?? "–"}</span>
      </span>
    );
  };
  return (
    <span className="flex flex-col gap-2.5 px-3.5 py-3">
      <span className="flex items-center gap-1.5 min-w-0">
        {m.isLive ? <LiveBadge className="shrink-0" /> : m.isFinal ? <span className="text-[9px] font-bold text-muted px-1.5 py-0.5 rounded-full bg-surface shrink-0">FINAL</span> : null}
        <GamePill game={m.match.game} className="shrink-0" />
        <span className="t-label-sm text-muted truncate">{m.context}</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 t-label-md text-violet shrink-0">{m.isLive ? "Watch" : "Result"}<ChevronRight size={12} strokeWidth={2.5} /></span>
      </span>
      {team(1)}
      {team(2)}
    </span>
  );
}

function Cell({ c, large }: { c: CardCell; large: boolean }) {
  return (
    <span className={clsx("flex-1 min-w-0 flex flex-col items-center", large ? "gap-1" : "gap-[3px]")}>
      <span className={clsx("truncate max-w-full", large ? "t-mono-lg" : "t-mono-md", c.marquee ? "text-violet" : "text-primary")}>{c.text}</span>
      <span className="text-[9px] font-bold tracking-[0.8px] text-muted uppercase truncate max-w-full">{statLabel(c.stat)}</span>
    </span>
  );
}

function Read({ m }: { m: CardModel }) {
  const u = m.usual;
  return (
    <div className="flex flex-col gap-1.5 p-3.5">
      {u.kind === "ready" ? (() => {
        const tone = verdictTone(u.reading.verdict);
        const Icon = tone === "good" ? ArrowUpRight : tone === "bad" ? ArrowDownRight : ArrowRight;
        return (
          <>
            <span className={clsx("flex items-center gap-[7px] t-label-lg", toneText(tone))}><Icon size={14} strokeWidth={2.75} />{VERDICT_LABEL[u.reading.verdict]}</span>
            <span className="t-label-sm text-muted">{m.isLive ? "So far, against" : "Against"} their last {u.reading.games} games</span>
          </>
        );
      })() : u.kind === "tooEarly" ? (
        <span className="t-label-md text-muted">Too early to compare with their usual.</span>
      ) : u.kind === "notEnough" ? (
        <span className="t-label-md text-muted">Not enough games yet to know their usual.</span>
      ) : u.kind === "pending" ? (
        // The lines' own silhouette, so the card doesn't jump when they arrive.
        <>
          <span className="h-[17px] flex items-center"><SkeletonBar width={172} height={12} /></span>
          <span className="h-[13px] flex items-center"><SkeletonBar width={196} height={9} /></span>
          <span className="h-[13px] flex items-center"><SkeletonBar width={148} height={9} /></span>
        </>
      ) : null}
      {m.standing.length && u.kind !== "pending" ? <span className="t-label-sm text-secondary">{m.standing.join(" · ")}</span> : null}
    </div>
  );
}

function CardFace({ m, onBackToMatch }: { m: CardModel; /** The match is the screen beneath: back to it, not a second copy. */ onBackToMatch: (() => void) | null }) {
  const scoreCls = "block w-full text-left hover:bg-surface/40 transition-colors";
  return (
    <div className="rounded-[14px] bg-card border border-border-subtle overflow-hidden">
      <Identity m={m} />
      <Rule />
      {onBackToMatch ? (
        <button type="button" onClick={onBackToMatch} className={scoreCls} aria-label="Back to the match"><ScoreBlock m={m} /></button>
      ) : (
        <Link href={`/match/${encodeURIComponent(m.match.id)}`} className={scoreCls}><ScoreBlock m={m} /></Link>
      )}
      <Rule />
      <div className="flex gap-1 px-2.5 py-4">{m.headline.map((c) => <Cell key={c.stat} c={c} large />)}</div>
      {m.more.length ? (
        <>
          <Rule />
          <div className="flex flex-col gap-3.5 px-2.5 py-3.5">
            {gridRows(m.more).map((row, i) => <div key={i} className="flex gap-1">{row.map((c) => <Cell key={c.stat} c={c} large={false} />)}</div>)}
          </div>
        </>
      ) : null}
      {hasRead(m) ? (<><Rule /><Read m={m} /></>) : null}
    </div>
  );
}

/** The card's silhouette, while a card opened from a link loads. */
function CardSkeleton() {
  return (
    <div className="rounded-[14px] bg-card border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <span className="size-[52px] rounded-full bg-surface shrink-0" />
        <span className="flex flex-col gap-2"><SkeletonBar width={120} height={14} /><SkeletonBar width={160} height={9} /></span>
      </div>
      <Rule />
      <div className="flex flex-col gap-[13px] px-3.5 py-3">
        <SkeletonBar width={190} height={9} />
        {[0, 1].map((i) => (
          <span key={i} className="flex items-center gap-2.5"><SkeletonBar width={22} height={22} /><SkeletonBar width={110} height={12} /><span className="flex-1" /><SkeletonBar width={20} height={14} /></span>
        ))}
      </div>
      <Rule />
      <div className="flex gap-1 px-2.5 py-4">
        {[0, 1, 2, 3].map((i) => <span key={i} className="flex-1 flex flex-col items-center gap-2"><SkeletonBar width={40} height={20} /><SkeletonBar width={44} height={7} /></span>)}
      </div>
    </div>
  );
}

// ── Versus usual: the table for Premium, the way to it for everyone else ─────
/** How far from usual, as a bar from the middle: right toward the better side, left toward the worse. Two typical swings fill a half. */
function UsualBar({ row }: { row: UsualRow }) {
  const len = row.lean === 0 ? 0 : Math.max(2, 22 * Math.min(Math.abs(row.lean), 1));
  const fill = toneFill(rowTone(row));
  return (
    <span className="relative w-12 h-[11px] flex items-center justify-center shrink-0" aria-hidden>
      <span className="absolute left-[1.5px] right-[1.5px] top-1/2 h-px -translate-y-1/2 bg-muted/25" />
      <span className="relative w-[22px] flex justify-end"><span className={clsx("h-[5px] rounded-full", fill)} style={{ width: row.lean < 0 ? len : 0 }} /></span>
      <span className="relative w-px h-[11px] bg-muted" />
      <span className="relative w-[22px] flex justify-start"><span className={clsx("h-[5px] rounded-full", fill)} style={{ width: row.lean > 0 ? len : 0 }} /></span>
    </span>
  );
}

function UsualTable({ reading, isLive }: { reading: UsualReading; isLive: boolean }) {
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted">
        <span className="flex-1 min-w-0">STAT</span>
        <span className="w-[52px] text-right shrink-0">{isLive ? "NOW" : "FINAL"}</span>
        <span className="w-[52px] text-right shrink-0">USUAL</span>
        <span className="w-12 shrink-0" />
        <span className="w-[46px] text-right shrink-0">±</span>
      </div>
      {reading.rows.map((r, i) => {
        const tone = rowTone(r);
        return (
          <div key={r.stat} className={clsx("flex items-center gap-1 px-3 py-2.5", i % 2 === 0 ? "bg-card" : "bg-surface")}>
            <span className="flex-1 min-w-0 t-body-sm text-primary truncate">{statLabel(r.stat)}</span>
            <span className="w-[52px] text-right t-mono-sm text-violet shrink-0">{statText(r.stat, r.value)}</span>
            <span className="w-[52px] text-right t-mono-sm text-secondary shrink-0">{usualText(r.stat, r.usual)}</span>
            <UsualBar row={r} />
            <span className={clsx("w-[46px] text-right t-mono-sm shrink-0 truncate", toneText(tone))}>{deltaText(r.stat, r.value - r.usual)}</span>
          </div>
        );
      })}
    </div>
  );
}

function UsualSection({ m, isPremium }: { m: CardModel; isPremium: boolean }) {
  if (m.usual.kind !== "ready" || !m.usual.reading.rows.length) return null;
  const reading = m.usual.reading;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeader title="Versus Usual" className="!px-0" />
      {isPremium ? (
        <>
          <span className="t-body-sm text-secondary">Better than {reading.better} of their last {reading.games} games</span>
          <UsualTable reading={reading} isLive={m.isLive} />
          <span className="flex flex-col gap-0.5 t-label-sm text-muted">
            <span>Usual is their average over those games.</span>
            {m.isLive ? <span>Counts like kills are compared once the game ends.</span> : null}
          </span>
        </>
      ) : (
        // Free: that the comparison exists, and the way to it (the app's locked row).
        <Link href="/premium/upgrade" className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle hover:bg-surface/40 transition-colors">
          <span className="w-6 grid place-items-center shrink-0"><AssetIcon name="premiumlocked" height={22} /></span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="t-label-lg text-primary">Every stat against their usual</span>
            <span className="t-label-sm text-muted">Premium shows how each number compares with their recent games.</span>
          </span>
          <span className="flex-1" />
          <ChevronRight size={12} className="text-muted shrink-0" />
        </Link>
      )}
    </section>
  );
}

function Notice({ icon, text, onRetry }: { icon: React.ReactNode; text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 pt-20 px-8 text-center">
      <span className="text-muted [&>svg]:size-7">{icon}</span>
      <span className="t-body-sm text-muted">{text}</span>
      {onRetry ? <button type="button" onClick={onRetry} className="t-label-md text-violet hover:underline underline-offset-2">Retry</button> : null}
    </div>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────
export function StatCardScreen({ matchId, playerId, fromMatch }: { matchId: string; playerId: string; /** Opened from this match's scoreboard: the match block (and Back) return to it. */ fromMatch: boolean }) {
  const router = useRouter();
  const { isPremium } = useAppState();
  const { card, phase, isOver, retry } = useStatCard(matchId, playerId);
  const [rendering, setRendering] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const matchHref = `/match/${encodeURIComponent(matchId)}`;
  const backToMatch = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(matchHref);
  };

  const share = async () => {
    if (!card || rendering) return;
    setRendering(true);
    try {
      const out = await shareCardPicture(card, isPremium);
      if (out === "downloaded") setToast("Card saved as a picture");
      else if (out === "failed") setToast("Couldn't make the picture");
    } catch {
      setToast("Couldn't make the picture");
    } finally {
      setRendering(false);
    }
  };

  const shareButton = (
    <button type="button" onClick={() => void share()} disabled={!card || rendering} aria-label="Share" title="Share the card as a picture"
      className="grid place-items-center size-9 rounded-lg text-secondary hover:text-primary hover:bg-card disabled:opacity-40 disabled:pointer-events-none transition-colors">
      <Share size={17} />
    </button>
  );

  const hasTable = !!card && card.usual.kind === "ready" && card.usual.reading.rows.length > 0;

  let body: React.ReactNode;
  if (card) {
    body = (
      <div className={clsx("mx-auto grid gap-5 items-start", hasTable ? "max-w-[520px] lg:max-w-[1000px] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-6" : "max-w-[520px]")}>
        <div className="flex flex-col gap-3 min-w-0">
          <CardFace m={card} onBackToMatch={fromMatch ? backToMatch : null} />
          {card.isLive ? <span className="t-label-sm text-muted text-center">Updates live as the game progresses</span> : null}
        </div>
        {hasTable ? <div className="min-w-0"><UsualSection m={card} isPremium={isPremium} /></div> : null}
      </div>
    );
  } else if (phase === "failed") {
    body = <Notice icon={<WifiOff />} text="Couldn't load this match" onRetry={retry} />;
  } else if (phase === "noStats") {
    body = <Notice icon={<BarChart3 />} text={isOver ? "No stats for this player in this match." : "Live stats fill in as the game runs"} />;
  } else {
    body = <div className="mx-auto max-w-[520px]"><CardSkeleton /></div>;
  }

  return (
    <Page>
      <NavBar title="Stat Card" trailing={shareButton} onBack={fromMatch ? backToMatch : undefined} />
      <div className="px-4 pt-3 md:pt-4">{body}</div>
      <Toast message={toast} kind="info" />
    </Page>
  );
}
