// predictions/TeamMapProfile.tsx — PredictionTeamMapProfileView:
// GET /predictions/team-map/:teamId?game=&map= → a team's win rate + average
// stats on one map. The chosen map lives in the URL (?map=).
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { api, endpoints } from "@/lib/api";
import { gameLabel } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { FilterChip, LoadFailure } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget } from "./flow";
import { AccentRead, Disclaimer, FlowError, LoadingLine, Section, StatRow, StepHeader, StripedTable } from "./shared";
import { gameMaps, normalizeTeamMapProfile, PredictionFormat, type TeamMapProfile } from "./types";

// Fixed display order for the avgStats dictionary.
const STAT_ORDER: [string, string][] = [["kills", "Kills"], ["deaths", "Deaths"], ["assists", "Assists"], ["plusMinus", "+/−"], ["acs", "ACS"], ["adr", "ADR"], ["headshots", "Headshots"]];

export function TeamMapProfileScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const t = readTarget(sp);
  const map = sp.get("map");
  const maps = gameMaps(t.game);

  const { data: r, loading, error, connectionProblem, reload } = useFetch<TeamMapProfile>(
    async (signal) => normalizeTeamMapProfile(await api.get(endpoints.teamMapProfile(t.targetId, t.game, map ?? ""), { signal })),
    [t.targetId, t.game, map],
    { enabled: !!map },
  );

  return (
    <PredictScreen title="Map Profile" back={flowHref.options(t)}>
      <div className="flex flex-col gap-5 pt-1 max-w-3xl">
        <StepHeader title="Map Profile" subtitle={<span className="text-violet">{t.targetName} · {gameLabel(t.game)}</span>} />
        <div className="flex flex-col gap-2 px-4">
          <span className="t-label-sm text-muted">PICK A MAP</span>
          <div className="flex items-end gap-[22px] overflow-x-auto no-scrollbar">
            {maps.map((m) => <FilterChip key={m} label={m} selected={map === m} onClick={() => router.replace(flowHref.mapProfile(t, m))} />)}
          </div>
        </div>

        <div className="px-4">
          {!map ? (
            <p className="py-8 px-6 text-center t-body-md text-muted">Pick a map to see how {t.targetName} performs on it.</p>
          ) : loading ? (
            <LoadingLine text="Loading…" className="py-8" />
          ) : error || !r ? (
            connectionProblem ? <LoadFailure error={error ?? ""} connectionProblem onRetry={reload} /> : <FlowError title={error ?? "Something went wrong."} />
          ) : (
            <ProfileContent r={r} />
          )}
        </div>
      </div>
    </PredictScreen>
  );
}

function ProfileContent({ r }: { r: TeamMapProfile }) {
  if ((r.gamesPlayed ?? 0) === 0) {
    return <div className="py-8 text-center t-body-md text-muted rounded-xl bg-card border border-border-subtle">{r.message ?? "No completed matches on this map yet."}</div>;
  }
  const entries = r.avgStats ? STAT_ORDER.flatMap(([k, label]) => (r.avgStats![k] != null ? [{ label, value: PredictionFormat.stat(r.avgStats![k] as number) }] : [])) : [];
  return (
    <div className="flex flex-col gap-5">
      <StatRow cells={[{ label: "Record", value: r.record ?? "—" }, { label: "Win %", value: r.winRate ?? "—", marquee: true }, { label: "Games", value: r.gamesPlayed ?? "—" }]} />
      {entries.length ? (
        <Section title={`AVERAGES ON ${(r.map ?? "").toUpperCase()}`}>
          <StripedTable header={<><span className="flex-1">STAT</span><span className="w-[72px] text-center">AVG</span></>} rows={entries.map((e) => (
            <><span className="flex-1 t-body-sm text-primary">{e.label}</span><span className="w-[72px] text-center t-mono-sm text-violet">{e.value}</span></>
          ))} />
        </Section>
      ) : null}
      {r.accuracyWarning ? <AccentRead kicker="SMALL SAMPLE" tone="gold">{r.accuracyWarning}</AccentRead> : null}
      {r.disclaimer ? <Disclaimer>{r.disclaimer}</Disclaimer> : null}
    </div>
  );
}
