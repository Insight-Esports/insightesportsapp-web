// EditProfile — EditProfileView.swift: username + avatar + Premium style.
//
// Username: light pre-check here; the server is the authority (uniqueness,
// slur filter, 30-day cooldown → 409/422 with user-readable text).
// Avatar: picked file previews immediately; on save it goes through
// /api/avatar (Supabase upload + POST /users/me/avatar) and the user is
// re-fetched from GET /users/me, the authoritative source.
// A panel sanction (403 AVATAR_BANNED {ends_at}) shows "You can't change
// your profile picture until Nov 3." under the photo and holds the photo
// back while it shows (parity Oct 28 §2).
// Premium style (#premium-style): a live preview and the ring / shine /
// diamond toggles, plus rank colours while on the monthly podium. It saves
// with the screen's Save: the local mirror first, then PATCH /users/me
// {premiumStyle}, failing silently (422 until the backend stores it).
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Clock } from "lucide-react";
import { api, endpoints, errorMessage, ApiError } from "@/lib/api";
import { normalizeUser, type InsightUser, type Json, type PremiumStylePiece } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { Img, InitialAvatar, Page, Spinner } from "@/components/ui";
import {
  canonicalStyle, clearStyleMirror, DEFAULT_STYLE, FlairAvatar, FlairName, METAL_LABEL, METALS, RingSwatch, sameStyle, ShineSwatch,
  usePodiumPlace, useStyleMirror, writeStyleMirror, type FlairUser, type Metal,
} from "@/components/ui/premium-flair";
import { SettingsToggleRow } from "@/features/settings/components";
import { NavBar } from "@/components/shell/NavBar";
import { withBase } from "@/lib/base-path";
import { noteBan, useBanLine } from "@/features/moderation/ban";

const ALLOWED = /^[A-Za-z0-9_]+$/;

