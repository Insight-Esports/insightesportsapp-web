// moderation/ReportSheet.tsx — Report, Instagram / Discord style
// (Moderation.swift, web/ios-parity-2026-10-28.md §2). A bottom sheet on
// phones, a modal on desktop (the shared <Sheet>).
//
//   1. From a message only: This message (its text) or @user's profile.
//      From a profile it starts at step 2.
//   2. The reason. One tap sends it.
//   3. Sent, then "Block @user too?" right there.
//
// Endpoints (each answers {} on a repeat; `reason` is the label tapped):
//   chat     POST /chat/:room/messages/:id/report {reason}
//   comment  POST /comments/:id/report {reason}
//   profile  POST /users/:id/report {reason, report_type: avatar | username | user}
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { Sheet, Spinner } from "@/components/ui";
import { FlairAvatar, type FlairUser } from "@/components/ui/premium-flair";
import { BLOCK_FAILED, blockUser } from "./blocked";
import { useIsBlocked } from "./use-blocked";
import { Portal } from "./ActionMenu";

export type ReportUser = FlairUser & { id: string };
export type ReportTarget =
  | { kind: "chat"; roomId: string; messageId: string; text: string; user: ReportUser }
  | { kind: "comment"; commentId: string; text: string; user: ReportUser }
  | { kind: "profile"; user: ReportUser };

export const MESSAGE_REASONS = [
  "Spam or scam", "Harassment or bullying", "Hate speech", "Sexual content", "Violence or threats", "Pretending to be someone else", "Something else",
] as const;
export const PROFILE_REASONS = [
  "Profile picture", "Username", "Pretending to be someone else", "Spam or scam", "Harassment or bullying", "Hate speech", "Sexual content", "Something else",
] as const;

/** `report_type` for a profile report: the picture, the name, or the person. */
export function profileReportType(reason: string): "avatar" | "username" | "user" {
  return reason === "Profile picture" ? "avatar" : reason === "Username" ? "username" : "user";
}

async function sendReport(target: ReportTarget, about: "message" | "profile", reason: string): Promise<void> {
  if (about === "profile" || target.kind === "profile") {
    await api.post(endpoints.reportUser(target.user.id), { reason, report_type: profileReportType(reason) });
  } else if (target.kind === "chat") {
    await api.post(endpoints.reportChatMessage(target.roomId, target.messageId), { reason });
  } else {
    await api.post(endpoints.reportComment(target.commentId), { reason });
  }
}

function targetKey(t: ReportTarget): string {
  return t.kind === "chat" ? `chat:${t.messageId}` : t.kind === "comment" ? `comment:${t.commentId}` : `profile:${t.user.id}`;
}

/** `onClose({blocked})`: `blocked` when they were blocked from the sheet (the screen then reacts like a menu block). */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: (result: { blocked: boolean }) => void }) {
  if (!target) return null;
  return <Portal><ReportFlow key={targetKey(target)} target={target} onClose={onClose} /></Portal>;
}

type Step = "choose" | "reason" | "sent";

