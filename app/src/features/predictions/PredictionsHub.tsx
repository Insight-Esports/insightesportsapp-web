// predictions/PredictionsHub.tsx — the Premium tab root, laid out like the
// other tabs: the game bar, then ANALYZE (Players · Teams → the predictor's
// target picker), STAT ALERTS and YOUR REPORT. Whole tab is premium-gated.
// Nov 5 §10: the Weekly Report row is a row like the others — the report
// glyph in violet on the surface tile, "Weekly Report", one-line blurb.
"use client";

import Link from "next/link";
import { useState } from "react";
import { BellDot, ChevronRight, User, Users } from "lucide-react";
import { SELECTABLE_GAMES, type GameId } from "@/lib/types";
import { GameTabBar, Page, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { PremiumGate } from "@/features/premium/PremiumGate";
import { alertsListHref } from "@/features/alerts/entry";
import { useAlerts } from "@/features/alerts/store";
import { ReportGlyph } from "@/features/reports/ReportMark";
import { flowHref } from "./flow";
import { DotKicker } from "./shared";

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
  // The Premium tab now reads like the other tabs: the game bar on top, then
  // ANALYZE (Players · Teams), STAT ALERTS and YOUR REPORT.
  const [game, setGame] = useState<GameId>("VALORANT");

  return (
    <div className="flex flex-col gap-5 pb-2">
      <GameTabBar selected={game} onChange={setGame} games={SELECTABLE_GAMES} className="pt-2" />

      <section className="flex flex-col gap-3">
        <DotKicker className="px-4">ANALYZE</DotKicker>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 px-4 lg:grid-cols-2 lg:gap-x-6">
          <HubRow index={0} href={flowHref.select(game, "player")} icon={<User size={18} fill="currentColor" strokeWidth={1.5} />} title="Players" blurb="Stat lines, live reads, full breakdowns" />
          <HubRow index={1} href={flowHref.select(game, "team")} icon={<Users size={20} fill="currentColor" strokeWidth={1.5} />} title="Teams" blurb="Stat lines, head-to-head, map profiles" />
        </div>
      </section>

      <div className="mx-4 hairline-b" />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 lg:grid-cols-2 lg:gap-x-6">
        <StatAlertsSection />
        <section className="flex flex-col gap-3 min-w-0">
          <DotKicker>YOUR REPORT</DotKicker>
          <div>
            <HubRow index={3} href="/weekly-report" icon={<ReportGlyph size={20} />} title="Weekly Report" blurb="Your teams, players and calls, each week" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** STAT ALERTS: the bell row, "N active · a push the moment one hits". Hidden while stat_alerts is off. */
function StatAlertsSection() {
  const alerts = useAlerts({ maxAgeMs: 60_000 });
  if (alerts.off) return null;
  const n = alerts.active.length;
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <DotKicker>STAT ALERTS</DotKicker>
      <div>
        <HubRow index={2} href={alertsListHref()} icon={<BellDot size={19} strokeWidth={2} />} title="Stat Alerts" blurb={n > 0 ? `${n} active · a push the moment one hits` : "A push the moment your call hits"} />
      </div>
      {/* Phones: the rule between STAT ALERTS and YOUR REPORT (desktop sets them side by side). */}
      <div className="hairline-b mt-2 lg:hidden" />
    </section>
  );
}

/** The rows come in one after another, 40 ms apart (`.row-in` reads --i). */
function stagger(i: number): React.CSSProperties {
  return { "--i": i } as React.CSSProperties;
}

/** A Premium tab row: violet glyph on a surface tile, title, one-line blurb,
 *  chevron. Staggers in at `index`, sinks under the pointer. */
function HubRow({ href, icon, title, blurb, index }: { href: string; icon: React.ReactNode; title: string; blurb: string; index: number }) {
  return (
    <Link href={href} className="pressable row-in flex items-center gap-3.5 p-4 rounded-[14px] bg-card border border-border-subtle hover:border-border-strong hover:bg-surface/40 transition-colors" style={stagger(index)}>
      <span className="grid place-items-center size-10 rounded-[10px] bg-surface text-violet shrink-0">{icon}</span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[18px] font-semibold leading-tight tracking-[-0.2px] text-primary">{title}</span>
        <span className="t-label-sm text-muted truncate">{blurb}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={14} className="text-muted shrink-0" />
    </Link>
  );
}
