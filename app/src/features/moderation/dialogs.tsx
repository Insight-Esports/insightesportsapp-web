// moderation/dialogs.tsx — the block confirm, a one-button alert, and the
// Report / Block / Unblock menu items every person-menu shares
// (Moderation.swift, parity §2).
"use client";

import type { ReactNode } from "react";
import { Ban, Flag, UserCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import { BLOCK_FAILED, blockUser, unblockUser } from "./blocked";
import { Portal, type MenuAction } from "./ActionMenu";

export interface ModerationUser { id: string; username: string }

/** "Block @user?" → POST /dm/blocks. `onBlocked` after the server agreed; `onFailed` with the error line. */
export function BlockConfirm({ user, onCancel, onBlocked, onFailed }: {
  user: ModerationUser | null;
  onCancel: () => void;
  onBlocked: (user: ModerationUser) => void;
  onFailed: (message: string) => void;
}) {
  const run = async (u: ModerationUser) => {
    onCancel();
    try { await blockUser(u.id); onBlocked(u); } catch { onFailed(BLOCK_FAILED); }
  };
  return (
    <Portal>
      <ConfirmDialog
        open={!!user}
        title={`Block @${user?.username ?? ""}?`}
        message="They won't see your profile, comments or messages, and you won't see theirs. You can unblock them in Settings."
        confirmTitle="Block"
        destructive
        onConfirm={() => { if (user) void run(user); }}
        onCancel={onCancel}
      />
    </Portal>
  );
}

/** Unblock straight from a menu (no confirm, like the app). Returns false when the server refused. */
export async function unblockQuietly(userId: string): Promise<boolean> {
  try { await unblockUser(userId); return true; } catch { return false; }
}

/** A titled alert with one OK button (SwiftUI .alert). */
export function AlertDialog({ open, title, message, onClose }: { open: boolean; title: string; message?: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[65] grid place-items-center p-4" role="alertdialog" aria-modal aria-label={title}>
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm rounded-2xl bg-card border border-hairline p-5 flex flex-col gap-3">
          <span className="t-headline-sm text-primary">{title}</span>
          {message ? <span className="t-body-sm text-secondary">{message}</span> : null}
          <div className="flex justify-end mt-2">
            <button type="button" autoFocus onClick={onClose} className="btn-pill !py-2">OK</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * Report · Block @user (or Unblock @user once blocked), below a divider
 * when other items come first. Nothing for your own rows.
 */
export function personActions({ user, blocked, isOwn, reportLabel = "Report", divider = false, onReport, onBlock, onUnblock }: {
  user: ModerationUser;
  blocked: boolean;
  isOwn: boolean;
  reportLabel?: string;
  divider?: boolean;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}): MenuAction[] {
  if (isOwn) return [];
  return [
    { key: "report", label: reportLabel, icon: <Flag size={15} />, dividerBefore: divider, onSelect: onReport },
    blocked
      ? { key: "unblock", label: `Unblock @${user.username}`, icon: <UserCheck size={15} />, onSelect: onUnblock }
      : { key: "block", label: `Block @${user.username}`, icon: <Ban size={15} />, destructive: true, onSelect: onBlock },
  ];
}
