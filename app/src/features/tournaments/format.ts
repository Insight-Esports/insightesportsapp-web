// tournaments/format.ts — percent text used across brackets, series and odds.
// Whole numbers; "<1%" for values above 0 and under 0.5; ">99%" for values
// above 99.5 and under 100.
export function pctText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v > 0 && v < 0.5) return "<1%";
  if (v > 99.5 && v < 100) return ">99%";
  return `${Math.round(v)}%`;
}

/** Signed points: whole when whole, else one decimal ("+4", "+2.5", "−3"). */
export function signedPoints(v: number): string {
  const abs = Math.abs(v);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${v < 0 ? "−" : "+"}${s}`;
}
