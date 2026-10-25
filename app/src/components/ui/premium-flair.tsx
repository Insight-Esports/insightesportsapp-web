// premium-flair.tsx — PremiumFlair.swift for the web: the "PRO" label's
// replacement (web/ios-parity-2026-10-24.md §1).
//
// A member picks any mix of three pieces, plus two rank colours:
//   ring  — a ring of light around the avatar      (<FlairAvatar>)
//   shine — the name in violet with a sweeping band (<FlairName>)
//   mark  — Karlo's premium diamond after the name  (<FlairName>)
//   metal / shine_metal — gold · silver · bronze while holding a monthly
//   top-3 place.
// The ORACLE word (the live monthly #1, any plan) rides along in <FlairName>.
//
// Moving vs still: it moves only where the person is the subject (profile
// header, drawer header, leaderboard podium, Edit Profile preview) and holds
// still in lists (leaderboard rows, comments, search, follower lists, chat).
// prefers-reduced-motion renders the still form everywhere (globals.css).
//
// Keyframes and the gradient recipes live in app/globals.css (.flair-ring,
// .flair-shine); the colours are passed in as --fb (base) / --fl (light).
"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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
    id: str(raw?.user_id) ?? str(raw?.id),
    username: str(raw?.username) ?? "user",
    avatarURL: str(raw?.avatar_url),
    isPremium: bool(raw?.is_premium ?? raw?.isPremium),
    premiumStyle: normalizePremiumStyle(raw?.premium_style ?? raw?.premiumStyle),
    title: normalizeTitle(raw?.title),
  };
}

/**
 * resolveFlair, live: re-renders when the podium or the own-style mirror
 * changes. The signed-in user (auto-detected by id unless `isMe` is given)
 * also inherits their own plan / style / title when a payload leaves them
 * out (comment authors, follow rows).
 */
export function useFlair(user: FlairInput, opts: { isMe?: boolean; chat?: boolean } = {}): Flair {
  const app = useOptionalAppState();
  const me = app?.user ?? null;
  const isMe = opts.isMe ?? (!!user.id && !!me && me.id === user.id);
  const ids = usePodium();
  const mirror = useStyleMirror(isMe ? user.id : null);
  const subject: FlairInput = isMe && me
    ? { id: user.id, isPremium: user.isPremium || me.isPremium, premiumStyle: user.premiumStyle ?? me.premiumStyle, title: user.title !== undefined ? user.title : me.title }
    : user;
  return resolveFlair(subject, { isMe, podium: ids, mirror, chat: opts.chat });
}

// ── Ring ──────────────────────────────────────────────────────────────────
/** The ring itself, absolutely placed `gap` outside a `size` box. */
function FlairRing({ size, colors, moving }: { size: number; colors: readonly [string, string]; moving: boolean }) {
  const { width, outset } = ringGeometry(size);
  // Keep only the outer `width` px of the disc (half a px of feather each side).
  const mask = `radial-gradient(circle closest-side, transparent calc(100% - ${width + 0.5}px), #000 calc(100% - ${width - 0.5}px))`;
  return (
    <span
      aria-hidden
      className="flair-ring"
      data-moving={moving ? "" : undefined}
      style={{ ...vars(colors), inset: -outset, WebkitMaskImage: mask, maskImage: mask }}
    />
  );
}

/**
 * The avatar with its ring drawn OUTSIDE it, so the layout doesn't shift.
 * `pad` reserves the ring's room (gap + width) where it would touch
 * neighbours, as iOS does. `metal` forces a moving rank ring whatever the
 * plan (the leaderboard podium). `children` replaces the default
 * InitialAvatar (keep it exactly `size` square and round).
 */
export function FlairAvatar({ user, size = 40, moving = false, pad = false, metal = null, isMe, className, children }: {
  user: FlairUser;
  size?: number;
  moving?: boolean;
  pad?: boolean;
  metal?: Metal | null;
  isMe?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const flair = useFlair(user, { isMe });
  const ringOn = !!metal || flair.ring;
  const colors = metal ? FLAIR_PALETTE[metal] : flair.ringMetal ? FLAIR_PALETTE[flair.ringMetal] : FLAIR_PALETTE.violetRing;
  const { outset } = ringGeometry(size);
  return (
    <span className={clsx("relative inline-flex shrink-0 rounded-full", className)} style={{ width: size, height: size, margin: pad && ringOn ? outset : undefined }}>
      {children ?? <InitialAvatar name={user.username} imageURL={user.avatarURL} size={size} />}
      {ringOn ? <FlairRing size={size} colors={colors} moving={!!metal || moving} /> : null}
    </span>
  );
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
 * The name with its shine, the diamond (after the name; before it in chat)
 * and the ORACLE word. Typography goes in `className` (the mark scales with
 * it); colour for a name without shine goes in `nameClassName`.
 */
export function FlairName({ user, label, moving = false, chat = false, isMe, oracle = true, className, nameClassName }: {
  user: FlairUser;
  /** Display text instead of the username (e.g. "You"). */
  label?: string;
  moving?: boolean;
  chat?: boolean;
  isMe?: boolean;
  /** Show the ORACLE word when it applies (default on). */
  oracle?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const f = useFlair(user, { isMe, chat });
  const text = label ?? user.username;
  const mark = f.mark ? <PremiumMark /> : null;
  return (
    <span className={clsx("inline-flex items-center gap-[0.3em] min-w-0 max-w-full", className)}>
      {chat ? mark : null}
      {f.shine ? (
        <span className={clsx("flair-shine truncate min-w-0", nameClassName)} data-moving={moving ? "" : undefined} style={vars(f.shineMetal ? FLAIR_PALETTE[f.shineMetal] : FLAIR_PALETTE.violetName)}>{text}</span>
      ) : (
        <span className={clsx("truncate min-w-0", nameClassName)}>{text}</span>
      )}
      {!chat ? mark : null}
      {/* The ORACLE word is animated everywhere (one holder, so one sweep). */}
      {oracle && f.oracle ? <OracleWord /> : null}
    </span>
  );
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

/** Live chat's name: diamond before it, violet-only shine, still (no avatars). */
export function FlairChatName({ user, className, nameClassName }: { user: FlairUser; className?: string; nameClassName?: string }) {
  return <FlairName user={user} chat className={className} nameClassName={nameClassName} />;
}

/** Avatar + name + mark, still — a list row's user cell (search, DMs…). */
export function FlairUserInline({ user, size = 40, className, nameClassName = "text-primary", textClassName = "t-body-md" }: {
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
