// format.ts — small formatting helpers shared by every screen.

/** "3d ago" / "2h ago" / "5m ago" / "Just now" (PlayerComment.timeAgo) */
export function timeAgo(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const seconds = (Date.now() - d.getTime()) / 1000;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Date(iso).toLocaleDateString(undefined, opts);
}
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** "Today", "Tomorrow", "Yesterday" or a weekday + date. */
export function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** 1 decimal, "—" when missing. */
export function fmt1(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(1);
}
export function fmt2(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(2);
}
export function fmtInt(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : Math.round(v).toLocaleString();
}
export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(digits)}%`;
}
/** 0-100 or 0-1 both tolerated → 0-100 */
export function toPct(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v <= 1 ? v * 100 : v;
}
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
export function initials(name: string, n = 2): string {
  return name.trim().slice(0, n).toUpperCase();
}
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
