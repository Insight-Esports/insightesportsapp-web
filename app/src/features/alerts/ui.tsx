// alerts/ui.tsx — the small pieces every Stat Alerts screen shares: the
// screen frame (centered column on desktop, full width on phones), capsule
// chips, the two-way segment, the row ⋯ menu, the anchored confirm popover,
// the live / when readouts and the outcome labels.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { clsx } from "@/lib/format";
import { Page, EmptyState } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { matchPageHref } from "@/components/ui/entity-header";
import { rememberMatch } from "@/features/matches/match-cache";
import { scoreFromSide } from "@/lib/live-matches";
import type { Match } from "@/lib/types";
import { fmtStat, isReached, scorePair, whenText, type ActiveAlert, type AlertOutcome, type HistoryAlert } from "./model";

// ── Frame ─────────────────────────────────────────────────────────────────
export function AlertsFrame({ title, back, trailing, children }: { title: string; back?: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <Page>
      <NavBar title={title} back={back} trailing={trailing} centered />
      <div className="flex flex-col gap-5 pt-2 px-4 max-w-3xl w-full mx-auto">{children}</div>
    </Page>
  );
}

/** The stat_alerts switch is off. */
export function AlertsOff({ message }: { message?: string | null }) {
  return <EmptyState className="!mx-0 mt-6" title="Temporarily unavailable" subtitle={message ?? "Stat Alerts are turned off for now. Try again later."} />;
}

/** Tracked small caps section label with an optional trailing control. */
export function SectionLabel({ children, trailing, tone = "muted" }: { children: ReactNode; trailing?: ReactNode; tone?: "muted" | "violet" }) {
  return (
    <div className="flex items-center gap-2 min-h-6">
      <span className={clsx("t-kicker", tone === "violet" && "!text-violet")}>{children}</span>
      <span className="flex-1" />
      {trailing}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────
/** Capsule chip: brand gradient when picked (the GAME / STAT chips). */
export function Chip({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        "shrink-0 px-4 py-2 rounded-full t-label-md border transition-colors disabled:opacity-40",
        selected ? "bg-violet-gradient text-white border-transparent" : "bg-surface text-secondary border-border-subtle hover:text-primary",
      )}
    >
      {label}
    </button>
  );
}

