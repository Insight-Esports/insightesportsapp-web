// predictions/MapGrid.tsx — the map picker the Map Profile, the live team
// breakdown and the Head-to-Head setup share (parity doc 2026-10-29 §3): the
// whole pool in two rows, ceil(cells / 2) per row, never a sideways scroll.
// FilterChip's underline style, the underline as wide as the name; the map
// being played gets a 6px red dot at its top-right. `anyLabel` adds a leading
// "Any map" cell (value null) — H2H's optional map.
"use client";

import { clsx } from "@/lib/format";

export function MapGrid({ maps, selected, onSelect, liveMap, anyLabel, className, ariaLabel = "Map" }: {
  maps: string[];
  selected: string | null;
  onSelect: (map: string | null) => void;
  /** The map being played right now (red dot). */
  liveMap?: string | null;
  /** A leading cell that stands for "no map" (null). */
  anyLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const cells: { value: string | null; label: string }[] = [
    ...(anyLabel ? [{ value: null, label: anyLabel }] : []),
    ...maps.map((m) => ({ value: m, label: m })),
  ];
  if (cells.length === 0) return null;
  const perRow = Math.ceil(cells.length / 2);
  const live = (liveMap ?? "").toLowerCase();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx("grid gap-x-2 gap-y-3.5 w-full max-w-[640px]", className)} style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
      {cells.map((c) => {
        const on = c.value === selected || (c.value != null && selected != null && c.value.toLowerCase() === selected.toLowerCase());
        const isLive = !!live && c.value != null && c.value.toLowerCase() === live;
        return (
          <button
            key={c.value ?? "__any"}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(c.value)}
            title={isLive ? `${c.label} · being played now` : undefined}
            className="justify-self-start inline-flex flex-col items-stretch gap-1.5"
          >
            <span className={clsx("relative block whitespace-nowrap leading-tight", on ? "t-label-lg text-primary" : "t-body-md text-muted hover:text-secondary")}>
              {c.label}
              {isLive ? <span aria-hidden className="absolute -top-[3px] -right-[7px] size-1.5 rounded-full bg-live" /> : null}
            </span>
            <span className={clsx("violet-rule w-full", !on && "opacity-0")} />
          </button>
        );
      })}
    </div>
  );
}
