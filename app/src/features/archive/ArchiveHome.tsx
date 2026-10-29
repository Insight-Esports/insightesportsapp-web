// ArchiveHome — Archive.swift's general archive at /archive?game=.
// Game tabs, the one-line explainer, then a row per year ("2026 · 812
// matches") into that year's calendar.
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState, GameTabBar, Ledger, LoadFailure, Page, SkeletonLedger } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { useGameParam } from "@/features/matches/shared";
import { useArchiveSwitch, useArchiveYears } from "./data";
import { ArchiveColumn, ArchiveGlyph, ArchiveOff, archiveYearHref } from "./shared";

export function ArchiveHome() {
  const [game, setGame] = useGameParam();
  const gameArg = game === "all" ? null : game;
  const archive = useArchiveSwitch();
  const years = useArchiveYears({ game: gameArg }, !archive.off);

  let content;
  if (archive.off) content = <ArchiveOff message={archive.message} />;
  else if (years.loading && !years.data) content = <SkeletonLedger rows={8} avatar={0} className="mx-4" />;
  else if (years.error && !years.data) content = <LoadFailure error={years.error} connectionProblem={years.connectionProblem} onRetry={years.reload} />;
  else if (!years.data || years.data.length === 0) content = <EmptyState icon={<ArchiveGlyph />} title="Nothing archived yet" subtitle="Completed real matches land here." />;
  else content = (
    <div className="px-4">
      <Ledger>
        {years.data.map((y) => (
          <Link key={y.year} href={archiveYearHref(y.year, game)} className="ledger-row hover:bg-surface/60 transition-colors">
            <span className="t-headline-sm text-primary tabular-nums">{y.year}</span>
            <span className="text-muted">·</span>
            <span className="t-body-md text-secondary">{y.matches.toLocaleString()} {y.matches === 1 ? "match" : "matches"}</span>
            <span className="flex-1" />
            <ChevronRight size={14} className="text-muted" />
          </Link>
        ))}
      </Ledger>
    </div>
  );

  return (
    <Page>
      <ArchiveColumn>
        <NavBar title="Archive" />
        <GameTabBar selected={game} onChange={setGame} className="pt-3 pb-1" />
        <p className="px-4 pt-3 pb-3 t-body-sm text-muted">Every real match we hold, by the day it was played.</p>
        {content}
      </ArchiveColumn>
    </Page>
  );
}
