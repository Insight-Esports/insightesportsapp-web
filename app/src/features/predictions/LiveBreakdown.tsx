// predictions/LiveBreakdown.tsx — LivePlayerBreakdownView: the current-game
// breakdown for a player who is LIVE right now. Match context (score +
// whether their side leads), lobby rank, team impact, an evidence-built
// summary (preferring the backend's /predictions/live-breakdown read).
// Data: /matches/live → their match; /matches/:id + /matches/:id/stats on a
// 20s refresh.
"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Clock, Play } from "lucide-react";
import { api, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { int, normalizeMatches, str, team1Color, team2Color, type Json, type Match } from "@/lib/types";
import { useInterval } from "@/lib/use-fetch";
import { LiveBadge, Spinner, TeamMark } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readGame } from "./flow";
import { Caps, Disclaimer, FlowError, Section, StatRow, StripedTable, type Cell } from "./shared";
import { normalizeLiveBreakdown, normalizeStatRows, type MatchStatRow } from "./types";

interface Score { playerTeamName: string; opponentName: string; playerTeamScore: number; opponentScore: number; playerTeamColor: string; opponentColor: string; playerTeamLogoURL: string | null; opponentLogoURL: string | null }
interface Rank { killsRank: number; totalPlayers: number; secondaryLine: string | null }
interface Metric extends Cell { highlight: boolean }
interface LiveState {
  row: MatchStatRow | null; matchLine: string | null; score: Score | null; rank: Rank | null;
  impact: [string, string][]; metrics: Metric[]; summary: string; historyWarning: string | null; disclaimer: string | null;
}

const stateLabel = (s: Score) => (s.playerTeamScore > s.opponentScore ? "Their team leads" : s.playerTeamScore < s.opponentScore ? "Their team trails" : "All tied");
const goldText = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
const plusMinus = (v: number) => (v > 0 ? `+${v}` : String(v));

