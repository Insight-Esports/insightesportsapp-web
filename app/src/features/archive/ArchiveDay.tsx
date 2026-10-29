// ArchiveDay — Archive.swift's day page at /archive/[year]/[date]?game=:
// titled with the long date, that day's matches as result cards (each opens
// the match page), cursor-paged as the list scrolls.
"use client";

import { EmptyState, GameTabBar, LoadFailure, Page, SkeletonMatchCard } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { CompletedMatchRow } from "@/features/matches/cards";
import { CardGrid, useGameParam } from "@/features/matches/shared";
import { useArchiveMatches, useArchiveSwitch } from "./data";
import { ArchiveGlyph, ArchiveOff, LoadMoreFooter, PremiumWall, PremiumWindowNote, archiveYearHref } from "./shared";
import { isDayKey, longDayLabel } from "./types";

export function ArchiveDay({ dateKey }: { dateKey: string }) {
  const [game, setGame] = useGameParam();
  const gameArg = game === "all" ? null : game;
  const archive = useArchiveSwitch();
  const valid = isDayKey(dateKey);
  const list = useArchiveMatches(valid && !archive.off ? { game: gameArg, date: dateKey } : null, 40);
  const year = valid ? Number(dateKey.slice(0, 4)) : new Date().getUTCFullYear();
  const n = list.rows.length;

  let content;
  if (archive.off) content = <ArchiveOff message={archive.message} />;
  else if (!valid) content = <EmptyState icon={<ArchiveGlyph />} title="Content not found." />;
  else if (!list.loaded) content = <div className="px-4"><CardGrid columns={2}>{[0, 1, 2, 3].map((i) => <SkeletonMatchCard key={i} />)}</CardGrid></div>;
  else if (list.error) content = <LoadFailure error={list.error} connectionProblem={list.connectionProblem} onRetry={list.reload} />;
  else if (list.locked) content = <PremiumWall />;
  else if (n === 0) content = <EmptyState icon={<ArchiveGlyph />} title="No matches on record" subtitle="Try another day or game." />;
  else content = (
    <>
      {list.freeDays ? <PremiumWindowNote days={list.freeDays} className="mb-3" /> : null}
      <div className="px-4">
        <CardGrid columns={2}>
          {list.rows.map((m) => <CompletedMatchRow key={m.id} match={m} className="h-full" />)}
        </CardGrid>
      </div>
      <LoadMoreFooter reachedEnd={list.reachedEnd} loadingMore={list.loadingMore} error={list.moreError} onLoadMore={() => void list.loadMore()} />
    </>
  );

  return (
    <Page>
      <NavBar title={valid ? longDayLabel(dateKey) : "Archive"} back={archiveYearHref(year, game)} />
      <GameTabBar selected={game} onChange={setGame} className="pt-3 pb-1" />
      <div className="flex items-center px-4 pt-3 pb-3 t-label-md text-muted min-h-[20px]">
        {list.loaded && !list.error && !list.locked && n > 0 ? `${n}${list.reachedEnd ? "" : "+"} ${n === 1 ? "match" : "matches"}` : null}
      </div>
      {content}
    </Page>
  );
}
