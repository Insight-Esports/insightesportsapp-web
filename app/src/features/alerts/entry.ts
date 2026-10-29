// alerts/entry.ts — the shared way into Stat Alerts from other screens
// (player/team pages, prediction result, stat picker, live match, search,
// notifications). Other features import ONLY from here; the alerts feature
// owns everything else under features/alerts.

export type AlertTargetType = "player" | "team";
export type AlertDirection = "over" | "under";

export interface AlertPrefill {
  targetType: AlertTargetType;
  targetId: string;
  targetName?: string | null;
  game: string;
  /** Predictor stat key (e.g. "kills", "plus_minus") or a team call ("win", "lose", "sweep", "distance", "map_2"). */
  stat?: string | null;
  direction?: AlertDirection | null;
  /** The number as the user will see it (already rounded per the counting-stat rule). */
  target?: number | null;
  /** Alert for this live match. */
  matchId?: string | null;
}

export const ALERTS_BASE = "/alerts";

function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Stat Alerts list. */
export const alertsListHref = () => ALERTS_BASE;
/** New alert (game → player/team → search). */
export const alertsNewHref = (game?: string | null) => `${ALERTS_BASE}/new${qs({ game })}`;
/** The composer, prefilled. */
export function alertComposerHref(p: AlertPrefill): string {
  return `${ALERTS_BASE}/compose${qs({ type: p.targetType, id: p.targetId, name: p.targetName, game: p.game, stat: p.stat, direction: p.direction, target: p.target, match: p.matchId })}`;
}

/** Counting stats round UP in both directions: over 17.5 → "At least 18", under 17.5 → "Under 18". */
export function alertTargetFromLine(line: number, counting: boolean): number {
  return counting ? Math.ceil(line) : line;
}
