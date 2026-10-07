// UpcomingMatchScreen.tsx — UpcomingMatchDetailView: the pre-match hub for
// an upcoming fixture. Who's playing, when, the stored pre-match odds,
// both rosters with a player to watch, recent form, map pools and any
// previous meetings — all free-tier data. One locked row points premium
// at the full head-to-head breakdown.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftRight, ChevronRight, Target } from "lucide-react";
import { AssetIcon, InitialAvatar, Page, SectionHeader, SkeletonBar, SkeletonLedger, SkeletonStatRow, SplitLayout, TeamMark } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { clsx, formatDate, formatTime, relativeDayLabel } from "@/lib/format";
import { matchResultTime, normalizeMatches, normalizePlayers, normalizeTeams, team1Color, team2Color, type Json, type Match, type Player } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { MapPoolSection } from "../MapPoolSection";
import { FollowTeamsRow } from "./FollowTeams";
import { MatchCommentsSection } from "./MatchComments";
import { playerHref, teamHref } from "./sections";

interface PreviewState {
  loading: boolean;
  team1Roster: Player[];
  team2Roster: Player[];
  team1Form: boolean[];
  team2Form: boolean[];
  team1Record: string;
  team2Record: string;
  meetings: Match[];
  team1Rank: number | null;
  team2Rank: number | null;
  winProb1: number | null;
  winProb2: number | null;
  team1Id: string;
  team2Id: string;
}

