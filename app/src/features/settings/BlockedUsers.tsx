// BlockedUsers — BlockedUsersView.swift. GET /users/me/blocked; unblock is
// the app-wide DELETE /dm/blocks/:userId through the shared blocked store
// (so chat, comments, follow lists and the inbox show them again at once).
// Optimistic; restored on failure.
"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { type Json } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { EmptyState, LoadFailure, SkeletonLedger, Toast } from "@/components/ui";
import { FlairAvatar } from "@/components/ui/premium-flair";
import { normalizeFollowRows, type FollowUser } from "@/features/profile/types";
import { unblockUser } from "@/features/moderation/blocked";
import { SettingsFrame } from "./components";

export function BlockedUsers() {
  const fetched = useFetch(async (signal) => normalizeFollowRows(await api.get<Json>(endpoints.blockedUsers, { signal })), []);
  const [users, setUsers] = useState<FollowUser[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Rows appear with their avatars in place: the page's copy of the list
  // only updates once the fetched avatars are warm.
  const revealed = useReveal(fetched.loading, () => (fetched.data ?? []).map((u) => u.avatarURL));
  useEffect(() => { if (revealed && fetched.data) setUsers(fetched.data); }, [revealed, fetched.data]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  async function unblock(u: FollowUser) {
    const previous = users;
    setUsers((p) => (p ? p.filter((x) => x.id !== u.id) : p));
    try { await unblockUser(u.id); } catch { setUsers(previous); setToast("Couldn't unblock. Check your connection and try again."); }
  }

  return (
    <SettingsFrame title="Blocked Users" backHref="/settings">
      {!users && !fetched.error ? (
        <SkeletonLedger rows={5} avatar={44} />
      ) : fetched.error && !users ? (
        <LoadFailure error={fetched.error} connectionProblem={fetched.connectionProblem} onRetry={fetched.reload} />
      ) : !users || users.length === 0 ? (
        <EmptyState className="!mx-0 mt-10" icon={<Hand />} title="No blocked users" subtitle="People you block will appear here. You can unblock them anytime." />
      ) : (
        <div className="ledger ledger-stripe">
          {users.map((u) => (
            <div key={u.id} className="ledger-row">
              <FlairAvatar user={u} size={44} />
              <span className="t-body-md text-primary flex-1 truncate">{u.username}</span>
              <button type="button" onClick={() => void unblock(u)} className="px-3.5 py-[7px] rounded-full bg-surface text-violet t-label-md hover:brightness-110">Unblock</button>
            </div>
          ))}
        </div>
      )}
      <Toast message={toast} kind="error" />
    </SettingsFrame>
  );
}
