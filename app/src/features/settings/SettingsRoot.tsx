// SettingsRoot — SettingsView.swift. Every row the app shows, minus the
// iOS-only ones (push permission, App Store version, restore purchases).
// Email / password changes open as sheets (?panel=email|password) so the
// URL stays shareable; the rest are their own routes under /settings/*.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserCircle, Mail, Lock, Hand, Gamepad2, Bell, Eye, Users, CircleHelp, FileText, ShieldCheck, LayoutGrid } from "lucide-react";
import { api, endpoints, errorMessage, ApiError } from "@/lib/api";
import { normalizeUser, type Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { AssetIcon, ConfirmDialog, FilterSegment, Sheet, Toast } from "@/components/ui";
import { SettingsFrame, SettingsSection, SettingsRow, SettingsLinkRow, SettingsToggleRow } from "./components";
import { ChangeEmailForm } from "./ChangeEmail";
import { ChangePasswordForm } from "./ChangePassword";
import { resetFollows } from "@/features/profile/follow-store";

type MessagePrivacy = "everyone" | "following";
const PRIVACY_OPTIONS: { label: string; value: MessagePrivacy }[] = [
  { label: "Everyone", value: "everyone" },
  { label: "People I follow", value: "following" },
];

const LAST_EMAIL_KEY = "insight.lastKnownEmail";
function readLastEmail(): string | null { try { return localStorage.getItem(LAST_EMAIL_KEY); } catch { return null; } }
function writeLastEmail(v: string) { try { localStorage.setItem(LAST_EMAIL_KEY, v); } catch { /* private window */ } }

interface PaymentStatus { isPremium: boolean; status: string | null; currentPeriodEnd: string | null; provider: string | null; autoRenew: boolean | null; graceUntil: string | null; cancelledAt: string | null }
function renewalLine(s: PaymentStatus | null): string | null {
  if (!s || !s.isPremium) return null;
  const f = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (s.graceUntil && s.status === "past_due") return `Billing retry until ${f(s.graceUntil)}`;
  if (!s.currentPeriodEnd) return null;
  return (s.autoRenew ?? true) && !s.cancelledAt ? `Renews ${f(s.currentPeriodEnd)}` : `Ends ${f(s.currentPeriodEnd)}`;
}

export function SettingsRoot() {
  const router = useRouter();
  const params = useSearchParams();
  const panel = params.get("panel");
  const { user, isPremium, setUser, refreshUser, logout } = useAppState();

  const [emailChangeConfirmed, setEmailChangeConfirmed] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(true);
  const [showFollowing, setShowFollowing] = useState(true);
  const [privacy, setPrivacy] = useState<MessagePrivacy>("everyone");
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirm, setConfirm] = useState<"logout" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<"info" | "error" | "success">("info");
  const say = useCallback((m: string, k: "info" | "error" | "success" = "info") => { setToast(m); setToastKind(k); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  // Profile + email always refresh from the server on appear (SettingsViewModel.loadSettings).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = normalizeUser(await api.get<Json>(endpoints.userProfile));
        if (cancelled) return;
        setUser(me);
        const last = readLastEmail();
        if (last && last.toLowerCase() !== me.email.toLowerCase()) setEmailChangeConfirmed(me.email);
        writeLastEmail(me.email);
      } catch { /* keep the cached user */ }
      try {
        const s = await api.get<Json>(endpoints.dmSettings);
        const raw = String(s?.dm_privacy ?? s?.who_can_message ?? s?.whoCanMessage ?? s?.message_privacy ?? s?.privacy ?? "everyone");
        if (!cancelled) setPrivacy(raw.toLowerCase().includes("follow") ? "following" : "everyone");
      } catch { /* default */ }
      try {
        const p = await api.get<Json>(endpoints.paymentsStatus);
        if (!cancelled && p) setPayment({
          isPremium: !!p.isPremium, status: p.status ?? null, currentPeriodEnd: p.currentPeriodEnd ?? null, provider: p.provider ?? null,
          autoRenew: typeof p.autoRenew === "boolean" ? p.autoRenew : null, graceUntil: p.graceUntil ?? null, cancelledAt: p.cancelledAt ?? null,
        });
      } catch { /* optional */ }
    })();
    return () => { cancelled = true; };
  }, [setUser]);

  async function updatePrivacy(p: MessagePrivacy) {
    setPrivacy(p);
    try { await api.put(endpoints.dmSettings, { dm_privacy: p, who_can_message: p }); } catch { /* the next load restores the truth */ }
  }

  async function managePremium() {
    if (!isPremium) { router.push("/premium/upgrade"); return; }
    setPortalBusy(true);
    try {
      const r = await api.post<{ url?: string; portalUrl?: string }>(endpoints.paymentsPortal, {});
      const url = r?.url ?? r?.portalUrl;
      if (url) window.open(url, "_blank", "noopener");
      else say("Insight Premium · Manage or cancel anytime in your App Store settings.");
    } catch (e) {
      if (e instanceof ApiError && e.isNotFound) say("Insight Premium · Manage or cancel anytime in your App Store settings.");
      else say(errorMessage(e), "error");
    } finally {
      setPortalBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      // Call the server FIRST so a failure doesn't strand a live account.
      await api.delete(endpoints.deleteAccount);
      resetFollows();
      await logout();
    } catch (e) {
      say(errorMessage(e), "error");
      setDeleting(false);
    }
  }

  const closePanel = () => router.replace("/settings");
  const premiumTitle = isPremium ? "Manage Subscription" : "Insight Premium";

  return (
    <SettingsFrame title="Settings">
      <div className="flex flex-col gap-6">
        {emailChangeConfirmed ? (
          <div className="flex items-start gap-2.5 px-1">
            <span className="flex flex-col gap-0.5 flex-1">
              <span className="t-label-lg text-primary">Email updated</span>
              <span className="t-label-sm text-secondary">Your email is now {emailChangeConfirmed}. Use it next time you log in.</span>
            </span>
            <button type="button" onClick={() => setEmailChangeConfirmed(null)} className="t-label-sm text-violet">Dismiss</button>
          </div>
        ) : null}

        <SettingsSection title="Account">
          <SettingsRow icon={<UserCircle />} title="Edit Profile" tint="text-violet" href="/profile/edit" />
          <SettingsRow icon={<Mail />} title="Change Email" subtitle={user?.email} href="/settings?panel=email" />
          <SettingsRow icon={<Lock />} title="Change Password" href="/settings?panel=password" />
          <SettingsRow icon={<Hand />} title="Blocked Users" href="/settings/blocked" />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <SettingsRow icon={<Gamepad2 />} title="Favorite Games" tint="text-violet" href="/settings/games" />
          <SettingsRow icon={<AssetIcon name="premium" height={18} />} title={portalBusy ? "Opening…" : premiumTitle} subtitle={renewalLine(payment)} tint="text-gold" onClick={() => void managePremium()} />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsRow icon={<Bell />} title="Notifications" tint="text-violet" href="/settings/notifications" />
          <div className="px-4 py-3 t-label-sm text-muted">Push notifications arrive on your phone. On the web, everything shows up in the Notifications inbox.</div>
        </SettingsSection>

        <SettingsSection title="Privacy">
          <SettingsToggleRow icon={<Eye />} title="Show Activity" subtitle="Let others see your recent activity" checked={showActivity} onChange={setShowActivity} />
          <SettingsToggleRow icon={<Users />} title="Show Following List" subtitle="Let others see who you follow" checked={showFollowing} onChange={setShowFollowing} />
        </SettingsSection>

        <SettingsSection title="Messages">
          <div className="flex flex-col gap-2.5 px-3 py-3">
            <div className="flex items-center gap-2.5">
              <AssetIcon name="messages" height={16} />
              <span className="flex flex-col gap-0.5">
                <span className="t-body-md text-primary">Who can message me</span>
                <span className="t-label-sm text-muted">People you follow can always reach you</span>
              </span>
            </div>
            <FilterSegment options={PRIVACY_OPTIONS} value={privacy} onChange={(v) => void updatePrivacy(v)} />
          </div>
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsLinkRow icon={<CircleHelp />} title="Support" href="https://insightesportsapp.com/support" />
          <SettingsLinkRow icon={<FileText />} title="Terms of Service" href="https://insightesportsapp.com/terms" />
          <SettingsLinkRow icon={<ShieldCheck />} title="Privacy Policy" href="https://insightesportsapp.com/privacy" />
        </SettingsSection>

        <SettingsSection title="Developer">
          <SettingsRow icon={<LayoutGrid />} title="Icon Gallery" href="/settings/icons" />
        </SettingsSection>

        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setConfirm("logout")} className="w-full py-3.5 rounded-xl bg-card border border-border-subtle t-label-lg text-primary hover:bg-surface/60 transition-colors">Log Out</button>
          <button type="button" onClick={() => setConfirm("delete")} className="w-full py-3.5 rounded-xl bg-card border border-error/40 t-label-lg text-error hover:bg-surface/60 transition-colors">Delete Account</button>
        </div>
        <span className="t-label-sm text-muted text-center pb-2">Insight Esports · web</span>
      </div>

      <Sheet open={panel === "email"} onClose={closePanel} title="Change Email">
        {user ? <ChangeEmailForm currentEmail={user.email} onDone={async () => { closePanel(); const me = await refreshUser(); if (me) { setEmailChangeConfirmed(me.email); writeLastEmail(me.email); } }} /> : null}
      </Sheet>
      <Sheet open={panel === "password"} onClose={closePanel} title="Change Password">
        <ChangePasswordForm onDone={() => { closePanel(); say("Password updated.", "success"); }} />
      </Sheet>

      <ConfirmDialog open={confirm === "logout"} title="Log Out?" message="You'll need to sign in again to access your account." confirmTitle="Log Out" destructive onConfirm={() => { setConfirm(null); resetFollows(); void logout(); }} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === "delete"} title="Delete Account?" message="This permanently deletes your account, predictions, points, and follows. This can't be undone." confirmTitle={deleting ? "Deleting…" : "Delete"} destructive onConfirm={() => { setConfirm(null); void deleteAccount(); }} onCancel={() => setConfirm(null)} />
      <Toast message={toast} kind={toastKind} />
    </SettingsFrame>
  );
}
