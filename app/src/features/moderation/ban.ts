// moderation/ban.ts — panel sanctions as the app shows them
// (backend/reports-and-sanctions-contract.md, parity §2 "Bans").
//
// A send refused with 403 COMMENT_BANNED (live chat, player and match
// comments) or AVATAR_BANNED (the avatar save) carries `ends_at` (null =
// permanent). The line shows inline above the composer / the avatar save
// and Send stays disabled while it shows; it clears itself at `ends_at`.
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api";

export type BanKind = "comment" | "avatar";
interface Ban { endsAt: string | null }

const bans: Partial<Record<BanKind, Ban>> = {};
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getVersion = () => version;

/** Remember a ban from a refused request. Returns its kind, or null when `e` isn't one. */
export function noteBan(e: unknown): BanKind | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  const kind: BanKind | null = e.code === "COMMENT_BANNED" ? "comment" : e.code === "AVATAR_BANNED" ? "avatar" : null;
  if (!kind) return null;
  const raw = e.body?.ends_at;
  bans[kind] = { endsAt: typeof raw === "string" && raw ? raw : null };
  version += 1;
  listeners.forEach((fn) => fn());
  return kind;
}

export function clearBans() {
  delete bans.comment;
  delete bans.avatar;
  version += 1;
  listeners.forEach((fn) => fn());
}

/** "Nov 3" (with the year when it isn't this year). */
function shortDate(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "later";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "You can't comment until Nov 3." · "You can't change your profile picture right now." */
export function banText(kind: BanKind, endsAt: string | null): string {
  const when = endsAt ? `until ${shortDate(endsAt)}` : "right now";
  return kind === "comment" ? `You can't comment ${when}.` : `You can't change your profile picture ${when}.`;
}

/** The ban line to show (null when clear). Re-renders when a ban lands or runs out. */
export function useBanLine(kind: BanKind): string | null {
  useSyncExternalStore(subscribe, getVersion, () => 0);
  const ban = bans[kind] ?? null;
  const endsAt = ban?.endsAt ?? null;
  const [expiredAt, setExpiredAt] = useState<string | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const ms = Date.parse(endsAt) - Date.now();
    const t = setTimeout(() => setExpiredAt(endsAt), Math.max(0, Math.min(ms + 50, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [endsAt]);
  if (!ban) return null;
  if (endsAt && expiredAt === endsAt) return null;
  return banText(kind, endsAt);
}
