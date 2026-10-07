// ForgotPassword — ForgotPasswordView.swift + ResetPasswordView.swift as one
// page with three steps:
//   1. email        → POST /auth/forgot-password   { email }
//   2. 6-digit code → POST /auth/verify-reset-code { email, token } → recovery session
//   3. new password → POST /auth/set-new-password  { resetToken, refreshToken, newPassword }
// No session required: these paths are in the proxy's PUBLIC_PATHS.
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Mail, Hash, Lock, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { api, endpoints, ApiError } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthBackLink, AuthButton, AuthError, AuthHero, AuthInfo, useCooldown } from "./AuthHero";

type Step = "enterEmail" | "enterCode" | "newPassword" | "done";

export function ForgotPassword() {
  const [step, setStep] = useState<Step>("enterEmail");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [session, setSession] = useState<{ resetToken: string; refreshToken: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cooldown = useCooldown();

  // Step 1 / Resend — request a reset code for the email.
  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !trimmed.includes(".")) { setError("Please enter a valid email address."); return; }
    if (loading) return;
    setLoading(true); setError(null); setInfo(null);
    try {
      await api.post(endpoints.forgotPassword, { email: trimmed });
      setEmail(trimmed);
      // Backend returns 200 whether or not the email exists — never reveal
      // account existence; just move to code entry.
      if (step === "enterEmail") { setStep("enterCode"); setInfo("If that email has an account, a code is on its way."); }
      else { cooldown.start(60); setInfo("We sent a new code to your email."); }
    } catch (err) {
      if (err instanceof ApiError && err.isRateLimited) { cooldown.start(60); setError("Too many attempts. Please wait a moment."); }
      else setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  // Step 2 — verify the code. On success, move to the new-password step.
  async function verifyCode(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) { setError("Enter the 6-digit code."); return; }
    if (loading) return;
    setLoading(true); setError(null); setInfo(null);
    try {
      const s = await api.post<{ resetToken?: string; refreshToken?: string }>(endpoints.verifyResetCode, { email, token: trimmed });
      if (!s?.resetToken) throw new Error("bad session");
      setSession({ resetToken: s.resetToken, refreshToken: s.refreshToken ?? "" });
      setStep("newPassword");
    } catch (err) {
      if (err instanceof ApiError && err.isRateLimited) setError("Too many attempts. Please wait a moment.");
      else setError("That code is incorrect or expired. Request a new one and try again.");
    } finally { setLoading(false); }
  }
  // Auto-submit when the code is complete.
  useEffect(() => { if (step === "enterCode" && code.length === 6 && !loading) void verifyCode(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);

  // Step 3 — set the new password with the recovery session.
  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword.length > 128) { setError("Password is too long."); return; }
    if (!/[A-Z]/.test(newPassword)) { setError("Password must contain at least one uppercase letter."); return; }
    if (!/\d/.test(newPassword)) { setError("Password must contain at least one number."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (loading) return;
    setLoading(true); setError(null);
    try {
      await api.post(endpoints.setNewPassword, { resetToken: session.resetToken, refreshToken: session.refreshToken, newPassword });
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) setError("Your reset session expired. Please request a new code.");
      else if (err instanceof ApiError && err.isRateLimited) setError("Too many attempts. Please wait a moment.");
      else setError("Couldn't reset your password. Please try again.");
    } finally { setLoading(false); }
  }

  const isFormValid = newPassword !== "" && confirmPassword !== "";

  return (
    <div className="min-h-dvh flex flex-col items-center gap-7 px-6 pt-4 pb-10">
      <AuthBackLink href="/login" label="Back to login" />

      {step === "enterEmail" ? (
        <>
          <AuthHero icon={<LockKeyhole />} title="Reset your password" subtitle="Enter your email and we'll send you a reset code." />
          <form onSubmit={requestCode} className="w-full max-w-sm flex flex-col gap-4">
            <Field type="email" placeholder="Email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" autoFocus />
            <AuthError message={error} />
            {!error ? <AuthInfo message={info} /> : null}
            <AuthButton loading={loading} disabled={email.trim() === ""}>Send Reset Code</AuthButton>
          </form>
        </>
      ) : step === "enterCode" ? (
        <>
          <AuthHero icon={<MailCheck />} title="Check your email" subtitle="We sent a 6-digit code to">
            <span className="t-body-md text-white">{email}</span>
          </AuthHero>
          <form onSubmit={verifyCode} className="w-full max-w-sm flex flex-col gap-4">
            <Field inputMode="numeric" placeholder="6-digit code" icon={<Hash />} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }} autoComplete="one-time-code" autoFocus />
            <AuthError message={error} />
            {!error ? <AuthInfo message={info} /> : null}
            <AuthButton loading={loading} disabled={code.length !== 6}>Verify Code</AuthButton>
            <button type="button" onClick={() => void requestCode()} disabled={cooldown.seconds > 0 || loading} className={`t-label-md pt-1 ${cooldown.seconds > 0 ? "text-muted" : "text-violet hover:underline"}`}>
              {cooldown.seconds > 0 ? `Resend code in ${cooldown.seconds}s` : "Resend code"}
            </button>
          </form>
        </>
      ) : step === "newPassword" ? (
        <>
          <AuthHero icon={<Lock />} title="Set a new password" subtitle="Choose a new password for your account." />
          <form onSubmit={resetPassword} className="w-full max-w-sm flex flex-col gap-4">
            <Field type="password" placeholder="New password" icon={<Lock />} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" autoFocus />
            <Field type="password" placeholder="Confirm new password" icon={<Lock />} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            <AuthError message={error} />
            <AuthButton loading={loading} disabled={!isFormValid}>Reset Password</AuthButton>
          </form>
        </>
      ) : (
        <>
          <AuthHero icon={<ShieldCheck />} title="Password reset" subtitle="You can now log in with your new password." />
          <div className="w-full max-w-sm">
            <Link href="/login" className="block w-full py-4 rounded-xl bg-violet-gradient text-white t-label-lg text-center">Back to Log In</Link>
          </div>
        </>
      )}
    </div>
  );
}
