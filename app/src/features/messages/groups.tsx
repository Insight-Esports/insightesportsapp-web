// messages/groups.tsx — group chats, Instagram's way (GroupChats.swift):
//
//   • GroupAvatar — two of the group's people, one over the other; a group
//     of two shows the other person alone.
//   • SeenByRow — who has read this far: small avatars, then "Seen by karlo, aina".
//   • GroupNoteRow — a line of the thread's own: "ivan added karlo".
//   • GroupPeoplePicker — "New group chat" (a name, search, Suggested with a
//     circle each, Create at two or more) and "Add people" to one that exists.
//   • GroupInfo — behind the thread header: picture and name, Change name,
//     Add · Mute · Leave, the people (admins can remove), Leave chat.
//
// The crypto and the wire are the service's (createGroup / addMembers /
// rotateGroupKey / removeMember / leaveGroup); backend/group-chats-contract.md.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Check, ChevronLeft, Ellipsis, LogOut, UserMinus, UserPlus, X } from "lucide-react";
import { api, ApiError, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { normalizePremiumStyle, normalizeTitle, type Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { ConfirmDialog, InitialAvatar, Spinner } from "@/components/ui";
import { FlairAvatar, FlairName, type FlairUser } from "@/components/ui/premium-flair";
import { useBlockedIds } from "@/features/moderation/use-blocked";
import { Portal } from "@/features/moderation/ActionMenu";
import { addMembers, createGroup, DMUserError, leaveGroup, removeMember, renameGroup, setMuted } from "./service";
import { conversationTitle, iAmAdmin, isAdmin, memberFlair, normalizeSearchUser, othersOf, type DMConversationRow, type DMMember, type SearchUser } from "./types";

// ── Avatar ────────────────────────────────────────────────────────────────
// Photos only in the stack: a flair ring drawn at two-thirds size crowds
// the pair (one person alone keeps their flair).
export function GroupAvatar({ members, size = 52 }: { members: DMMember[]; size?: number }) {
  const shown = members.slice(0, 2);
  if (shown.length < 2) {
    if (shown[0]) return <FlairAvatar user={memberFlair(shown[0])} size={size} />;
    return <span className="grid place-items-center rounded-full bg-surface text-secondary font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.32 }}>G</span>;
  }
  const small = Math.round(size * 0.68);
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute left-0 top-0 flex"><InitialAvatar name={shown[1].username} imageURL={shown[1].avatarURL} size={small} /></span>
      <span className="absolute flex rounded-full bg-bg" style={{ left: size - small - 2, top: size - small - 2, padding: 2 }}>
        <InitialAvatar name={shown[0].username} imageURL={shown[0].avatarURL} size={small} />
      </span>
    </span>
  );
}

// ── Seen by ───────────────────────────────────────────────────────────────
export function seenByCaption(readers: DMMember[]): string {
  const names = readers.map((m) => m.username);
  if (names.length === 0) return "";
  if (names.length <= 2) return "Seen by " + names.join(", ");
  if (names.length === 3) return `Seen by ${names[0]}, ${names[1]} and ${names[2]}`;
  return `Seen by ${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

export function SeenByRow({ readers }: { readers: DMMember[] }) {
  if (!readers.length) return null;
  return (
    <div className="flex items-center justify-end gap-1.5 pt-0.5 pr-1">
      <span className="flex items-center -space-x-[5px]">
        {readers.slice(0, 4).map((m) => (
          <span key={m.id} className="rounded-full ring-[1.5px] ring-bg bg-bg"><FlairAvatar user={memberFlair(m)} size={16} /></span>
        ))}
      </span>
      <span className="t-label-sm text-muted truncate">{seenByCaption(readers)}</span>
    </div>
  );
}

// ── Group lines ───────────────────────────────────────────────────────────
export function GroupNoteRow({ text }: { text: string }) {
  return <div className="px-6 py-2 text-center t-label-md text-muted">{text}</div>;
}

// ── People picker (new group, add people) ─────────────────────────────────
interface Person extends SearchUser { reason?: string }
interface FollowRowLite { id?: string | null; target_id?: string | null; username?: string | null; avatar_url?: string | null; is_premium?: boolean | null; premium_style?: unknown; title?: string | null }

function personFlair(p: Person): FlairUser {
  return p.flair ?? { id: p.id, username: p.username, avatarURL: p.avatarURL, isPremium: false, premiumStyle: null };
}

const words = (e: unknown) => (e instanceof DMUserError ? e.message : e instanceof ApiError ? (e.isConnectionProblem ? "Couldn't do that. Check your connection." : e.message) : e instanceof Error && e.message === "NOT_LINKED" ? "Link this browser from your phone to use Messages." : "Couldn't do that. Check your connection.");

/** Instagram's "New group chat" (mode create) and "Add people" (mode add). */
export function GroupPeoplePicker({ mode, row, onDone, onCancel }: {
  mode: "create" | "add";
  /** add: the group. */
  row?: DMConversationRow;
  /** create: the new group's row. add: the group with its new people. */
  onDone: (row: DMConversationRow) => void;
  onCancel: () => void;
}) {
  const { user } = useAppState();
  const me = user?.id ?? null;
  const isCreate = mode === "create";
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [suggested, setSuggested] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [results, setResults] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const blockedIds = useBlockedIds();

  const excluded = useMemo(() => {
    const out = new Set<string>();
    if (me) out.add(me);
    if (mode === "add" && row) for (const m of row.members) out.add(m.id);
    return out;
  }, [me, mode, row]);
  const term = query.trim();
  const shown = (term ? results : suggested).filter((p) => !excluded.has(p.id) && !blockedIds.has(p.id));
  /** A group is at least three people, you included. */
  const ready = isCreate ? picked.length >= 2 : picked.length > 0;

  // People you follow, then who follow you (deduped), as Instagram suggests.
  useEffect(() => {
    if (!me) return;
    let active = true;
    const quiet = async (path: string): Promise<FollowRowLite[]> => {
      try { const raw = await api.get<Json>(path); return Array.isArray(raw) ? (raw as FollowRowLite[]) : []; } catch { return []; }
    };
    void (async () => {
      const [following, followers] = await Promise.all([quiet(endpoints.following(me, 30, 0, "user")), quiet(endpoints.followers(me, 30, 0))]);
      if (!active) return;
      const seen = new Set<string>();
      const out: Person[] = [];
      for (const [rows, reason] of [[following, "You follow"], [followers, "Follows you"]] as const) {
        for (const r of rows) {
          const id = r.target_id ?? r.id;
          if (!id || !r.username || id === me || seen.has(id)) continue;
          seen.add(id);
          out.push({ id, username: r.username, avatarURL: r.avatar_url ?? null, reason, flair: { id, username: r.username, avatarURL: r.avatar_url ?? null, isPremium: !!r.is_premium, premiumStyle: normalizePremiumStyle(r.premium_style), title: r.title !== undefined ? normalizeTitle(r.title) : undefined } });
        }
      }
      setSuggested(out);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [me]);

  // Search: two letters or more, a beat after typing stops.
  useEffect(() => {
    const seq = ++searchSeq.current;
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const raw = await api.get<{ users?: Json[] }>(endpoints.search(term));
        if (seq !== searchSeq.current) return;
        setResults((Array.isArray(raw?.users) ? raw.users : []).map(normalizeSearchUser).filter((u): u is SearchUser => u !== null));
      } catch {
        if (seq === searchSeq.current) setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const toggle = (p: Person) => {
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]));
    setError(null);
  };

  const submit = async () => {
    if (working || !ready) return;
    setWorking(true);
    setError(null);
    try {
      if (isCreate) onDone(await createGroup(name, picked.map((p) => p.id)));
      else if (row) onDone(await addMembers(picked.map((p) => p.id), row));
    } catch (e) {
      setError(words(e));
    } finally {
      setWorking(false);
    }
  };

  const emptyText = !term ? "Follow people to see them here, or search." : term.length < 2 ? "Keep typing to search." : "No one by that name.";

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-bg">
      <div className="flex items-center gap-3 px-3 pt-2 pb-2 hairline-b shrink-0">
        <button type="button" onClick={onCancel} aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet"><ChevronLeft size={20} strokeWidth={2.5} /></button>
        <span className="t-headline-sm text-primary flex-1 truncate">{isCreate ? "New group chat" : "Add people"}</span>
      </div>
      <div className="flex flex-col gap-2.5 pt-3 shrink-0 max-w-2xl w-full mx-auto">
        {isCreate ? (
          <input
            value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Group name (optional)"
            className="mx-4 px-3.5 py-3 rounded-[14px] bg-bg border border-border-strong t-body-md text-primary placeholder:text-muted outline-none focus:border-violet"
          />
        ) : null}
        <div className="mx-4 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="text-muted shrink-0" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" autoFocus={!isCreate} className="flex-1 min-w-0 bg-transparent outline-none t-body-md text-primary placeholder:text-muted" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="text-muted hover:text-primary"><X size={14} /></button> : null}
        </div>
        {picked.length ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {picked.map((p) => (
              <button key={p.id} type="button" onClick={() => toggle(p)} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-violet/[0.18] shrink-0 hover:bg-violet/30">
                <FlairAvatar user={personFlair(p)} size={20} />
                <span className="t-label-md text-primary">{p.username}</span>
                <X size={10} strokeWidth={3} className="text-muted" />
              </button>
            ))}
          </div>
        ) : null}
        {error ? <span role="alert" className="px-4 t-label-sm text-live">{error}</span> : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pb-28 max-w-2xl w-full mx-auto">
        {!term && shown.length ? <div className="px-4 pt-2 pb-1 t-headline-sm text-primary">Suggested</div> : null}
        {!loaded && !term ? (
          <div className="grid place-items-center pt-10"><Spinner size={18} /></div>
        ) : shown.length === 0 ? (
          <div className="px-6 pt-10 text-center t-body-sm text-muted">{emptyText}</div>
        ) : (
          shown.map((p) => {
            const on = picked.some((x) => x.id === p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p)} aria-pressed={on} className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-surface/50 transition-colors">
                <FlairAvatar user={personFlair(p)} size={44} />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <FlairName user={personFlair(p)} className="t-body-md self-start" />
                  {p.reason ? <span className="t-label-sm text-muted">{p.reason}</span> : null}
                </span>
                <span className={clsx("grid place-items-center size-6 rounded-full border-[1.5px] shrink-0 transition-colors", on ? "bg-violet border-violet" : "border-border-strong")}>
                  {on ? <Check size={12} strokeWidth={3.5} className="text-white" /> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
      {/* Create (or Add), once enough people are picked. */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-10 bg-gradient-to-b from-transparent to-bg">
          {ready ? (
            <button type="button" onClick={() => void submit()} disabled={working} className="pointer-events-auto grid place-items-center w-full h-12 rounded-full bg-violet text-white t-label-lg hover:brightness-110 disabled:opacity-80 dm-rise-in">
              {working ? <Spinner size={16} className="border-white/40 border-t-white" /> : isCreate ? "Create" : picked.length === 1 ? "Add" : `Add ${picked.length}`}
            </button>
          ) : isCreate && picked.length === 1 ? (
            <div className="text-center t-label-sm text-muted pb-1">Pick at least one more person for a group.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Group info ────────────────────────────────────────────────────────────
/** Behind the thread header: the group's picture and name, Add · Mute ·
 *  Leave, everyone in it, and the way out — Instagram's details page. */
export function GroupInfo({ row, onChange, onLeft, onClose }: {
  row: DMConversationRow;
  /** The thread hears about a new name or people. */
  onChange: (row: DMConversationRow) => void;
  /** You left: the thread closes. */
  onLeft: () => void;
  onClose: () => void;
}) {
  const { user } = useAppState();
  const me = user?.id ?? "";
  const [muted, setMutedState] = useState(row.muted);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<DMMember | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const admin = iAmAdmin(row, me);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !renaming && !leaving && !removing && !adding) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [adding, leaving, onClose, removing, renaming]);

  // Admins first, then by name; you where you fall.
  const sorted = [...row.members].sort((a, b) => (isAdmin(a) !== isAdmin(b) ? (isAdmin(a) ? -1 : 1) : a.username.localeCompare(b.username, undefined, { sensitivity: "base" })));

  const rename = async () => {
    setRenaming(false);
    try { onChange(await renameGroup(row, draftName)); setError(null); } catch (e) { setError(words(e)); }
  };
  const toggleMute = async () => {
    const next = !muted;
    setMutedState(next);
    try { await setMuted(row.id, next); onChange({ ...row, muted: next }); setError(null); } catch (e) { setMutedState(!next); setError(words(e)); }
  };
  const remove = async (m: DMMember) => {
    setRemoving(null);
    const before = row;
    onChange({ ...row, members: row.members.filter((x) => x.id !== m.id) });
    try { await removeMember(m.id, before); setError(null); } catch (e) { onChange(before); setError(words(e)); }
  };
  const leave = async () => {
    setLeaving(false);
    try { await leaveGroup(row); onLeft(); } catch (e) { setError(words(e)); }
  };

  if (adding) {
    return (
      <div className="absolute inset-0 z-30 bg-bg">
        <GroupPeoplePicker mode="add" row={row} onCancel={() => setAdding(false)} onDone={(updated) => { onChange(updated); setAdding(false); }} />
      </div>
    );
  }

  const action = (title: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 flex-1 py-3 rounded-xl text-primary hover:bg-surface/60 transition-colors">
      <span className="h-6 grid place-items-center">{icon}</span>
      <span className="t-label-md">{title}</span>
    </button>
  );

  return (
    <div className="absolute inset-0 z-30 bg-bg flex flex-col min-h-0" role="dialog" aria-label="Group details">
      <div className="flex items-center gap-2 px-3 pt-1.5 pb-2 hairline-b shrink-0">
        <button type="button" onClick={onClose} aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet"><ChevronLeft size={20} strokeWidth={2.5} /></button>
        <span className="flex-1" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-5 pt-3 pb-10 max-w-xl mx-auto w-full">
          <div className="flex flex-col items-center gap-2.5 px-6 text-center">
            <GroupAvatar members={othersOf(row, me)} size={88} />
            <span className="t-headline-lg text-primary break-words">{conversationTitle(row, me)}</span>
            <button type="button" onClick={() => { setDraftName(row.name ?? ""); setRenaming(true); }} className="t-label-md text-violet hover:underline">Change name</button>
            <span className="t-label-sm text-muted">{row.members.length} people</span>
          </div>
          <div className="flex px-6">
            {action("Add", <UserPlus size={20} />, () => setAdding(true))}
            {action(muted ? "Unmute" : "Mute", muted ? <BellOff size={20} /> : <Bell size={20} />, () => void toggleMute())}
            {action("Leave", <LogOut size={20} />, () => setLeaving(true))}
          </div>
          {error ? <span role="alert" className="px-6 text-center t-label-sm text-live">{error}</span> : null}
          <div className="flex flex-col gap-2.5 px-4">
            <span className="t-label-sm text-muted px-0">PEOPLE</span>
            <div className="rounded-xl bg-card border border-border-subtle">
              {sorted.map((m, i) => (
                <div key={m.id} className={clsx("relative flex items-center gap-3 px-3 py-2.5", i > 0 && "border-t border-border-subtle")}>
                  <Link href={m.id === me ? "/profile" : `/profile/${encodeURIComponent(m.id)}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-85">
                    <FlairAvatar user={memberFlair(m)} size={40} />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <FlairName user={memberFlair(m)} className="t-body-md self-start" />
                      <span className={clsx("t-label-sm", isAdmin(m) ? "text-violet" : "text-muted")}>
                        {m.id === me ? (isAdmin(m) ? "You · Admin" : "You") : isAdmin(m) ? "Admin" : "Member"}
                      </span>
                    </span>
                  </Link>
                  {admin && m.id !== me ? (
                    <span className="relative">
                      <button type="button" aria-label={`More for ${m.username}`} onClick={(e) => { e.stopPropagation(); setMenuFor((cur) => (cur === m.id ? null : m.id)); }} className="grid place-items-center size-8 rounded-lg text-muted hover:text-primary hover:bg-surface/60"><Ellipsis size={16} /></button>
                      {menuFor === m.id ? (
                        <div className="absolute right-0 top-9 z-10 min-w-48 ledger py-1" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setRemoving(m); }} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left whitespace-nowrap">
                            <UserMinus size={15} />Remove from group
                          </button>
                        </div>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="px-4">
            <button type="button" onClick={() => setLeaving(true)} className="flex items-center gap-3 w-full px-3.5 py-3 rounded-xl bg-card border border-border-subtle text-live hover:bg-surface/60 text-left">
              <LogOut size={16} /><span className="t-body-md">Leave chat</span>
            </button>
          </div>
        </div>
      </div>

      {renaming ? (
        <Portal>
          <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal aria-label="Group name">
            <div className="absolute inset-0 bg-black/60" onClick={() => setRenaming(false)} />
            <form onSubmit={(e) => { e.preventDefault(); void rename(); }} className="relative w-full max-w-sm rounded-2xl bg-card border border-hairline p-5 flex flex-col gap-3">
              <span className="t-headline-sm text-primary">Group name</span>
              <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={60} placeholder="Name" className="px-3 py-2.5 rounded-xl bg-surface border border-border-subtle t-body-md text-primary outline-none focus:border-violet" />
              <div className="flex justify-end gap-2 mt-1">
                <button type="button" onClick={() => setRenaming(false)} className="btn-ghost !py-2">Cancel</button>
                <button type="submit" className="btn-pill !py-2">Save</button>
              </div>
            </form>
          </div>
        </Portal>
      ) : null}
      <Portal>
        <ConfirmDialog open={leaving} title="Leave this group?" message="You'll stop getting its messages. Someone can add you back." confirmTitle="Leave" destructive onConfirm={() => void leave()} onCancel={() => setLeaving(false)} />
        <ConfirmDialog open={!!removing} title={removing ? `Remove ${removing.username} from the group?` : ""} confirmTitle="Remove" destructive onConfirm={() => { if (removing) void remove(removing); }} onCancel={() => setRemoving(null)} />
      </Portal>
    </div>
  );
}