export function LiveBreakdownScreen() {
  const sp = useSearchParams();
  const game = readGame(sp);
  const playerId = sp.get("id") ?? "";
  const playerName = sp.get("name") ?? "";
  const knownMatchId = sp.get("match");
  const t = { game, targetType: "player" as const, targetId: playerId, targetName: playerName, isLive: true, matchId: knownMatchId };

  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const matchIdRef = useRef<string | null>(knownMatchId);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const matches = normalizeMatches(await api.get(endpoints.liveMatches)).filter((m) => m.game === game);
      let current: Match | undefined = matchIdRef.current ? matches.find((m) => m.id === matchIdRef.current) : undefined;
      if (!current) {
        for (const m of matches) {
          const rows = normalizeStatRows(await api.get(endpoints.matchStats(m.id)).catch(() => []));
          if (rows.some((r) => r.playerId === playerId)) { matchIdRef.current = m.id; current = m; break; }
        }
      }
      const matchId = matchIdRef.current;
      if (!current || !matchId) { setState({ row: null, matchLine: null, score: null, rank: null, impact: [], metrics: [], summary: "", historyWarning: null, disclaimer: null }); return; }

      const [detail, rows] = await Promise.all([api.get<Json>(endpoints.matchDetail(matchId)), api.get<Json>(endpoints.matchStats(matchId)).then(normalizeStatRows)]);
      const gameTimeSeconds = int(detail?.game_time_seconds ?? detail?.gameTimeSeconds) ?? 0;
      const row = rows.find((r) => r.playerId === playerId);
      const matchLine = `${current.team1Name} vs ${current.team2Name}`;
      if (!row) { setState({ row: null, matchLine, score: null, rank: null, impact: [], metrics: [], summary: "", historyWarning: null, disclaimer: null }); return; }

      const teamRows = rows.filter((r) => r.teamId === row.teamId);
      const teamKills = teamRows.reduce((a, r) => a + (r.kills ?? 0), 0);
      const teamDamage = teamRows.reduce((a, r) => a + (r.damageDealt ?? 0), 0);
      const kills = row.kills ?? 0, deaths = row.deaths ?? 0, assists = row.assists ?? 0;
      const hsPct = row.headshots != null && kills > 0 ? (row.headshots / kills) * 100 : null;
      const dmgPct = game === "League" && row.damageDealt != null && teamDamage > 0 ? (row.damageDealt / teamDamage) * 100 : null;
      const kp = game === "League" && teamKills > 0 ? ((kills + assists) / teamKills) * 100 : null;
      const gpm = game === "League" && row.goldEarned != null && gameTimeSeconds > 60 ? Math.trunc(row.goldEarned / (gameTimeSeconds / 60)) : null;

      // Score strip from the player's perspective.
      const onTeam1 = row.teamId === (str(detail?.team1_id ?? detail?.team1Id) ?? current.team1Id);
      const t1 = int(detail?.team1_score ?? detail?.team1Score) ?? current.team1Score, t2 = int(detail?.team2_score ?? detail?.team2Score) ?? current.team2Score;
      const score: Score = {
        playerTeamName: onTeam1 ? current.team1Name : current.team2Name, opponentName: onTeam1 ? current.team2Name : current.team1Name,
        playerTeamScore: onTeam1 ? t1 : t2, opponentScore: onTeam1 ? t2 : t1,
        playerTeamColor: onTeam1 ? team1Color(current) : team2Color(current), opponentColor: onTeam1 ? team2Color(current) : team1Color(current),
        playerTeamLogoURL: onTeam1 ? current.team1LogoURL : current.team2LogoURL, opponentLogoURL: onTeam1 ? current.team2LogoURL : current.team1LogoURL,
      };

      // Lobby rank.
      const killsSorted = rows.map((r) => r.kills ?? 0).sort((a, b) => b - a);
      const killsRank = Math.max(0, killsSorted.indexOf(kills)) + 1;
      let secondary: string | null = null;
      if (game === "VALORANT" && row.acs != null) { const s = rows.map((r) => r.acs).filter((v): v is number => v != null).sort((a, b) => b - a); const i = s.findIndex((v) => Math.trunc(v) === Math.trunc(row.acs!)); if (i >= 0) secondary = `#${i + 1} in ACS`; }
      if (game === "CS2" && row.adr != null) { const s = rows.map((r) => r.adr).filter((v): v is number => v != null).sort((a, b) => b - a); const i = s.findIndex((v) => Math.abs(v - row.adr!) < 0.01); if (i >= 0) secondary = `#${i + 1} in ADR`; }
      if (game === "League" && row.damageDealt != null) { const s = rows.map((r) => r.damageDealt).filter((v): v is number => v != null).sort((a, b) => b - a); const i = s.indexOf(row.damageDealt); if (i >= 0) secondary = `#${i + 1} in damage`; }
      const rank: Rank = { killsRank, totalPlayers: rows.length, secondaryLine: secondary };

      // Team impact.
      const impact: [string, string][] = [];
      if (teamKills > 0) impact.push(["Share of team kills", `${Math.trunc((kills / teamKills) * 100)}%`]);
      if (kp != null) impact.push(["Kill participation", `${Math.trunc(kp)}%`]);
      else if (teamKills > 0) impact.push(["Kill participation", `${Math.trunc(Math.min(((kills + assists) / teamKills) * 100, 100))}%`]);
      if (dmgPct != null) impact.push(["Share of team damage", `${Math.trunc(dmgPct)}%`]);
      if (game === "League") {
        if (row.goldEarned != null) impact.push(["Gold", goldText(row.goldEarned)]);
        if (gpm != null) impact.push(["Gold / min", String(gpm)]);
        if (row.visionScore != null) impact.push(["Vision score", String(row.visionScore)]);
      } else {
        if ((row.firstBloods ?? 0) > 0) impact.push(["First bloods", String(row.firstBloods)]);
        if ((row.clutchWins ?? 0) > 0) impact.push(["Clutches won", String(row.clutchWins)]);
        const minutes = gameTimeSeconds / 60;
        if (minutes > 1) impact.push(["Kills / min", (kills / minutes).toFixed(2)]);
      }

      // Metrics grid.
      const kda = (kills + assists) / Math.max(deaths, 1);
      const metrics: Metric[] = [{ label: "Kills", value: String(kills), highlight: true }, { label: "Deaths", value: String(deaths), highlight: false }, { label: "Assists", value: String(assists), highlight: false }];
      if (game === "VALORANT") {
        if (row.acs != null) metrics.push({ label: "ACS", value: String(Math.trunc(row.acs)), highlight: true });
        if (hsPct != null) metrics.push({ label: "HS%", value: `${Math.trunc(hsPct)}%`, highlight: false });
        metrics.push({ label: "+/−", value: plusMinus(row.plusMinus ?? 0), highlight: false });
      } else if (game === "CS2") {
        if (row.adr != null) metrics.push({ label: "ADR", value: String(Math.trunc(row.adr)), highlight: true });
        if (hsPct != null) metrics.push({ label: "HS%", value: `${Math.trunc(hsPct)}%`, highlight: false });
        metrics.push({ label: "+/−", value: plusMinus(row.plusMinus ?? 0), highlight: false });
      } else if (game === "League") {
        metrics.push({ label: "KDA", value: kda.toFixed(1), highlight: true });
        if (row.csPerMin != null) metrics.push({ label: "CS/m", value: row.csPerMin.toFixed(1), highlight: false });
        if (row.damageDealt != null) metrics.push({ label: "DMG", value: goldText(row.damageDealt), highlight: false });
      }

      // Summary — built from evidence, not thresholds.
      const facts: string[] = [];
      if (rank.killsRank === 1) facts.push(`leading the entire lobby with ${kills} kills`);
      else if (rank.killsRank === 2) facts.push(`second in the lobby in kills (${kills})`);
      if (teamKills > 0) { const share = (kills / teamKills) * 100; if (share >= 30) facts.push(`carrying ${Math.trunc(share)}% of their team's kills`); }
      if (dmgPct != null && dmgPct >= 28) facts.push(`dealing ${Math.trunc(dmgPct)}% of their team's damage`);
      if (game === "VALORANT" || game === "CS2") {
        if (hsPct != null && hsPct >= 55 && kills >= 5) facts.push(`hitting ${Math.trunc(hsPct)}% headshots`);
        if ((row.firstBloods ?? 0) >= 3) facts.push(`${row.firstBloods} opening kills`);
        if ((row.clutchWins ?? 0) >= 2) facts.push(`${row.clutchWins} clutches already`);
      } else if (game === "League") {
        if (row.csPerMin != null && row.csPerMin >= 9) facts.push(`farming at ${row.csPerMin.toFixed(1)} CS/min`);
        if (kp != null && kp >= 75) facts.push(`involved in ${Math.trunc(kp)}% of their team's kills`);
        if (deaths === 0 && kills >= 3) facts.push("deathless so far");
      }
      let context = "";
      if (score.playerTeamScore > score.opponentScore) context = ` with ${score.playerTeamName} in front ${score.playerTeamScore}-${score.opponentScore}`;
      else if (score.playerTeamScore < score.opponentScore) context = ` while ${score.playerTeamName} trail ${score.playerTeamScore}-${score.opponentScore}`;
      const opener = kda >= 4 ? `${playerName} is having a monster game` : kda >= 2.5 ? `${playerName} is having a strong game` : kda >= 1.5 ? `${playerName} is putting in solid work` : deaths > kills + assists ? `${playerName} is having a rough one` : `${playerName} is keeping it even`;
      let summary: string;
      if (facts.length === 0) {
        const line = `${kills}/${deaths}/${assists}`;
        summary = kda < 1 ? `${opener} — ${line} so far, with deaths outpacing impact${context}. They'll be looking to stabilize.` : `${opener} at ${line}${context} — steady, without a standout number yet.`;
      } else {
        summary = `${opener} — ${facts.slice(0, 2).join(" and ")}${context}.`;
      }

      // Backend live-breakdown engine (premium, never blocks on history).
      let historyWarning: string | null = null, disclaimer: string | null = null;
      try {
        const b = normalizeLiveBreakdown(await api.post(endpoints.liveBreakdown, { matchId, playerId }));
        if (b.text) summary = b.text;
        historyWarning = b.lowHistory ? b.historyWarning : null;
        disclaimer = b.disclaimer;
      } catch { /* local read stands */ }

      setState({ row, matchLine, score, rank, impact, metrics, summary, historyWarning, disclaimer });
    } catch (e) {
      setError(errorMessage(e, "Couldn't load the live game."));
    } finally {
      setLoading(false);
    }
  }, [game, playerId, playerName]);

  useEffect(() => { void refresh(); }, [refresh]);
  useInterval(() => { void refresh(); }, 20_000);

  return (
    <PredictScreen title="Live Breakdown" back={flowHref.options(t)}>
      <div className="flex flex-col gap-4 pt-2 max-w-3xl">
        <div className="flex flex-col items-center gap-1.5 px-4 text-center">
          <span className="flex items-center gap-2"><h1 className="t-headline-lg text-primary">{playerName}</h1><LiveBadge /></span>
          {state?.matchLine ? <span className="t-label-md text-violet">{state.matchLine}</span> : null}
        </div>

        <div className="px-4 flex flex-col gap-4">
          {loading && !state?.row ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : error ? (
            <FlowError title={error} />
          ) : state?.row ? (
            <>
              {state.score ? <ScoreStrip s={state.score} /> : null}
              <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle">
                <span className="flex items-center gap-1.5"><Activity size={14} className="text-violet" /><Caps>HOW THEY&apos;RE PLAYING</Caps></span>
                <span className="t-body-md text-secondary">{state.summary}</span>
              </div>
              {state.historyWarning ? (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-violet/10"><Clock size={14} className="text-violet shrink-0 mt-0.5" /><span className="t-label-md text-secondary">{state.historyWarning}</span></div>
              ) : null}
              <div className="flex flex-col gap-2.5">
                {state.metrics.length <= 4 ? <StatRow cells={state.metrics.map(toCell)} /> : chunk(state.metrics, 3).map((m, i) => <StatRow key={i} cells={m.map(toCell)} />)}
              </div>
              {state.rank ? (
                <div className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-card border border-border-subtle">
                  <span className="w-11 text-center t-mono-md text-violet">#{state.rank.killsRank}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="t-body-md text-primary">{state.rank.killsRank === 1 ? "Top fragger in the lobby" : `#${state.rank.killsRank} of ${state.rank.totalPlayers} in kills`}</span>
                    {state.rank.secondaryLine ? <span className="t-label-sm text-muted">{state.rank.secondaryLine}</span> : null}
                  </span>
                </div>
              ) : null}
              {state.impact.length ? (
                <Section title="TEAM IMPACT">
                  <StripedTable header={<><span className="flex-1">METRIC</span><span className="w-[72px] text-center">SHARE</span></>} rows={state.impact.map(([k, v]) => (
                    <><span className="flex-1 t-body-sm text-primary">{k}</span><span className="w-[72px] text-center t-mono-sm text-violet">{v}</span></>
                  ))} />
                </Section>
              ) : null}
              <span className="t-label-sm text-muted text-center">Updates live as the game progresses</span>
              {state.disclaimer ? <Disclaimer>{state.disclaimer}</Disclaimer> : null}
            </>
          ) : (
            <FlowError icon={<Play />} title={`${playerName} isn't in a live match right now`} />
          )}
        </div>
      </div>
    </PredictScreen>
  );
}

const toCell = (m: Metric): Cell => ({ label: m.label, value: m.value, marquee: m.highlight });
function chunk<T>(arr: T[], n: number): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

function ScoreStrip({ s }: { s: Score }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-card border border-border-subtle">
      <TeamMark name={s.playerTeamName} logoURL={s.playerTeamLogoURL} color={s.playerTeamColor} size={22} />
      <span className="t-label-md" style={{ color: s.playerTeamColor }}>{s.playerTeamName.slice(0, 3).toUpperCase()}</span>
      <span className="t-mono-md text-primary">{s.playerTeamScore}</span>
      <span className="t-mono-md text-muted">–</span>
      <span className="t-mono-md text-primary">{s.opponentScore}</span>
      <span className="t-label-md" style={{ color: s.opponentColor }}>{s.opponentName.slice(0, 3).toUpperCase()}</span>
      <TeamMark name={s.opponentName} logoURL={s.opponentLogoURL} color={s.opponentColor} size={22} />
      <span className="flex-1" />
      <span className={clsx("t-label-sm", s.playerTeamScore >= s.opponentScore ? "text-primary" : "text-muted")}>{stateLabel(s)}</span>
    </div>
  );
}
