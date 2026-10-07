// NewMessage — NewMessageView.swift: search people (250 ms debounce),
// suggestions while the field is empty (you follow, then follows you),
// pick one → POST /conversations → the thread.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import type { Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { AssetIcon, InitialAvatar, Ledger, LedgerRow, Page, SearchField, Spinner } from "@/components/ui";
import { startConversation, startConversationMessage } from "./start-conversation";
import { normalizeSearchUser, type SearchUser } from "./types";

interface SuggestedUser extends SearchUser { reason: "You follow" | "Follows you" }
interface FollowRowLite { id?: string | null; target_id?: string | null; username?: string | null; avatar_url?: string | null }

export function NewMessage() {
  const router = useRouter();
  const { user } = useAppState();
  const me = user?.id ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // People you follow, then people who follow you (deduped).
  useEffect(() => {
    if (!me) return;
    let active = true;
    const quiet = async (path: string): Promise<FollowRowLite[]> => {
      try { const raw = await api.get<Json>(path); return Array.isArray(raw) ? (raw as FollowRowLite[]) : []; } catch { return []; }
    };
    void (async () => {
      const [following, followers] = await Promise.all([quiet(endpoints.following(me, 20, 0, "user")), quiet(endpoints.followers(me, 20, 0))]);
      if (!active) return;
      const seen = new Set<string>();
      const out: SuggestedUser[] = [];
      for (const r of following) {
        const id = r.target_id ?? r.id;
        if (!id || !r.username || id === me || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, username: r.username, avatarURL: r.avatar_url ?? null, reason: "You follow" });
      }
      for (const r of followers) {
        const id = r.target_id ?? r.id;
        if (!id || !r.username || id === me || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, username: r.username, avatarURL: r.avatar_url ?? null, reason: "Follows you" });
      }
      setSuggested(out);
    })();
    return () => { active = false; };
  }, [me]);

  // Search, debounced 250 ms.
  useEffect(() => {
    const term = query.trim();
    const seq = ++searchSeq.current;
    if (!term) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const raw = await api.get<{ users?: Json[] }>(endpoints.search(term));
        if (seq !== searchSeq.current) return;
        const users = (Array.isArray(raw?.users) ? raw.users : []).map(normalizeSearchUser).filter((u): u is SearchUser => u !== null && u.id !== me);
        setResults(users);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, me]);

  const open = async (u: SearchUser) => {
    setError(null);
    setOpening(u.id);
    try {
      const row = await startConversation(u.id);
      router.push(`/messages/${encodeURIComponent(row.id)}`);
    } catch (e) {
      setError(startConversationMessage(e));
      setOpening(null);
    }
  };

  const term = query.trim();
  const showSuggested = term === "" && suggested.length > 0;
  const shownResults = term ? results : [];
  const searching = isSearching && term !== "";

  return (
    <Page>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 hairline-b">
        <span className="t-headline-sm text-primary flex-1 text-center md:text-left">New Message</span>
        <button type="button" onClick={() => router.push("/messages")} className="t-label-lg text-violet hover:underline">Cancel</button>
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3 max-w-2xl">
        <SearchField value={query} onChange={setQuery} placeholder="Search people" autoFocus />
        {error ? <span className="t-label-sm text-muted">{error}</span> : null}

        {showSuggested ? (
          <div className="flex flex-col gap-2 pb-2">
            <span className="t-kicker">Suggested</span>
            <Ledger>
              {suggested.map((u) => (
                <LedgerRow key={u.id} onClick={() => void open(u)}>
                  <InitialAvatar name={u.username} imageURL={u.avatarURL} size={36} />
                  <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="t-body-md text-primary truncate">{u.username}</span>
                    <span className="t-label-sm text-muted">{u.reason}</span>
                  </span>
                  {opening === u.id ? <Spinner size={16} /> : <AssetIcon name="messages" height={16} />}
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        ) : null}

        {shownResults.length > 0 ? (
          <Ledger>
            {shownResults.map((u) => (
              <LedgerRow key={u.id} onClick={() => void open(u)}>
                <InitialAvatar name={u.username} imageURL={u.avatarURL} size={36} />
                <span className="t-body-md text-primary truncate flex-1">{u.username}</span>
                {opening === u.id ? <Spinner size={16} /> : <ChevronRight size={14} className="text-muted" />}
              </LedgerRow>
            ))}
          </Ledger>
        ) : searching ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : null}
      </div>
    </Page>
  );
}
