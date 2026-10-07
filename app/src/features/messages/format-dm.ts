// messages/format-dm.ts — the relative times MessagesView.swift draws:
// the inbox's "· 2m" / "Seen 2h ago", the thread's "TODAY 3:42 PM"
// chapters and the "Seen just now" receipt.

const DAY = 86_400_000;

function asDate(v: string | Date): Date { return typeof v === "string" ? new Date(v) : v; }

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isYesterday(d: Date, now = new Date()): boolean {
  const y = new Date(now); y.setDate(now.getDate() - 1);
  return isSameDay(d, y);
}

/** "MMM d" → "Sep 9" */
export function monthDay(v: string | Date): string {
  return asDate(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** "h:mm a" → "3:42 PM" */
export function clock(v: string | Date): string {
  return asDate(v).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** InboxRow.relative: "now" · "5m" · "2h" · "3d" · "Sep 9" */
export function relativeShort(v: string | Date, now = new Date()): string {
  const s = (now.getTime() - asDate(v).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return monthDay(v);
}

/** InboxRow.relativeAgo: "just now" · "5m ago" · "2h ago" · "yesterday" · "3d ago" · "Sep 9" */
export function relativeAgo(v: string | Date, now = new Date()): string {
  const d = asDate(v);
  const s = (now.getTime() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (isYesterday(d, now)) return "yesterday";
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return monthDay(d);
}

/** MessageThreadViewModel.timeStamp: "TODAY 3:42 PM" / "YESTERDAY 9:10 AM" / "TUE, SEP 9 · 8:05 PM" */
export function chapterStamp(v: string | Date, now = new Date()): string {
  const d = asDate(v);
  const t = clock(d).toUpperCase();
  if (isSameDay(d, now)) return `TODAY ${t}`;
  if (isYesterday(d, now)) return `YESTERDAY ${t}`;
  const f = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${f.toUpperCase()} · ${t}`;
}

/** The receipt's time: "Seen just now" · "Seen 20m ago" · "Seen yesterday" · "Seen Sep 9" */
export function seenLabelFor(at: string | Date, now = new Date()): string {
  const d = asDate(at);
  const s = (now.getTime() - d.getTime()) / 1000;
  if (s < 60) return "Seen just now";
  if (s < 3600) return `Seen ${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `Seen ${Math.floor(s / 3600)}h ago`;
  if (isYesterday(d, now)) return "Seen yesterday";
  if (s < 7 * DAY / 1000) return `Seen ${Math.floor(s / 86_400)}d ago`;
  return `Seen ${monthDay(d)}`;
}

/** MediaBubble.clock: 72.4 → "1:12" */
export function durationClock(seconds: number): string {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}