function ReportFlow({ target, onClose }: { target: ReportTarget; onClose: (result: { blocked: boolean }) => void }) {
  const fromMessage = target.kind !== "profile";
  const [step, setStep] = useState<Step>(fromMessage ? "choose" : "reason");
  const [about, setAbout] = useState<"message" | "profile">(fromMessage ? "message" : "profile");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<"idle" | "blocking" | "blocked" | "failed">("idle");
  const alreadyBlocked = useIsBlocked(target.user.id);
  const user = target.user;
  const close = () => onClose({ blocked: blockState === "blocked" });
  // Esc closes this sheet only, never a sheet underneath it (live chat).
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const pick = (which: "message" | "profile") => { setAbout(which); setError(null); setStep("reason"); };
  const send = async (reason: string) => {
    if (sending) return;
    setSending(reason);
    setError(null);
    try {
      await sendReport(target, about, reason);
      setStep("sent");
    } catch {
      setError("Couldn't send the report. Check your connection and try again.");
    } finally {
      setSending(null);
    }
  };
  const block = async () => {
    if (blockState === "blocking") return;
    setBlockState("blocking");
    try { await blockUser(user.id); setBlockState("blocked"); } catch { setBlockState("failed"); }
  };

  const reasons = about === "message" ? MESSAGE_REASONS : PROFILE_REASONS;
  const heading = about === "message" ? "Why are you reporting this message?" : `Why are you reporting @${user.username}?`;
  const canGoBack = step === "reason" && fromMessage;

  return (
    <Sheet
      open
      onClose={close}
      title="Report"
      leading={canGoBack ? (
        <button type="button" onClick={() => { setStep("choose"); setError(null); }} aria-label="Back" className="text-violet hover:brightness-110"><ChevronLeft size={22} strokeWidth={2.5} /></button>
      ) : undefined}
      trailing={canGoBack ? (
        <button type="button" onClick={close} aria-label="Close" className="text-secondary hover:text-primary"><X size={20} /></button>
      ) : undefined}
    >
      {step === "choose" ? (
        <div className="flex flex-col gap-3">
          <div className="ledger">
            <button type="button" onClick={() => pick("message")} className="ledger-row w-full text-left hover:bg-surface/50 transition-colors hairline-b">
              <span className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="t-body-md text-primary">This message</span>
                <span className="t-body-sm text-muted line-clamp-2 break-words">“{target.kind !== "profile" ? target.text : ""}”</span>
              </span>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </button>
            <button type="button" onClick={() => pick("profile")} className="ledger-row w-full text-left hover:bg-surface/50 transition-colors">
              <FlairAvatar user={user} size={28} />
              <span className="t-body-md text-primary flex-1 min-w-0 truncate">@{user.username}&apos;s profile</span>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </button>
          </div>
          <Footer />
        </div>
      ) : step === "reason" ? (
        <div className="flex flex-col gap-3">
          <span className="t-headline-sm text-primary px-0.5">{heading}</span>
          <div className="ledger">
            {reasons.map((r, i) => (
              <button
                key={r}
                type="button"
                disabled={!!sending}
                onClick={() => void send(r)}
                className={clsx("ledger-row w-full text-left hover:bg-surface/50 transition-colors disabled:cursor-default", i < reasons.length - 1 && "hairline-b", sending && sending !== r && "opacity-50")}
              >
                <span className="t-body-md text-primary flex-1">{r}</span>
                {sending === r ? <Spinner size={16} /> : <ChevronRight size={16} className="text-muted shrink-0" />}
              </button>
            ))}
          </div>
          {error ? <span role="alert" className="t-body-sm text-error px-0.5">{error}</span> : null}
          <Footer />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 pt-2 pb-1">
          <div className="flex flex-col items-center gap-2 text-center px-2">
            <span className="grid place-items-center size-12 rounded-full bg-success/15 text-success"><Check size={24} strokeWidth={2.75} /></span>
            <span className="t-headline-sm text-primary">Thanks for letting us know</span>
            <span className="t-body-sm text-secondary max-w-sm">Our team reviews every report and acts on the ones that break the rules.</span>
          </div>
          <div className="w-full ledger p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <FlairAvatar user={user} size={40} />
              {blockState === "blocked" || (alreadyBlocked && blockState === "idle") ? (
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="t-label-lg text-primary truncate">@{user.username} is blocked</span>
                  <span className="t-body-sm text-secondary">You can unblock them in Settings → Blocked Users.</span>
                </span>
              ) : (
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="t-label-lg text-primary truncate">Block @{user.username} too?</span>
                  <span className="t-body-sm text-secondary">You won&apos;t see their messages, comments or profile anywhere in the app, and they won&apos;t see yours.</span>
                </span>
              )}
            </div>
            {blockState === "failed" ? <span role="alert" className="t-body-sm text-error">{BLOCK_FAILED}</span> : null}
            <div className="flex justify-end gap-2">
              {blockState === "blocked" || (alreadyBlocked && blockState === "idle") ? (
                <button type="button" onClick={close} className="btn-pill !py-2">Done</button>
              ) : (
                <>
                  <button type="button" onClick={close} className="btn-ghost !py-2">Not now</button>
                  <button type="button" onClick={() => void block()} disabled={blockState === "blocking"} className="btn-pill !py-2 !bg-error min-w-[84px] disabled:opacity-70">
                    {blockState === "blocking" ? <Spinner size={14} className="border-white/40 border-t-white" /> : "Block"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Footer() {
  return <span className="t-label-sm text-muted text-center px-4">Reports are anonymous. The person won&apos;t know who reported them.</span>;
}
