// tournaments/stages/StandingsTable.tsx — a Swiss or group table (iOS
// TournamentStages.swift StandingsTable): TEAM · W–L · ± · (ADV / OUT).
// By record (a Swiss stage) the rows sit under a kicker a record, "3–0 ·
// THROUGH" … "0–3 · OUT". In a group the left column is the place once it is
// decided (1st and 2nd through), else the seed; ± is the map difference
// (rounds in a best-of-one Swiss). Through reads violet ADV, out greyed OUT.
// Each row opens the team.
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { TeamMark } from "@/components/ui";
import { clsx } from "@/lib/format";
import { standingAdvanced, standingOut, standingRecord, type Standing } from "../data";

const teamHref = (id: string) => `/teams/${encodeURIComponent(id)}`;

/** Placed first (1st … 4th), then by wins, losses, difference and seed. */
function ordered(rows: Standing[]): Standing[] {
  return rows.slice().sort((a, b) => {
    if (a.place != null && b.place != null && a.place !== b.place) return a.place - b.place;
    if ((a.place == null) !== (b.place == null)) return a.place != null ? -1 : 1;
    return (b.wins - a.wins) || (a.losses - b.losses) || ((b.diff ?? 0) - (a.diff ?? 0)) || ((a.team.seed ?? 99) - (b.team.seed ?? 99));
  });
}

/** "+3", "0", "−2"; blank when the server gives none. */
function signed(v: number | null): string {
  if (v == null) return "";
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";
}

export function StandingsTable({ rows, byRecord = false }: { rows: Standing[]; /** Swiss: grouped under a kicker a record. */ byRecord?: boolean }) {
  const list = ordered(rows);
  return (
    <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        <span className="flex-1">Team</span>
        <span className="w-11 text-right">W–L</span>
        <span className="w-9 text-right">±</span>
        <span className="w-9" />
      </div>
      {list.map((r, i) => (
        <Fragment key={r.team.id}>
          {byRecord && (i === 0 || standingRecord(list[i - 1]) !== standingRecord(r)) ? <RecordKicker r={r} /> : null}
          <StandingRow r={r} striped={i % 2 === 1} />
        </Fragment>
      ))}
    </div>
  );
}

/** "3–0 · THROUGH" / "1–2" / "0–3 · OUT" */
function RecordKicker({ r }: { r: Standing }) {
  const through = standingAdvanced(r);
  const out = standingOut(r);
  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-surface border-t border-border-subtle">
      <span className="t-mono-sm text-secondary">{standingRecord(r)}</span>
      {through || out ? (
        <>
          <span className="t-label-sm text-muted">·</span>
          <span className={clsx("text-[10px] font-bold tracking-[0.1em]", through ? "text-violet" : "text-muted")}>{through ? "THROUGH" : "OUT"}</span>
        </>
      ) : null}
    </div>
  );
}

function StandingRow({ r, striped }: { r: Standing; striped: boolean }) {
  const through = standingAdvanced(r);
  const out = standingOut(r);
  const lead = r.place ?? r.team.seed;
  return (
    <Link
      href={teamHref(r.team.id)}
      className={clsx("flex items-center gap-2 px-4 py-2.5 min-h-[46px] hover:bg-surface transition-colors", striped && "bg-surface/50", out && "opacity-45")}
    >
      <span className="flex-1 min-w-0 flex items-center gap-2">
        {/* A group shows the place once decided; a Swiss table the seed. */}
        <span className={clsx("w-4 shrink-0 text-right t-mono-sm", r.place != null ? "text-secondary" : "text-muted")}>{lead ?? ""}</span>
        <TeamMark name={r.team.name} logoURL={r.team.logoURL} size={20} />
        <span className={clsx("min-w-0 truncate text-primary", through ? "t-label-lg" : "t-body-md")}>{r.team.name}</span>
      </span>
      <span className="w-11 shrink-0 text-right t-mono-md text-primary tabular-nums">{standingRecord(r)}</span>
      <span className="w-9 shrink-0 text-right t-mono-sm text-secondary tabular-nums">{signed(r.diff)}</span>
      <span className={clsx("w-9 shrink-0 text-right text-[10px] font-bold tracking-[0.1em]", through ? "text-violet" : "text-muted")}>{through ? "ADV" : out ? "OUT" : ""}</span>
    </Link>
  );
}
