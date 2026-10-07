// predictions/PredictionsHub.tsx — PredictionsView / PredictionFlowView: the
// Premium tab root. Game → Player or Team → Continue into the predictor,
// direct Breakdowns, and the Weekly Report door. Whole tab is premium-gated.
"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, User, Users } from "lucide-react";
import { clsx } from "@/lib/format";
import { SELECTABLE_GAMES } from "@/lib/types";
import { AssetIcon, FilterSegment, Page, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { PremiumGate } from "@/features/premium/PremiumGate";
import { flowHref } from "./flow";
import { BlockButton, DotKicker, Hero } from "./shared";
import type { PredictionTargetType } from "./types";

export function PredictionsHub() {
  return (
    <Page>
      <TabHeader title="Premium" tools={<HeaderTools />} />
      <PremiumGate feature="predictions">
        <PredictionFlow />
      </PremiumGate>
    </Page>
  );
}

function PredictionFlow() {
  const [game, setGame] = useState<string>("VALORANT");
  const [targetType, setTargetType] = useState<PredictionTargetType>("player");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 pt-2">
      {/* ── Predict ── */}
      <div className="flex flex-col gap-5">
        <Hero title="Build a prediction" subtitle="Pick a game and whether you're analyzing a player or a team." />

        <DotKicker className="px-4">PREDICT</DotKicker>

        <div className="flex flex-col gap-2.5 px-4">
          <span className="t-label-sm text-muted">GAME</span>
          <FilterSegment options={SELECTABLE_GAMES.map((g) => ({ label: g.label, value: g.id }))} value={game} onChange={setGame} />
        </div>

        <div className="flex flex-col gap-2.5 px-4">
          <span className="t-label-sm text-muted">ANALYZE</span>
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-[22px]">
              <TargetHalf selected={targetType === "player"} onClick={() => setTargetType("player")} icon={<User size={12} />} title="Player" />
              <TargetHalf selected={targetType === "team"} onClick={() => setTargetType("team")} icon={<Users size={12} />} title="Team" />
            </div>
            <span className="t-label-sm text-muted">
              {targetType === "player" ? "Individual stat lines, form, and matchup context" : "Team stat lines, head-to-head, and map profiles"}
            </span>
          </div>
        </div>

        <div className="px-4">
          <BlockButton href={flowHref.select(game, targetType)}>Continue<ArrowRight size={16} /></BlockButton>
        </div>
      </div>

      {/* ── Breakdowns + report ── */}
      <div className="flex flex-col gap-5">
        <div className="mx-4 hairline-b lg:hidden" />

        <DotKicker className="px-4">BREAKDOWNS</DotKicker>
        <div className="flex flex-col gap-2.5 px-4">
          <BreakdownRow href={flowHref.select(game, "player", true)} icon={<User size={16} />} title="Player Breakdown" blurb="Career averages, map & agent splits, recent form" />
          <BreakdownRow href={flowHref.select(game, "team", true)} icon={<Users size={16} />} title="Team Breakdown" blurb="Records, map profiles, head-to-head form" />
        </div>

        <div className="mx-4 hairline-b" />

        <DotKicker className="px-4">YOUR REPORT</DotKicker>
        <div className="px-4">
          <Link href="/weekly-report" className="flex items-center gap-3 p-4 rounded-[14px] bg-card border border-border-subtle hover:border-border-strong hover:bg-surface/40 transition-colors">
            <span className="relative grid place-items-center size-11 rounded-xl bg-violet-gradient shrink-0">
              <span className="absolute inset-0 rounded-xl bg-white/14" />
              <AssetIcon name="weeklyreport" height={24} className="relative" />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="t-headline-sm text-primary">Your Weekly Report</span>
              <span className="t-label-sm text-muted truncate">Weekly recap of your teams, players, and predictions</span>
            </span>
            <span className="flex-1" />
            <ChevronRight size={13} className="text-muted shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Label + 2pt violet underline — the app's selection shape, with its icon. */
function TargetHalf({ selected, onClick, icon, title }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex flex-col items-center gap-1.5">
      <span className={clsx("flex items-center gap-1.5 whitespace-nowrap", selected ? "t-label-lg text-primary" : "t-body-md text-muted")}>{icon}{title}</span>
      <span className={clsx("violet-rule w-full", !selected && "opacity-0")} />
    </button>
  );
}

function BreakdownRow({ href, icon, title, blurb }: { href: string; icon: React.ReactNode; title: string; blurb: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3.5 rounded-[14px] bg-card border border-border-subtle hover:border-border-strong hover:bg-surface/40 transition-colors">
      <span className="grid place-items-center size-8 rounded-[9px] bg-surface text-violet shrink-0">{icon}</span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="t-headline-sm text-primary">{title}</span>
        <span className="t-label-sm text-muted truncate">{blurb}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={13} className="text-muted shrink-0" />
    </Link>
  );
}
