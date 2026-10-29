// premium-flair.tsx — PremiumFlair.swift + UserIdentity.swift for the web:
// one look for a user, everywhere (web/ios-parity-2026-10-24.md §1,
// web/ios-parity-2026-10-28.md §3).
//
// A member picks any mix of three pieces, plus two rank colours:
//   ring  — a ring of light around the avatar      (<FlairAvatar>)
//   shine — the name in violet with a sweeping band (<FlairName>)
//   mark  — Karlo's premium diamond after the name  (<FlairName>)
//   metal / shine_metal — gold · silver · bronze while holding a monthly
//   top-3 place.
// The ORACLE word (the live monthly #1, any plan) rides along in <FlairName>.
//
// Identity rules (Oct 28):
//   • Every avatar leaves room for the ring, ring or not: the box is
//     size + 2·(gap + width) with the photo centred (28 → 35.5, 32 → 39.5,
//     44 → 52.5), so photos line up down a list and a ring never pokes past
//     the row's edge.
//   • The name is white (textPrimary) unless they chose shine.
//   • `link`: the photo / name open their profile; your own opens /profile.
//   • Your own rows use your current photo, name and local style mirror,
//     even on messages saved before you changed them.
//
// Moving vs still: it moves only where the person is the subject (profile
// header, drawer header, leaderboard podium, Edit Profile preview) and holds
// still in lists (leaderboard rows, comments, search, follower lists, chat).
// prefers-reduced-motion renders the still form everywhere (globals.css).
//
// Keyframes and the gradient recipes live in app/globals.css (.flair-ring,
// .flair-shine); the colours are passed in as --fb (base) / --fl (light).
"use client";

import { useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "@/lib/format";
import { withBase } from "@/lib/base-path";
import { str, bool, normalizePremiumStyle, normalizeTitle, type Json, type PremiumStylePiece } from "@/lib/types";
import { useOptionalAppState } from "@/store/app-state";
import {
  getPodium, getServerPodium, podiumPlace, readStyleMirror, resolveFlair, subscribePodium, subscribeStyleMirror,
  type Flair, type FlairInput, type Metal, type PodiumPlace,
} from "@/lib/premium-style";
import { InitialAvatar } from "./index";

export {
  resolveFlair, loadPodium, setPodiumFromRows, resetPodium, getPodium, podiumPlace,
  readStyleMirror, writeStyleMirror, clearStyleMirror, canonicalStyle, sameStyle, DEFAULT_STYLE, METALS,
  type Flair, type FlairInput, type Metal, type PodiumPlace,
} from "@/lib/premium-style";

// ── Palettes (base → light) ───────────────────────────────────────────────
export const FLAIR_PALETTE = {
  violetRing: ["#7C5CFC", "#E0D6FF"],
  /** lighter so text reads */
  violetName: ["#A78BFA", "#F2EDFF"],
  gold: ["#F5A623", "#FFEDB8"],
  /** steel, so the white light shows */
  silver: ["#8C94A6", "#FFFFFF"],
  bronze: ["#C28552", "#FAD9B3"],
} as const satisfies Record<string, readonly [string, string]>;

export const METAL_LABEL: Record<Metal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

function vars(pair: readonly [string, string]): CSSProperties {
  return { "--fb": pair[0], "--fl": pair[1] } as CSSProperties;
}

/** Ring width / gap by avatar size: ≥72 → 3/3, ≥40 → 2.25/2, else 1.75/2. */
export function ringGeometry(size: number): { width: number; gap: number; outset: number } {
  const [width, gap] = size >= 72 ? [3, 3] : size >= 40 ? [2.25, 2] : [1.75, 2];
  return { width, gap, outset: width + gap };
}

/** The avatar's box with room for its ring: size + 2·(gap + width). */
export function ringBox(size: number): number {
  return size + 2 * ringGeometry(size).outset;
}

// ── Profile links ─────────────────────────────────────────────────────────
/** Where a user's photo / name goes: your own → /profile, anyone else → /profile/:id. */
export function profileHref(userId: string | null | undefined, meId: string | null | undefined): string | null {
  if (!userId) return null;
  if (meId && userId === meId) return "/profile";
  return `/profile/${encodeURIComponent(userId)}`;
}
export function useProfileHref(userId: string | null | undefined): string | null {
  const app = useOptionalAppState();
  return profileHref(userId, app?.user?.id);
}

// ── Hooks ─────────────────────────────────────────────────────────────────
/** The monthly podium: user ids, #1 first (points > 0 only). */
export function usePodium(): readonly string[] {
  return useSyncExternalStore(subscribePodium, getPodium, getServerPodium);
}

/** A user's monthly podium place (default: the signed-in user's). */
export function usePodiumPlace(userId?: string | null): PodiumPlace | null {
  const app = useOptionalAppState();
  const ids = usePodium();
  return podiumPlace(userId === undefined ? app?.user?.id : userId, ids);
}

/** The signed-in user's local style mirror (null = none saved). */
export function useStyleMirror(userId: string | null | undefined): PremiumStylePiece[] | null {
  return useSyncExternalStore(subscribeStyleMirror, () => readStyleMirror(userId), () => null);
}

/** Anything with a name that can wear flair. */
export interface FlairUser extends FlairInput {
  username: string;
  avatarURL?: string | null;
}

/** Decode flair inputs from any snake_case user payload (a row, an author). */
export function flairUserFrom(raw: Json): FlairUser {
  return {
    id: str(raw?.user_id) ?? str(raw?.userId) ?? str(raw?.id),
    username: str(raw?.username) ?? "user",
    avatarURL: str(raw?.avatar_url) ?? str(raw?.avatarURL),
    isPremium: bool(raw?.is_premium ?? raw?.isPremium),
    premiumStyle: normalizePremiumStyle(raw?.premium_style ?? raw?.premiumStyle),
    title: normalizeTitle(raw?.title),
  };
}

/** Is this the signed-in user? (`isMe` wins when given.) */
function useIsMe(user: FlairInput, isMe: boolean | undefined) {
  const app = useOptionalAppState();
  const me = app?.user ?? null;
  return { me, own: isMe ?? (!!user.id && !!me && me.id === user.id) };
}

/**
 * resolveFlair, live: re-renders when the podium or the own-style mirror
 * changes. The signed-in user (auto-detected by id unless `isMe` is given)
 * also inherits their own plan / style / title when a payload leaves them
 * out (comment authors, follow rows, chat messages).
 */
export function useFlair(user: FlairInput, opts: { isMe?: boolean; chat?: boolean } = {}): Flair {
  const { me, own: isMe } = useIsMe(user, opts.isMe);
  const ids = usePodium();
  const mirror = useStyleMirror(isMe ? user.id : null);
  const subject: FlairInput = isMe && me
    ? { id: user.id, isPremium: user.isPremium || me.isPremium, premiumStyle: user.premiumStyle ?? me.premiumStyle, title: user.title !== undefined ? user.title : me.title }
    : user;
  return resolveFlair(subject, { isMe, podium: ids, mirror, chat: opts.chat });
}

/** A link to the user's profile that never triggers the row it sits in. */
function ProfileLink({ href, label, className, style, children }: { href: string; label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <Link href={href} aria-label={label} onClick={stop} className={clsx("hover:opacity-85 focus-visible:outline-2 focus-visible:outline-violet rounded-full", className)} style={style}>
      {children}
    </Link>
  );
}

// ── Ring ──────────────────────────────────────────────────────────────────
/** The ring itself: fills the avatar's box, masked down to its outer `width`. */
function FlairRing({ size, colors, moving }: { size: number; colors: readonly [string, string]; moving: boolean }) {
  const { width } = ringGeometry(size);
  // Keep only the outer `width` px of the disc (half a px of feather each side).
  const mask = `radial-gradient(circle closest-side, transparent calc(100% - ${width + 0.5}px), #000 calc(100% - ${width - 0.5}px))`;
  return (
    <span
      aria-hidden
      className="flair-ring"
      data-moving={moving ? "" : undefined}
      style={{ ...vars(colors), inset: 0, WebkitMaskImage: mask, maskImage: mask }}
    />
  );
}

/**
 * The avatar inside a box that always leaves room for the ring:
 * size + 2·(gap + width), photo centred, ring or not. `metal` forces a
 * moving rank ring whatever the plan (the leaderboard podium). `children`
 * replaces the default photo (keep it exactly `size` square and round).
 * `link` makes it open the user's profile. `pad` is kept for old callers:
 * the room is always there now.
 */
export function FlairAvatar({ user, size = 40, moving = false, metal = null, isMe, link = false, className, children }: {
  user: FlairUser;
  size?: number;
  moving?: boolean;
  /** @deprecated the box always reserves the ring's room. */
  pad?: boolean;
  metal?: Metal | null;
  isMe?: boolean;
  link?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { me, own } = useIsMe(user, isMe);
  const flair = useFlair(user, { isMe });
  const ringOn = !!metal || flair.ring;
  const colors = metal ? FLAIR_PALETTE[metal] : flair.ringMetal ? FLAIR_PALETTE[flair.ringMetal] : FLAIR_PALETTE.violetRing;
  const box = ringBox(size);
  // Your own rows wear your current photo (and name, for the initials).
  const photo = own && me ? me.avatarURL : user.avatarURL;
  const name = own && me ? me.username || user.username : user.username;
  const href = profileHref(user.id, me?.id);
  const body = (
    <>
      {children ?? <InitialAvatar name={name} imageURL={photo} size={size} />}
      {ringOn ? <FlairRing size={size} colors={colors} moving={!!metal || moving} /> : null}
    </>
  );
  const boxClass = clsx("relative inline-flex shrink-0 items-center justify-center rounded-full", className);
  const boxStyle: CSSProperties = { width: box, height: box };
  if (link && href) return <ProfileLink href={href} label={`${name}'s profile`} className={boxClass} style={boxStyle}>{body}</ProfileLink>;
  return <span className={boxClass} style={boxStyle}>{body}</span>;
}

// ── Name ──────────────────────────────────────────────────────────────────
/** Karlo's premium diamond, about cap height of the surrounding text. */
export function PremiumMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={withBase("/icons/premium.png")} alt="" aria-hidden className={clsx("inline-block shrink-0 object-contain", className)} style={{ height: "0.82em", width: "auto" }} />;
}

/** The live monthly #1's word, in a gold shine (still under reduced motion). */
export function OracleWord({ moving = true, className }: { moving?: boolean; className?: string }) {
  return (
    <span className={clsx("flair-shine shrink-0 font-black leading-none", className)} data-moving={moving ? "" : undefined} style={{ ...vars(FLAIR_PALETTE.gold), fontSize: "0.62em", letterSpacing: "0.14em" }} title="ORACLE: #1 on this month's leaderboard">
      ORACLE
    </span>
  );
}

/**
 * The name, then the diamond, then ORACLE. White (textPrimary) unless they
 * chose shine (violet, or their podium metal). Typography goes in
 * `className` (the mark scales with it); `nameClassName` overrides the
 * plain name's colour where a screen needs to (the default is white).
 */
export function FlairName({ user, label, moving = false, chat = false, isMe, oracle = true, link = false, className, nameClassName }: {
  user: FlairUser;
  /** Display text instead of the username (e.g. "You"). */
  label?: string;
  moving?: boolean;
  /** @deprecated the Oct 24 chat rules are retired; chat names are like any other. */
  chat?: boolean;
  isMe?: boolean;
  /** Show the ORACLE word when it applies (default on). */
  oracle?: boolean;
  link?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const { me, own } = useIsMe(user, isMe);
  const f = useFlair(user, { isMe, chat });
  const text = label ?? (own && me ? me.username || user.username : user.username);
  const href = profileHref(user.id, me?.id);
  const body = (
    <>
      {f.shine ? (
        <span className="flair-shine truncate min-w-0" data-moving={moving ? "" : undefined} style={vars(f.shineMetal ? FLAIR_PALETTE[f.shineMetal] : FLAIR_PALETTE.violetName)}>{text}</span>
      ) : (
        <span className={clsx("truncate min-w-0", nameClassName ?? "text-primary")}>{text}</span>
      )}
      {f.mark ? <PremiumMark /> : null}
      {/* The ORACLE word is animated everywhere (one holder, so one sweep). */}
      {oracle && f.oracle ? <OracleWord /> : null}
    </>
  );
  const cls = clsx("inline-flex items-center gap-[0.3em] min-w-0 max-w-full", className);
  if (link && href) return <ProfileLink href={href} label={`${text}'s profile`} className={clsx(cls, "!rounded-sm")}>{body}</ProfileLink>;
  return <span className={cls}>{body}</span>;
}

// ── Swatches (Edit Profile's colour chips) ────────────────────────────────
/** A small still ring in the violet ring palette or a metal. */
export function RingSwatch({ metal = null, size = 14 }: { metal?: Metal | null; size?: number }) {
  const [b, l] = metal ? FLAIR_PALETTE[metal] : FLAIR_PALETTE.violetRing;
  const mask = `radial-gradient(circle closest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))`;
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `conic-gradient(from 0deg, ${b}, ${l}, ${b})`, WebkitMaskImage: mask, maskImage: mask }} />;
}
/** "Aa" in the still name shine (violet name palette or a metal). */
export function ShineSwatch({ metal = null, className }: { metal?: Metal | null; className?: string }) {
  return <span aria-hidden className={clsx("flair-shine font-bold", className)} style={vars(metal ? FLAIR_PALETTE[metal] : FLAIR_PALETTE.violetName)}>Aa</span>;
}

/** Kept for old callers: chat names now follow the same rules as any other. */
export function FlairChatName({ user, className, nameClassName, link }: { user: FlairUser; className?: string; nameClassName?: string; link?: boolean }) {
  return <FlairName user={user} className={className} nameClassName={nameClassName} link={link} />;
}

/** Avatar + name + mark, still — a list row's user cell (search, DMs…). */
export function FlairUserInline({ user, size = 40, className, nameClassName, textClassName = "t-body-md" }: {
  user: FlairUser;
  size?: number;
  className?: string;
  nameClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-3 min-w-0", className)}>
      <FlairAvatar user={user} size={size} />
      <FlairName user={user} className={textClassName} nameClassName={nameClassName} />
    </span>
  );
}