export function EditProfile() {
  const router = useRouter();
  const { user, setUser, refreshUser } = useAppState();
  const [username, setUsername] = useState(user?.username ?? "");
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const originalUsername = user?.username ?? "";
  const avatarBan = useBanLine("avatar");
  // A banned avatar change never goes out; the rest of the screen still saves.
  const photo = avatarBan ? null : picked;

  // Premium style: what's worn now (own mirror > server > default ring) and
  // the draft (null until touched, so it follows the saved value).
  const mirror = useStyleMirror(user?.id);
  const savedStyle = useMemo(() => canonicalStyle(mirror ?? user?.premiumStyle ?? DEFAULT_STYLE), [mirror, user?.premiumStyle]);
  const [styleDraft, setStyleDraft] = useState<PremiumStylePiece[] | null>(null);
  const style = styleDraft ?? savedStyle;
  const styleDirty = !!user?.isPremium && styleDraft !== null && !sameStyle(styleDraft, savedStyle);

  // Search's "Premium Style" result links to /profile/edit#premium-style.
  const hasUser = !!user;
  useEffect(() => {
    if (!hasUser || typeof window === "undefined" || window.location.hash !== "#premium-style") return;
    const id = requestAnimationFrame(() => document.getElementById("premium-style")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, [hasUser]);

  useEffect(() => { if (user && !username) setUsername(user.username); }, [user, username]);
  useEffect(() => {
    if (!picked) { setPreview(null); return; }
    const url = URL.createObjectURL(picked);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  const trimmed = username.trim();
  const usernameError = useMemo(() => {
    if (trimmed === "") return null;
    if (trimmed.length < 3) return "Username must be at least 3 characters.";
    if (trimmed.length > 20) return "Username must be 20 characters or fewer.";
    if (!ALLOWED.test(trimmed)) return "Only letters, numbers, and underscores allowed.";
    return null;
  }, [trimmed]);
  const canSave = (trimmed !== originalUsername || photo !== null || styleDirty) && usernameError === null && trimmed.length >= 3;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (styleDirty && user) await saveStyle(user, canonicalStyle(style), setUser);
      if (photo) {
        const fd = new FormData();
        fd.append("file", photo, photo.name || "avatar.jpg");
        const r = await fetch(withBase("/api/avatar"), { method: "POST", body: fd, credentials: "same-origin" });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          const err = new ApiError(r.status, j?.message ?? j?.error ?? "Couldn't upload the image. Please try again.", j?.code ?? null);
          err.body = j && typeof j === "object" ? j : null;
          throw err;
        }
        await refreshUser();
      }
      if (trimmed !== originalUsername) {
        try {
          const updated = await api.patch<Record<string, unknown>>(endpoints.updateProfile, { username: trimmed });
          if (updated && typeof updated === "object" && updated.id != null) setUser(normalizeUser(updated));
          else await refreshUser();
        } catch (err) {
          if (err instanceof ApiError && err.isUnauthorized) throw new Error("Your session expired. Please log in again.");
          throw err;
        }
      } else {
        await refreshUser();
      }
      router.push("/profile");
    } catch (err) {
      // 403 AVATAR_BANNED: the ban line under the photo says it; the photo is dropped.
      if (noteBan(err) === "avatar") setPicked(null);
      else setSaveError(errorMessage(err, "Couldn't save changes."));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const previewUser: FlairUser = {
    id: user.id,
    username: trimmed || user.username,
    avatarURL: preview ?? user.avatarURL,
    // Non-members see the default ring: what membership would give them.
    isPremium: true,
    premiumStyle: user.isPremium ? style : [...DEFAULT_STYLE],
    title: user.title,
  };

  return (
    <Page>
      <form onSubmit={save} className="max-w-xl mx-auto">
        <NavBar
          title="Edit Profile"
          leading={<button type="button" onClick={() => router.back()} className="t-label-lg text-violet md:text-secondary md:hover:text-primary px-3 md:px-0">Cancel</button>}
          trailing={<button type="submit" disabled={!canSave || saving} className={clsx("t-label-lg min-w-12 text-right", canSave ? "text-violet" : "text-muted", "disabled:cursor-not-allowed")}>{saving ? <Spinner size={16} className="inline-block" /> : "Save"}</button>}
        />

        <div className="flex flex-col gap-7 pt-5 px-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <span className="relative">
              <span className="inline-block size-[110px] rounded-full overflow-hidden border border-border-subtle">
                {preview ? (
                  <Img src={preview} alt="New photo" fit="cover" style={{ width: 110, height: 110 }} fallback={<InitialAvatar name={user.username} size={110} />} />
                ) : (
                  <InitialAvatar name={user.username} imageURL={user.avatarURL} size={110} className="!border-0" />
                )}
              </span>
              <button type="button" aria-label="Change Photo" onClick={() => fileRef.current?.click()} disabled={!!avatarBan} className="disabled:opacity-50 absolute bottom-0 right-0 grid place-items-center size-[34px] rounded-full bg-violet text-white border-[3px] border-bg hover:brightness-110">
                <Camera size={14} />
              </button>
            </span>
            {avatarBan ? (
              <span role="alert" className="t-label-sm text-error text-center">{avatarBan}</span>
            ) : picked ? (
              <span className="flex items-center gap-1.5 text-gold t-label-sm text-center"><Clock size={10} />New photo will be reviewed before others see it</span>
            ) : user.avatarPending ? (
              <span className="flex items-center gap-1.5 text-gold t-label-sm"><Clock size={10} />Photo in review</span>
            ) : null}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!avatarBan} className="t-label-lg text-violet hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed">Change Photo</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
          </div>

          {/* Username */}
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="t-label-md text-muted px-1">Username</label>
            <div className={clsx("field !rounded-xl", usernameError && "!border-error")}>
              <span className="t-body-lg text-muted">@</span>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" maxLength={30} />
            </div>
            {usernameError ? (
              <span className="t-label-sm text-error px-1">{usernameError}</span>
            ) : (
              <span className="t-label-sm text-muted px-1">3–20 characters. Letters, numbers, and underscores. You can change this once every 30 days.</span>
            )}
            {saveError ? <span className="t-label-sm text-error px-1 pt-1">{saveError}</span> : null}
          </div>

          <PremiumStyleSection user={user} previewUser={previewUser} style={style} onChange={setStyleDraft} />
        </div>
      </form>
    </Page>
  );
}

// ── Premium style ─────────────────────────────────────────────────────────
/** Local mirror first, then PATCH; a 422 (field not stored yet) is silent —
 *  the mirror carries the choice until the server comes back with it. */
async function saveStyle(user: InsightUser, next: PremiumStylePiece[], setUser: (u: InsightUser) => void) {
  writeStyleMirror(user.id, next);
  try {
    const updated = await api.patch<Json>(endpoints.updateProfile, { premiumStyle: next });
    const stored = updated && typeof updated === "object" && updated.id != null ? normalizeUser(updated) : null;
    if (stored && sameStyle(stored.premiumStyle, next)) {
      clearStyleMirror(user.id);
      setUser({ ...stored, email: stored.email || user.email });
    }
  } catch { /* fails silently */ }
}

function PremiumStyleSection({ user, previewUser, style, onChange }: { user: InsightUser; previewUser: FlairUser; style: PremiumStylePiece[]; onChange: (s: PremiumStylePiece[]) => void }) {
  const place = usePodiumPlace(user.id);
  const metal: Metal | null = place ? METALS[place - 1] : null;
  const has = (p: PremiumStylePiece) => style.includes(p);
  const set = (p: PremiumStylePiece, on: boolean) => onChange(canonicalStyle(on ? [...style, p] : style.filter((x) => x !== p)));
  return (
    <section id="premium-style" className="flex flex-col gap-2 scroll-mt-20">
      <span className="t-label-md text-muted px-1">Premium style</span>
      {user.isPremium && place ? <span className="t-label-sm text-gold px-1 -mt-1">You&apos;re #{place} this month. Wear your rank.</span> : null}

      {/* Live preview: 52pt avatar, moving ring; 17pt bold name, moving shine + diamond. */}
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-card border border-border-subtle min-w-0">
        <FlairAvatar user={previewUser} isMe={false} size={52} moving pad />
        <FlairName user={previewUser} isMe={false} moving className="text-[17px] font-bold" nameClassName="text-primary" />
      </div>

      {user.isPremium ? (
        <>
          <div className="ledger">
            <SettingsToggleRow title="Aura ring" subtitle="A ring of light around your photo" checked={has("ring")} onChange={(v) => set("ring", v)} />
            {metal ? (
              <ColorRow title="Ring color" disabled={!has("ring")}>
                <ColorChip label="Violet" selected={!has("metal")} onClick={() => set("metal", false)} swatch={<RingSwatch />} />
                <ColorChip label={METAL_LABEL[metal]} selected={has("metal")} onClick={() => set("metal", true)} swatch={<RingSwatch metal={metal} />} />
              </ColorRow>
            ) : null}
            <div className="hairline-t" />
            <SettingsToggleRow title="Name shine" subtitle="Your name in violet, catching the light" checked={has("shine")} onChange={(v) => set("shine", v)} />
            {metal ? (
              <ColorRow title="Shine color" disabled={!has("shine")}>
                <ColorChip label="Violet" selected={!has("shine_metal")} onClick={() => set("shine_metal", false)} swatch={<ShineSwatch />} />
                <ColorChip label={METAL_LABEL[metal]} selected={has("shine_metal")} onClick={() => set("shine_metal", true)} swatch={<ShineSwatch metal={metal} />} />
              </ColorRow>
            ) : null}
            <div className="hairline-t" />
            <SettingsToggleRow title="Diamond" subtitle="The Premium diamond after your name" checked={has("mark")} onChange={(v) => set("mark", v)} />
          </div>
          {!metal ? <span className="t-label-sm text-secondary px-1">Finish the month in the top 3 to wear gold, silver or bronze on your ring and name.</span> : null}
          <span className="t-label-sm text-muted px-1">Mix any of them, or turn them all off. Everyone sees this on your profile, the leaderboard, comments and chat.</span>
        </>
      ) : (
        <div className="flex flex-col items-start gap-2 px-1">
          <span className="t-body-sm text-secondary">Members choose how they stand out.</span>
          <Link href="/premium/upgrade" className="flex items-center gap-1 t-label-lg text-violet hover:underline">Get Premium<ChevronRight size={14} /></Link>
        </div>
      )}
    </section>
  );
}

function ColorRow({ title, disabled, children }: { title: string; disabled?: boolean; children: ReactNode }) {
  return (
    <div className={clsx("flex items-center gap-2 px-4 pb-3 -mt-0.5", disabled && "opacity-40 pointer-events-none")} aria-disabled={disabled || undefined}>
      <span className="t-label-md text-secondary flex-1">{title}</span>
      {children}
    </div>
  );
}

function ColorChip({ label, selected, onClick, swatch }: { label: string; selected: boolean; onClick: () => void; swatch: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={clsx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border t-label-md transition-colors", selected ? "border-violet bg-violet/15 text-primary" : "border-hairline bg-card text-secondary hover:text-primary")}>
      {swatch}
      {label}
    </button>
  );
}
