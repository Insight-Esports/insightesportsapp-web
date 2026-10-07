// StatTable — PlayerDetailView's statTable: one row of muted uppercase
// labels over one row of mono values, in a bordered container. The
// marquee cell (the game's headline stat) reads violet.
"use client";

import { clsx } from "@/lib/format";

export interface StatCell {
  label: string;
  value: string;
  marquee?: boolean;
}

export function StatTable({ cells, className }: { cells: StatCell[]; className?: string }) {
  if (cells.length === 0) return null;
  return (
    <div className={clsx("rounded-xl border border-border-subtle overflow-hidden", className)}>
      <div className="flex gap-1.5 px-3 py-1.5">
        {cells.map((c, i) => (
          <span key={i} className="flex-1 text-center t-label-sm text-muted uppercase truncate">{c.label}</span>
        ))}
      </div>
      <div className="flex gap-1.5 px-3 py-3 bg-card">
        {cells.map((c, i) => (
          <span key={i} className={clsx("flex-1 text-center t-mono-md truncate", c.marquee ? "text-violet" : "text-primary")}>{c.value}</span>
        ))}
      </div>
    </div>
  );
}

/** A table header + striped rows in the bordered container (the recent-games construction). */
export function StripedTable({ header, children, className }: { header: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-border-subtle overflow-hidden bg-card [&>*:nth-child(odd)]:bg-surface/50 [&>*:first-child]:bg-transparent", className)}>
      <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase">{header}</div>
      {children}
    </div>
  );
}
