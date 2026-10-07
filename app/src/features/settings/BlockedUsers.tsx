// BlockedUsers — BlockedUsersView.swift. GET /users/me/blocked, unblock via
// DELETE /users/:id/block (optimistic; restored on failure).
"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { type Json } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { EmptyState, InitialAvatar, LoadFailure, SkeletonLedger } from "@/components/ui";
import { normalizeFollowRows, type FollowUser } from "@/features/profile/types";
import { SettingsFrame } from "./components";

export function BlockedUsers() {
  const fetched = useFetch(async (signal) => normalizeFollowRows(await api.get<Json>(endpoints.blockedUsers, { signal })), []);
  const [users, setUsers] = useState<FollowUser[] | null>(null);
  useEffect(() => { if (fetched.data) setUsers(fetched.data); }, [fetched.data]);

  async function unblock(u: FollowUser) {
    const previous = users;
    setUsers((p) => (p ? p.filter((x) => x.id !== u.id) : p));
    try { await api.delete(endpoints.unblockUser(u.id)); } catch { setUsers(previous); }
  }

  return (
    <SettingsFrame title="Blocked Users" backHref="/settings">
      {fetched.loading && !users ? (
        <SkeletonLedger rows={5} avatar={44} />
      ) : fetched.error && !users ? (
        <LoadFailure error={fetched.error} connectionProblem={fetched.connectionProblem} onRetry={fetched.reload} />
      ) : !users || users.length === 0 ? (
        <EmptyState className="!mx-0 mt-10" icon={<Hand />} title="No blocked users" subtitle="People you block will appear here. You can unblock them anytime." />
      ) : (
        <div className="ledger ledger-stripe">
          {users.map((u) => (
            <div key={u.id} className="ledger-row">
              <InitialAvatar name={u.username} imageURL={u.avatarURL} size={44} />
              <span className="t-body-md text-primary flex-1 truncate">{u.username}</span>
              <button type="button" onClick={() => void unblock(u)} className="px-3.5 py-[7px] rounded-full bg-surface text-violet t-label-md hover:brightness-110">Unblock</button>
            </div>
          ))}
        </div>
      )}
    </SettingsFrame>
  );
}
