// predictions/shared.tsx — the small construction kit the prediction screens
// share: the one-row stat table, striped tables, the editorial kicker, the
// accent-bar "read", warnings, and the step header. Ledger grammar only.
"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { AlertTriangle, ChevronRight, CircleAlert } from "lucide-react";
import { clsx } from "@/lib/format";
import { LiveBadge, Spinner } from "@/components/ui";

/** Editorial kicker: 6pt violet dot + tracked small caps (sectionLabel). */
export function DotKicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <span className="size-1.5 rounded-full bg-violet shrink-0" />
      <span className="t-kicker">{children}</span>
    </div>
  );
}

/** Plain tracked small-caps label (the "LAST 10 GAMES" kind). */
export function Caps({ children, className, tone = "muted" }: { children: ReactNode; className?: string; tone?: "muted" | "violet" | "gold" }) {
  return <span className={clsx("t-label-sm uppercase tracking-[0.08em]", tone === "violet" ? "text-violet" : tone === "gold" ? "text-gold" : "text-muted", className)}>{children}</span>;
}

/** Step header: title + violet subtitle (the sub-screens' header block). */
export function StepHeader({ title, subtitle, center, live, children }: { title: string; subtitle?: ReactNode; center?: boolean; live?: boolean; children?: ReactNode }) {
  return (
    <div className={clsx("flex flex-col gap-1 px-4 pt-3", center && "items-center text-center")}>
      <div className="flex items-center gap-2">
        <h1 className={clsx(center ? "t-headline-lg" : "t-headline-md", "text-primary")}>{title}</h1>
        {live ? <LiveBadge /> : null}
      </div>
      {subtitle ? <span className={clsx("t-label-md", center ? "text-violet" : "text-muted")}>{subtitle}</span> : null}
      {children}
    </div>
  );
}

/** Hero header on the hub: title · 28pt violet rule · subtitle. */
export function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-1">
      <h1 className="t-headline-md text-primary">{title}</h1>
      <span className="violet-rule w-7" />
      <span className="t-body-sm text-muted">{subtitle}</span>
    </div>
  );
}

export interface Cell { label: string; value: ReactNode; marquee?: boolean }
/** One-row table: muted header over centered mono values, one border. */
export function StatRow({ cells, className }: { cells: Cell[]; className?: string }) {
  return (
    <div className={clsx("ledger", className)}>
      <div className="flex gap-1.5 px-3 py-1.5">
        {cells.map((c, i) => <span key={i} className="flex-1 text-center t-label-sm text-muted uppercase truncate">{c.label}</span>)}
      </div>
      <div className="flex gap-1.5 px-3 py-3 bg-card">
        {cells.map((c, i) => <span key={i} className={clsx("flex-1 text-center t-mono-md truncate", c.marquee ? "text-violet" : "text-primary")}>{c.value}</span>)}
      </div>
    </div>
  );
}

/** Striped table with a muted header row; columns are rendered by the caller. */
export function StripedTable({ header, rows, className }: { header: ReactNode; rows: ReactNode[]; className?: string }) {
  return (
    <div className={clsx("ledger", className)}>
      <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase">{header}</div>
      {rows.map((r, i) => (
        <div key={i} className={clsx("flex items-center gap-1 px-3 py-2.5", i % 2 === 0 ? "bg-card" : "bg-surface/50")}>{r}</div>
      ))}
    </div>
  );
}

/** Section block: kicker above, content beneath. */
export function Section({ title, children, trailing, className }: { title: ReactNode; children: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <section className={clsx("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Caps>{title}</Caps>
        {trailing}
      </div>
      {children}
    </section>
  );
}

/** The read, as editorial prose: accent bar + kicker + body (infoCard / lowHistoryCard). */
export function AccentRead({ kicker, children, tone = "violet" }: { kicker: string; children: ReactNode; tone?: "violet" | "gold" }) {
  return (
    <div className="flex items-stretch gap-3 py-0.5">
      <span className={clsx("w-[3px] rounded-[1px] shrink-0", tone === "gold" ? "bg-gold" : "bg-violet")} />
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{kicker}</span>
        <span className="t-body-md text-secondary">{children}</span>
      </div>
    </div>
  );
}

/** Gold-tinted warning strip (warningCard). */
export function WarningCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-gold/10">
      <AlertTriangle size={14} className="text-gold shrink-0 mt-0.5" />
      <span className="t-label-md text-secondary">{children}</span>
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="t-label-sm text-muted text-center pt-1">{children}</p>;
}

/** Bordered single-line note (vsOpponent empty note, map profile empty…). */
export function NoteCard({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle", className)}>
      {icon ? <span className="text-muted shrink-0 [&>svg]:size-3.5">{icon}</span> : null}
      <span className="t-label-md text-secondary">{children}</span>
    </div>
  );
}

/** Spinner + a line of copy, the result screens' loading state. */
export function LoadingLine({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-4 py-16", className)}>
      <Spinner />
      <span className="t-body-md text-muted">{text}</span>
    </div>
  );
}

/** Icon + message (+ optional detail) centered — the flow's error state. */
export function FlowError({ title, detail, icon, className }: { title: string; detail?: string; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-3 py-16 px-8 text-center", className)}>
      <span className="text-muted [&>svg]:size-10">{icon ?? <CircleAlert />}</span>
      <span className="t-body-md text-secondary max-w-md">{title}</span>
      {detail ? <span className="t-label-sm text-muted max-w-md">{detail}</span> : null}
    </div>
  );
}

/** Outlined option row with an icon tile (optionCard / breakdownRow). */
export function OptionRow({ href, icon, title, blurb }: { href: string; icon: ReactNode; title: string; blurb: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle hover:border-border-strong hover:bg-surface/40 transition-colors">
      <span className="grid place-items-center size-[34px] rounded-[9px] bg-surface text-violet shrink-0 [&>svg]:size-4">{icon}</span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="t-headline-sm text-primary">{title}</span>
        <span className="t-label-sm text-muted">{blurb}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={13} className="text-muted shrink-0" />
    </Link>
  );
}

/** Full-width violet CTA (the flow's "Continue" / "Get Prediction" button). */
export function BlockButton({ href, onClick, disabled, children, className, loading }: { href?: string; onClick?: () => void; disabled?: boolean; children: ReactNode; className?: string; loading?: boolean }) {
  const cls = clsx("flex items-center justify-center gap-2 w-full py-4 rounded-[14px] t-label-lg text-white transition-colors", disabled ? "bg-surface text-muted cursor-not-allowed pointer-events-none" : "bg-violet hover:brightness-110", className);
  if (href && !disabled) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled || loading} className={cls} aria-disabled={disabled}>{loading ? <Spinner size={16} className="border-white/40 border-t-white" /> : null}{children}</button>;
}

/** Thin violet progress track (breakdown bars, side win rates). */
export function Track({ ratio, color = "var(--violet)", height = 3 }: { ratio: number; color?: string; height?: number }) {
  const w = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <span className="block w-full rounded-full bg-surface overflow-hidden" style={{ height }}>
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: color, minWidth: w > 0 ? 4 : 0 }} />
    </span>
  );
}

/** W/L pips: W = filled violet, L = muted. */
export function FormPips({ form }: { form: string }) {
  const ordered = Array.from(form).reverse();
  return (
    <span className="flex items-center gap-1.5">
      {ordered.map((ch, i) => <span key={i} className={clsx("size-[9px] rounded-full", ch === "W" ? "bg-violet" : "bg-muted/35")} />)}
    </span>
  );
}
