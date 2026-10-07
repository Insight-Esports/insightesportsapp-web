// EditProfile — EditProfileView.swift: username + avatar.
//
// Username: light pre-check here; the server is the authority (uniqueness,
// slur filter, 30-day cooldown → 409/422 with user-readable text).
// Avatar: picked file previews immediately; on save it goes through
// /api/avatar (Supabase upload + POST /users/me/avatar) and the user is
// re-fetched from GET /users/me, the authoritative source.
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock } from "lucide-react";
import { api, endpoints, errorMessage, ApiError } from "@/lib/api";
import { normalizeUser } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { Img, InitialAvatar, Page, Spinner } from "@/components/ui";

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
  const canSave = (trimmed !== originalUsername || picked !== null) && usernameError === null && trimmed.length >= 3;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (picked) {
        const fd = new FormData();
        fd.append("file", picked, picked.name || "avatar.jpg");
        const r = await fetch("/api/avatar", { method: "POST", body: fd, credentials: "same-origin" });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new ApiError(r.status, j?.message ?? j?.error ?? "Couldn't upload the image. Please try again.", j?.code ?? null);
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
      setSaveError(errorMessage(err, "Couldn't save changes."));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Page>
      <form onSubmit={save} className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 hairline-b">
          <button type="button" onClick={() => router.back()} className="t-label-lg text-secondary hover:text-primary">Cancel</button>
          <span className="t-headline-sm text-primary flex-1 text-center">Edit Profile</span>
          <button type="submit" disabled={!canSave || saving} className={clsx("t-label-lg min-w-12 text-right", canSave ? "text-violet" : "text-muted", "disabled:cursor-not-allowed")}>
            {saving ? <Spinner size={16} className="inline-block" /> : "Save"}
          </button>
        </div>

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
              <button type="button" aria-label="Change Photo" onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 grid place-items-center size-[34px] rounded-full bg-violet text-white border-[3px] border-bg hover:brightness-110">
                <Camera size={14} />
              </button>
            </span>
            {picked ? (
              <span className="flex items-center gap-1.5 text-gold t-label-sm text-center"><Clock size={10} />New photo will be reviewed before others see it</span>
            ) : user.avatarPending ? (
              <span className="flex items-center gap-1.5 text-gold t-label-sm"><Clock size={10} />Photo in review</span>
            ) : null}
            <button type="button" onClick={() => fileRef.current?.click()} className="t-label-lg text-violet hover:underline">Change Photo</button>
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
        </div>
      </form>
    </Page>
  );
}