function ordered(roster: Player[]): Player[] {
  return [...roster].sort((a, b) => {
    const sa = (a.rosterStatus ?? "").toLowerCase() === "starter" ? 0 : 1;
    const sb = (b.rosterStatus ?? "").toLowerCase() === "starter" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
}
function form(ms: Match[], id: string, name: string): [boolean[], string] {
  const sorted = [...ms].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const outcomes = sorted.map((m) => {
    const we1 = m.team1Id === id || m.team1Name === name;
    return we1 ? m.team1Score > m.team2Score : m.team2Score > m.team1Score;
  });
  const w = outcomes.filter(Boolean).length;
  return [outcomes, `${w}–${outcomes.length - w}`];
}

function usePreview(match: Match): PreviewState {
  const [st, setSt] = useState<PreviewState>({ loading: true, team1Roster: [], team2Roster: [], team1Form: [], team2Form: [], team1Record: "", team2Record: "", meetings: [], team1Rank: null, team2Rank: null, winProb1: null, winProb2: null, team1Id: match.team1Id ?? "", team2Id: match.team2Id ?? "" });

  useEffect(() => {
    let active = true;
    (async () => {
      const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };
      // Phase 1 — resolve ids. Upcoming rows frequently ship without team
      // ids; the team lookup by name fills them (and gives ranks).
      const [l1, l2] = await Promise.all([
        safe(api.get<Json>(endpoints.teams(match.game, match.team1Name, 5)).then(normalizeTeams)),
        safe(api.get<Json>(endpoints.teams(match.game, match.team2Name, 5)).then(normalizeTeams)),
      ]);
      const found1 = l1?.find((t) => t.id === match.team1Id || t.name === match.team1Name) ?? null;
      const found2 = l2?.find((t) => t.id === match.team2Id || t.name === match.team2Name) ?? null;
      const t1 = match.team1Id ?? found1?.id ?? "";
      const t2 = match.team2Id ?? found2?.id ?? "";

      // Phase 2 — everything else, in parallel, on resolved ids.
      const storedOdds = match.team1WinProbability !== null && match.team2WinProbability !== null && match.team1WinProbability + match.team2WinProbability > 0;
      const [r1, r2, m1, m2, h2h] = await Promise.all([
        t1 ? safe(api.get<Json>(endpoints.teamPlayers(t1)).then(normalizePlayers)) : null,
        t2 ? safe(api.get<Json>(endpoints.teamPlayers(t2)).then(normalizePlayers)) : null,
        t1 ? safe(api.get<Json>(endpoints.completedMatches(match.game, 50, 0, t1)).then(normalizeMatches)) : null,
        t2 ? safe(api.get<Json>(endpoints.completedMatches(match.game, 50, 0, t2)).then(normalizeMatches)) : null,
        !t1 || !t2 || storedOdds ? null : safe(api.post<Json>(endpoints.headToHead, { game: match.game, team1Id: t1, team2Id: t2 })),
      ]);
      if (!active) return;
      const matches1 = (m1 ?? []).filter((m) => m.status === "completed");
      const matches2 = (m2 ?? []).filter((m) => m.status === "completed");
      const [f1, rec1] = form(matches1, t1, match.team1Name);
      const [f2, rec2] = form(matches2, t2, match.team2Name);
      const seen = new Set<string>();
      const meetings = [...matches1, ...matches2]
        .filter((m) => {
          const names = [m.team1Name, m.team2Name];
          const ids = [m.team1Id ?? "", m.team2Id ?? ""];
          return (names.includes(match.team1Name) || (t1 && ids.includes(t1))) && (names.includes(match.team2Name) || (t2 && ids.includes(t2)));
        })
        .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
        .slice(0, 5);

      let winProb1: number | null = null, winProb2: number | null = null;
      if (storedOdds) {
        const p1 = match.team1WinProbability!, p2 = match.team2WinProbability!;
        winProb1 = p1 <= 1 ? p1 * 100 : p1;
        winProb2 = p2 <= 1 ? p2 * 100 : p2;
      } else if (typeof h2h?.team1?.winProbability === "number" && typeof h2h?.team2?.winProbability === "number") {
        winProb1 = h2h.team1.winProbability;
        winProb2 = h2h.team2.winProbability;
      }
      setSt({
        loading: false,
        team1Roster: ordered(r1 ?? []), team2Roster: ordered(r2 ?? []),
        team1Form: f1, team2Form: f2, team1Record: rec1, team2Record: rec2,
        meetings, team1Rank: found1?.ranking ?? null, team2Rank: found2?.ranking ?? null,
        winProb1, winProb2, team1Id: t1, team2Id: t2,
      });
    })();
    return () => { active = false; };
  }, [match]);
  return st;
}

function kickoffLabel(iso: string): string {
  const day = relativeDayLabel(iso);
  const dayPart = day === "Today" || day === "Tomorrow" ? day : formatDate(iso, { weekday: "short", month: "short", day: "numeric" });
  return `${dayPart} · ${formatTime(iso)}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-[11px]">
      <span className="t-body-sm text-muted">{label}</span>
      <span className="t-body-sm text-primary">{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-start px-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <span className="size-16 rounded-full bg-surface" />
            <SkeletonBar width={88} height={12} />
            <SkeletonBar width={48} height={8} />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1.5"><SkeletonBar width={140} height={10} /><SkeletonBar width={180} height={8} /></div>
      <div className="px-4"><SkeletonStatRow columns={2} /></div>
      <div className="px-4"><SkeletonLedger rows={4} avatar={0} /></div>
      <div className="px-4"><SkeletonLedger rows={2} avatar={20} /></div>
      <div className="px-4 grid grid-cols-2 gap-2.5"><SkeletonLedger rows={5} avatar={24} /><SkeletonLedger rows={5} avatar={24} /></div>
    </div>
  );
}

export function UpcomingMatchScreen({ match }: { match: Match }) {
  const { isPremium } = useAppState();
  const vm = usePreview(match);
  const c1 = team1Color(match);
  const c2 = team2Color(match);
  const kickoff = kickoffLabel(match.scheduledAt);
  const context = [match.game.toUpperCase(), ...(match.tournamentName ? [match.tournamentName.toUpperCase()] : []), `BO${match.bestOf}`].join("  ·  ");
  const star1 = vm.team1Roster.reduce<Player | null>((b, p) => (!b || (p.rating ?? 0) > (b.rating ?? 0) ? p : b), null);
  const star2 = vm.team2Roster.reduce<Player | null>((b, p) => (!b || (p.rating ?? 0) > (b.rating ?? 0) ? p : b), null);

  const teamColumn = (name: string, logo: string | null, id: string | null, rank: number | null) => (
    <Link href={teamHref(id || null, name)} className="flex-1 flex flex-col items-center gap-2 min-w-0 rounded-xl py-2 hover:bg-surface/40 transition-colors">
      <TeamMark name={name} logoURL={logo} size={64} />
      <span className="t-headline-sm text-primary text-center line-clamp-2">{name}</span>
      {rank && rank > 0 ? <span className="flex gap-1 t-label-sm"><span className="text-muted">Rank</span><span className="text-primary">#{rank}</span></span> : null}
    </Link>
  );

  const rosterColumn = (roster: Player[], star: Player | null) => (
    <div className="ledger flex-1 min-w-0">
      {roster.slice(0, 5).map((p, i) => (
        <Link key={p.id} href={playerHref(p.id, p.name)} className={clsx("flex items-center gap-2 px-2.5 py-2 hover:bg-surface/60 transition-colors", i > 0 && "border-t border-border-subtle")}>
          <InitialAvatar name={p.name} imageURL={p.imageURL} size={28} />
          <span className="flex flex-col min-w-0">
            <span className="flex items-center gap-1 min-w-0">
              <span className="t-body-sm text-primary truncate">{p.name}</span>
              {star && p.id === star.id ? <span className="size-1.5 rounded-full bg-violet shrink-0" /> : null}
            </span>
            {p.role && p.role.toLowerCase() !== "unknown" ? <span className="t-label-sm text-muted truncate">{p.role}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  );

  const formRow = (name: string, color: string, f: boolean[], record: string) => (
    <div className="flex items-center gap-3 px-3.5 py-[11px]">
      <span className="t-body-sm text-primary truncate">{name}</span>
      <span className="flex-1" />
      <span className="flex gap-[5px]">
        {f.slice(-5).map((won, i) => <span key={i} className="size-[7px] rounded-full" style={{ background: won ? color : "color-mix(in srgb, var(--text-muted) 35%, transparent)" }} />)}
      </span>
      <span className="t-mono-sm text-muted w-11 text-right">{record}</span>
    </div>
  );

  const proRow = (href: string, title: string, blurb: string, icon: React.ReactNode, disabled = false) => (
    <Link key={title} href={href} aria-disabled={disabled} className={clsx("flex items-center gap-3 p-3 rounded-xl bg-card border border-border-subtle hover:bg-surface/40 transition-colors", disabled && "opacity-50 pointer-events-none")}>
      {icon}
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="t-body-md text-primary">{title}</span>
        <span className="t-label-sm text-muted truncate">{blurb}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={12} className="text-muted" />
    </Link>
  );
  const q = (v: string) => encodeURIComponent(v);
  const iconBox = (node: React.ReactNode) => <span className="grid place-items-center size-[30px] rounded-lg bg-surface text-violet shrink-0">{node}</span>;

  const main = vm.loading ? <Skeleton /> : (
    <div className="flex flex-col gap-6 pt-2">
      {/* Hero */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-start">
          {teamColumn(match.team1Name, match.team1LogoURL, vm.team1Id, vm.team1Rank)}
          <div className="w-14 flex flex-col items-center gap-1.5 pt-[26px]">
            <span className="font-rounded text-[13px] font-black text-muted">VS</span>
            <span className="w-[22px] h-0.5 bg-violet" />
          </div>
          {teamColumn(match.team2Name, match.team2LogoURL, vm.team2Id, vm.team2Rank)}
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="t-label-md text-primary">{kickoff}</span>
          <span className="text-[10px] font-semibold tracking-[1.2px] text-muted text-center">{context}</span>
        </div>
        <FollowTeamsRow match={match} team1Id={vm.team1Id || null} team2Id={vm.team2Id || null} />
      </div>

      {/* Odds */}
      {vm.winProb1 !== null && vm.winProb2 !== null && vm.winProb1 + vm.winProb2 > 0 ? (
        <div className="flex flex-col gap-2.5">
          <SectionHeader title="Win Probability" className="!px-0" />
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="t-mono-md" style={{ color: c1 }}>{Math.round(vm.winProb1)}%</span>
              <span className="t-mono-md" style={{ color: c2 }}>{Math.round(vm.winProb2)}%</span>
            </div>
            <div className="flex h-2.5 rounded-[5px] overflow-hidden" role="meter" aria-valuenow={Math.round(vm.winProb1)} aria-valuemin={0} aria-valuemax={100} aria-label={`${match.team1Name} win probability`}>
              <span style={{ width: `${(vm.winProb1 / Math.max(1, vm.winProb1 + vm.winProb2)) * 100}%`, background: c1 }} />
              <span className="flex-1" style={{ background: c2, opacity: 0.85 }} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Match info */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader title="Match Info" className="!px-0" />
        <div className="ledger [&>*+*]:border-t [&>*+*]:border-border-subtle">
          <InfoRow label="Format" value={`Best of ${match.bestOf}`} />
          {match.stage ? <InfoRow label="Stage" value={match.stage} /> : null}
          {match.mapName ? <InfoRow label="Map" value={match.mapName} /> : null}
          <InfoRow label="Kickoff" value={kickoff} />
        </div>
      </div>

      {/* Recent form */}
      {vm.team1Form.length || vm.team2Form.length ? (
        <div className="flex flex-col gap-2.5">
          <SectionHeader title="Recent Form" className="!px-0" />
          <div className="ledger [&>*+*]:border-t [&>*+*]:border-border-subtle">
            {formRow(match.team1Name, c1, vm.team1Form, vm.team1Record)}
            {formRow(match.team2Name, c2, vm.team2Form, vm.team2Record)}
          </div>
        </div>
      ) : null}

      {/* Map pools */}
      <div className="grid gap-6 md:grid-cols-2 -mx-4">
        {vm.team1Id ? <MapPoolSection teamId={vm.team1Id} teamName={match.team1Name} game={match.game} title={`${match.team1Name} · Map Pool`} maxRows={3} /> : null}
        {vm.team2Id ? <MapPoolSection teamId={vm.team2Id} teamName={match.team2Name} game={match.game} title={`${match.team2Name} · Map Pool`} maxRows={3} /> : null}
      </div>

      {/* Head-to-head */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader title="Head-to-Head" className="!px-0" />
        {vm.meetings.length === 0 ? (
          <span className="t-body-sm text-muted text-center py-3.5">No previous meetings on record</span>
        ) : (
          <div className="ledger">
            <div className="flex gap-1 px-3 py-1.5 t-label-sm text-muted"><span className="w-[52px]">DATE</span><span className="flex-1">WINNER</span><span className="w-14 text-right">SCORE</span></div>
            {vm.meetings.map((m, i) => (
              <Link key={m.id} href={`/match/${m.id}`} className={clsx("flex items-center gap-1 px-3 py-2.5 hover:bg-surface/60 transition-colors", i % 2 === 1 && "bg-surface/50")}>
                <span className="w-[52px] t-label-sm text-muted">{formatDate(matchResultTime(m))}</span>
                <span className="flex-1 t-body-sm text-primary truncate">{m.team1Score > m.team2Score ? m.team1Name : m.team2Name}</span>
                <span className="w-14 text-right t-mono-sm text-primary">{m.team1Score}–{m.team2Score}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Rosters */}
      {vm.team1Roster.length || vm.team2Roster.length ? (
        <div className="flex flex-col gap-2.5">
          <SectionHeader title="Rosters" className="!px-0" />
          <div className="flex items-start gap-2.5">
            {rosterColumn(vm.team1Roster, star1)}
            {rosterColumn(vm.team2Roster, star2)}
          </div>
          {star1 || star2 ? <span className="flex items-center gap-1.5 t-label-sm text-muted"><span className="size-1.5 rounded-full bg-violet" />Player to watch — highest rated on the roster</span> : null}
        </div>
      ) : null}
    </div>
  );

  const rail = (
    <div className="flex flex-col gap-4 lg:pt-2">
      {/* Predictions Pro — the ONLY premium surface on this screen */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <AssetIcon name={isPremium ? "premium" : "premiumlocked"} height={16} />
          <span className="t-headline-sm text-primary">Predictions Pro</span>
        </div>
        {isPremium ? (
          <div className="flex flex-col gap-2">
            {proRow(`/premium/predict?mode=h2h&game=${q(match.game)}&team1Id=${q(vm.team1Id)}&team1=${q(match.team1Name)}&team2Id=${q(vm.team2Id)}&team2=${q(match.team2Name)}${match.mapName ? `&map=${q(match.mapName)}` : ""}`, "Head-to-head breakdown", "Strength table, map profiles, matchup record", iconBox(<ArrowLeftRight size={14} />))}
            {([[vm.team1Id, match.team1Name, match.team1LogoURL], [vm.team2Id, match.team2Name, match.team2LogoURL]] as const).map(([id, name, logo]) =>
              proRow(`/premium/predict?mode=breakdown&type=team&game=${q(match.game)}&id=${q(id)}&name=${q(name)}`, `${name} breakdown`, "Season form, map splits, highs and lows", <TeamMark name={name} logoURL={logo} size={30} />, !id),
            )}
            {proRow(`/premium/predict?type=player&game=${q(match.game)}&matchId=${q(match.id)}`, "Predict a stat line", "Probability any starter hits a line in this match", iconBox(<Target size={14} />), vm.team1Roster.length === 0 && vm.team2Roster.length === 0)}
          </div>
        ) : (
          <Link href="/premium/upgrade" className="flex items-center gap-3 p-3.5 rounded-[14px] bg-card border border-border-subtle hover:bg-surface/40 transition-colors">
            <AssetIcon name="premiumlocked" height={22} />
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="t-headline-sm text-primary">Unlock the full preview</span>
              <span className="t-label-sm text-muted">Head-to-head breakdown, team profiles, and stat-line predictions for every starter</span>
            </span>
            <span className="flex-1" />
            <ChevronRight size={12} className="text-muted shrink-0" />
          </Link>
        )}
      </div>
      <MatchCommentsSection matchId={match.id} />
    </div>
  );

  return (
    <Page wide>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <span className="t-headline-sm text-primary">Match Preview</span>
      </div>
      <SplitLayout main={main} rail={rail} />
    </Page>
  );
}
