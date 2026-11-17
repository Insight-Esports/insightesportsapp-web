// InsightCallsSection.tsx — "Insight's Calls" on a match page
// (InsightCalls.swift): the list, the locked teaser, or nothing.
//
//  · Premium sees the calls from before the match, each with its chance,
//    pending until it ends.
//  · A free account sees that they exist (how many) and the way to Premium;
//    once the match is over it sees the whole list, plus a row to get the
//    next ones in time.
//  · Settled: the final value with HIT or MISS (a miss as plain as a hit),
//    DIDN'T PLAY for a void call. Under the list: "2 of 4 hit · Made before
//    the match and never changed."
// A match with no calls, or a server without the route, draws nothing.
//
// `variant`: "box" is the live / finished pages' own section box (title
// inside, like Win Probability); "section" is the preview's header + ledger.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { SectionHeader } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import type { Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { callLine, callName, captionText, normalizeCalls, percentText, showsLine, valueText, type InsightCall, type InsightCalls } from "./model";

const UPGRADE = "/premium/upgrade";
const TITLE = "Insight's Calls";

export function InsightCallsSection({ matchId, variant = "box", refreshKey, className }: {
  matchId: string;
  variant?: "box" | "section";
  /** Read again when this changes (the live page passes whether the match is over). */
  refreshKey?: string | number | boolean;
  className?: string;
}) {
  const { isPremium, user } = useAppState();
  const signedIn = !!user;
  const [data, setData] = useState<InsightCalls | null>(null);

  // Again when Premium starts or ends: the server answers by plan. Not
  // before the session is known (the plan would flip and ask twice).
  useEffect(() => {
    if (!signedIn) return;
    const ctrl = new AbortController();
    api.get<Json>(endpoints.alertCalls(matchId), { signal: ctrl.signal })
      .then((raw) => { if (!ctrl.signal.aborted) setData(normalizeCalls(raw)); })
      .catch(() => { if (!ctrl.signal.aborted) setData(null); });
    return () => ctrl.abort();
  }, [matchId, isPremium, refreshKey, signedIn]);

  if (!data) return null;
  if (data.available && data.calls.length > 0) return <CallsList data={data} isPremium={isPremium} variant={variant} className={className} />;
  if (data.locked && data.callsCount > 0) return <CallsTeaser count={data.callsCount} variant={variant} className={className} />;
  return null;
}

/** The section's frame: the live pages' box with its label inside, or the preview's header over a ledger. */
function Frame({ variant, className, children, caption }: { variant: "box" | "section"; className?: string; children: React.ReactNode; caption?: string }) {
  if (variant === "section") {
    return (
      <div className={clsx("flex flex-col gap-2.5", className)}>
        <SectionHeader title={TITLE} className="!px-0" />
        <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">{children}</div>
        {caption ? <span className="t-label-sm text-muted">{caption}</span> : null}
      </div>
    );
  }
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
        <div className="px-3.5 pt-3 pb-1"><span className="t-label-md text-muted">{TITLE}</span></div>
        {children}
      </div>
      {caption ? <span className="t-label-sm text-muted px-1">{caption}</span> : null}
    </div>
  );
}

function CallsList({ data, isPremium, variant, className }: { data: InsightCalls; isPremium: boolean; variant: "box" | "section"; className?: string }) {
  return (
    <Frame variant={variant} className={className} caption={captionText(data)}>
      <ul>
        {data.calls.map((c, i) => (
          <li key={c.id} className={clsx(i > 0 && "border-t border-border-subtle ml-3.5")}>
            <CallRow call={c} indented={i > 0} />
          </li>
        ))}
      </ul>
      {/* Free, after the match: the way to see the next ones in time. */}
      {!isPremium ? (
        <Link href={UPGRADE} className="flex items-center gap-2 px-3.5 py-3 border-t border-border-subtle hover:bg-surface/50 transition-colors">
          <span className="t-label-lg text-violet-light">Get the calls before the match</span>
          <span className="flex-1" />
          <ChevronRight size={12} className="text-muted" />
        </Link>
      ) : null}
    </Frame>
  );
}

function CallRow({ call, indented }: { call: InsightCall; indented: boolean }) {
  const settled = call.status !== "pending";
  const readout = (() => {
    switch (call.status) {
      case "hit": return { value: valueText(call), word: "HIT", color: "text-success" };
      case "miss": return { value: valueText(call), word: "MISS", color: "text-error" };
      case "void": return { value: "–", word: "DIDN'T PLAY", color: "text-muted" };
      default: return { value: call.chance !== null ? percentText(call.chance) : "–", word: "CHANCE", color: "text-violet-light" };
    }
  })();
  return (
    <div className={clsx("flex items-center gap-3 py-[11px] pr-3.5", indented ? "pl-0" : "pl-3.5")}>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-label-lg text-primary truncate">{callName(call)}</span>
        {showsLine(call) ? <span className="t-body-sm text-secondary truncate">{callLine(call)}</span> : null}
        {/* Settled: the chance it had moves under the call. */}
        {settled && call.chance !== null ? <span className="t-label-sm text-muted truncate">{percentText(call.chance)} chance</span> : null}
      </div>
      <div className="flex flex-col items-end gap-px shrink-0">
        <span className="font-mono text-[17px] font-semibold leading-tight tabular-nums text-primary">{readout.value}</span>
        <span className={clsx("text-[9px] font-bold tracking-[0.8px]", readout.color)}>{readout.word}</span>
      </div>
    </div>
  );
}

/** Free, before the end: that the calls exist, and the way to them. */
function CallsTeaser({ count, variant, className }: { count: number; variant: "box" | "section"; className?: string }) {
  return (
    <Frame variant={variant} className={className}>
      <Link href={UPGRADE} className={clsx("flex items-center gap-3 px-3.5 hover:bg-surface/50 transition-colors", variant === "section" ? "py-3.5" : "pt-1.5 pb-3.5")}>
        <span className="grid place-items-center size-9 rounded-[9px] bg-violet/15 text-violet-light shrink-0"><Lock size={14} strokeWidth={2.5} /></span>
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="t-label-lg text-primary">Insight&apos;s calls are in</span>
          <span className="t-label-sm text-muted">Premium sees them now. Everyone sees how they did when the match ends.</span>
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[17px] font-semibold tabular-nums text-primary">{count}</span>
        <ChevronRight size={12} className="text-muted shrink-0" />
      </Link>
    </Frame>
  );
}