/** Two (or more) way segment: At least / Under, Next match / Every match. */
export function Segment<T extends string>({ options, value, onChange, disabled, className }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; disabled?: boolean; className?: string }) {
  return (
    <div role="radiogroup" className={clsx("grid p-[3px] rounded-[10px] bg-surface border border-border-subtle", disabled && "opacity-50", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={clsx("py-2 rounded-[8px] t-label-lg transition-colors", on ? "bg-violet text-white" : "text-secondary hover:text-primary", disabled && "cursor-not-allowed")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Click-outside + Escape closing for a small anchored overlay. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

/** The row ⋯ menu (the web's stand-in for swipe actions). */
export function RowMenu({ items, label = "More" }: { items: { label: string; onSelect: () => void; destructive?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    // Raised while open: the next row's live readout (z-10) must not paint over the menu.
    <div ref={ref} className={clsx("relative shrink-0", open ? "z-40" : "z-10")}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="grid place-items-center size-8 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors">
        <Ellipsis size={16} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full mt-1 min-w-[140px] rounded-xl bg-card border border-hairline shadow-2xl py-1 z-30">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }} className={clsx("w-full text-left px-3.5 py-2 t-label-lg hover:bg-surface transition-colors", it.destructive ? "text-error" : "text-primary")}>
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A trigger with a small confirm popover opening right under it. */
export function ConfirmPopover({ trigger, title, message, confirmTitle, onConfirm, align = "right" }: { trigger: string; title: string; message: string; confirmTitle: string; onConfirm: () => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="t-label-md text-violet hover:underline underline-offset-2">{trigger}</button>
      {open ? (
        <div role="dialog" aria-label={title} className={clsx("absolute top-full mt-2 w-[260px] max-w-[calc(100vw-32px)] rounded-xl bg-card border border-hairline shadow-2xl p-3.5 z-30 flex flex-col gap-2", align === "right" ? "right-0" : "left-0")}>
          <span aria-hidden className={clsx("absolute -top-[5px] size-2.5 rotate-45 bg-card border-l border-t border-hairline", align === "right" ? "right-5" : "left-5")} />
          <span className="t-label-lg text-primary">{title}</span>
          <span className="t-body-sm text-secondary">{message}</span>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg t-label-md text-secondary hover:text-primary hover:bg-surface">Cancel</button>
            <button type="button" onClick={() => { setOpen(false); onConfirm(); }} className="px-3 py-1.5 rounded-lg t-label-md bg-error text-white hover:brightness-110">{confirmTitle}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Readouts ──────────────────────────────────────────────────────────────
/** The live round score of a result / map alert, from the target's side. */
export function roundScore(a: Pick<ActiveAlert, "targetType" | "targetId" | "match">, live: Match | null): string | null {
  if (!live || !a.match) return null;
  const side = scoreFromSide(live, a.targetType === "team" ? a.targetId : null);
  if (side) return scorePair(side[0], side[1]);
  // Unknown side: the opponent's name tells which one is ours.
  if (a.match.opponentName && live.team2Name === a.match.opponentName) return scorePair(live.team1Score, live.team2Score);
  if (a.match.opponentName && live.team1Name === a.match.opponentName) return scorePair(live.team2Score, live.team1Score);
  return null;
}

/** "MAPS 1 – 0" in a best of 3 or 5. */
export function mapsLine(a: Pick<ActiveAlert, "match">): string | null {
  const m = a.match;
  if (!m || !m.bestOf || m.bestOf < 2) return null;
  return scorePair(m.targetScore ?? 0, m.opponentScore ?? 0);
}

/** The right side of an ACTIVE row while its match is live; opens the live match. */
export function LiveReadout({ a, live }: { a: ActiveAlert; live: Match | null }) {
  if (!a.match) return null;
  let value: string;
  let label: ReactNode;
  if (a.kind === "stat") {
    const reached = isReached(a);
    value = `${fmtStat(a.stat, a.live?.value ?? null)} / ${fmtStat(a.stat, a.target, false)}`;
    label = reached ? <span className="text-success">REACHED</span> : <span className="text-violet">LIVE</span>;
  } else {
    value = roundScore(a, live) ?? "–";
    const maps = mapsLine(a);
    label = <span className="text-violet">{maps ? `LIVE · MAPS ${maps}` : "LIVE"}</span>;
  }
  return (
    <Link
      href={matchPageHref(a.match.id)}
      onClick={() => { if (live) rememberMatch(live); }}
      aria-label="Open the live match"
      className="relative z-10 flex flex-col items-end gap-0.5 px-2 py-1 -my-1 rounded-[8px] bg-violet/12 hover:bg-violet/20 transition-colors shrink-0"
    >
      <span className="text-[15px] font-semibold font-mono tabular-nums text-primary leading-tight whitespace-nowrap">{value}</span>
      <span className="text-[10px] font-semibold tracking-[0.08em] leading-none whitespace-nowrap">{label}</span>
    </Link>
  );
}

/** The right side of an ACTIVE row before its match: "vs Opponent" / "Next match" / "Every match" + "Tue 7:00 PM". */
export function WhenReadout({ a }: { a: ActiveAlert }) {
  const top = a.match?.opponentName ? `vs ${a.match.opponentName}` : a.repeat ? "Every match" : "Next match";
  const when = whenText(a.match?.scheduledAt);
  return (
    <span className="flex flex-col items-end gap-0.5 shrink-0 max-w-[45%] min-w-0">
      <span className="t-label-md text-secondary truncate max-w-full">{top}</span>
      {when ? <span className="t-label-sm text-muted whitespace-nowrap">{when}</span> : null}
    </span>
  );
}

export function outcomeWord(o: AlertOutcome): string {
  return o === "hit" ? "HIT" : o === "miss" ? "MISS" : "DIDN'T PLAY";
}
export function outcomeClass(o: AlertOutcome): string {
  return o === "hit" ? "text-success" : o === "miss" ? "text-secondary" : "text-muted";
}

/** History readout: the final number (signed for +/−) or the final score, with HIT / MISS / DIDN'T PLAY. */
export function HistoryReadout({ h }: { h: HistoryAlert }) {
  const value = h.kind === "stat" ? (h.finalValue != null ? fmtStat(h.stat, h.finalValue) : "–") : (h.finalScore ?? "–");
  return (
    <span className="flex flex-col items-end gap-0.5 shrink-0">
      <span className={clsx("text-[15px] font-semibold font-mono tabular-nums leading-tight whitespace-nowrap", h.outcome === "void" ? "text-muted" : "text-primary")}>{value}</span>
      <span className={clsx("text-[10px] font-semibold tracking-[0.08em] leading-none whitespace-nowrap", outcomeClass(h.outcome))}>{outcomeWord(h.outcome)}</span>
    </span>
  );
}

/** The 2px progress line under a live "at least" row: value ÷ target, 0–100%. */
export function ProgressLine({ a }: { a: ActiveAlert }) {
  if (a.kind !== "stat" || a.direction === "under" || !a.live || a.target == null || a.target === 0) return null;
  const ratio = Math.max(0, Math.min(1, (a.live.value ?? 0) / a.target));
  const reached = isReached(a);
  return (
    // Clipped to the row's own corners (the list itself can't clip: row menus open over it).
    <span aria-hidden className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
      <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-surface">
        <span className={clsx("block h-full transition-[width] duration-500", reached ? "bg-success" : "bg-violet")} style={{ width: `${(reached ? 1 : ratio) * 100}%` }} />
      </span>
    </span>
  );
}

/** The ledger look without the ledger's clipping, so a row's ⋯ menu can open over the rows below. */
export function AlertList({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-ledger)] border border-hairline bg-card">{children}</div>;
}
/** Row classes: hairline between rows, corners on the first and last. */
export const alertRowClass = "relative flex items-center gap-3 pl-3.5 pr-1.5 py-3 transition-colors hover:bg-surface/40 [&+&]:border-t [&+&]:border-border-subtle first:rounded-t-[var(--radius-ledger)] last:rounded-b-[var(--radius-ledger)]";
