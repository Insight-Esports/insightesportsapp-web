// VerifyEmail — VerifyEmailView.swift (?email=). The 6-digit code goes to
// /api/auth/verify-otp, which stores the returned session in cookies so an
// unverified team account can finish and land signed in. Resend via
// POST /auth/resend { email } (a public path on the proxy).
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Hash, MailCheck } from "lucide-react";
import { api, endpoints, ApiError } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthBackLink, AuthButton, AuthError, AuthHero, AuthInfo, useCooldown } from "./AuthHero";

export function VerifyEmail({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cooldown = useCooldown();
  const isCodeComplete = code.length === 6;

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) { setError("Enter the 6-digit code."); return; }
    if (loading) return;
    setLoading(true); setError(null); setInfo(null);
    try {
      const r = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, token: trimmed }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(r.status === 429 ? "Too many attempts. Please wait a moment." : j?.code === "DOMAIN_NOT_ALLOWED" ? j.error : "That code is incorrect or expired. Double-check it or request a new one.");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Can't reach Insight right now. Try again in a moment.");
      setLoading(false);
    }
  }
  useEffect(() => { if (code.length === 6 && !loading) void verify(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code]);

  async function resend() {
    if (cooldown.seconds > 0 || resending) return;
    setResending(true); setError(null); setInfo(null);
    try {
      await api.post(endpoints.resendOtp, { email });
      cooldown.start(60);
      setInfo("We sent a new code to your email.");
    } catch (err) {
      if (err instanceof ApiError && err.isRateLimited) { cooldown.start(60); setError("Please wait before requesting another code."); }
      else setError("Couldn't resend the code. Please try again.");
    } finally { setResending(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center gap-7 px-6 pt-4 pb-10">
      <AuthBackLink href="/login" label="Back" />
      <AuthHero icon={<MailCheck />} title="Check your email" subtitle="We sent a 6-digit code to">
        <span className="t-body-md text-white">{email || "your email"}</span>
      </AuthHero>
      <form onSubmit={verify} className="w-full max-w-sm flex flex-col gap-4">
        <Field inputMode="numeric" placeholder="6-digit code" icon={<Hash />} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }} autoComplete="one-time-code" autoFocus />
        <AuthError message={error} />
        {!error ? <AuthInfo message={info} /> : null}
        <AuthButton loading={loading} disabled={!isCodeComplete}>Verify</AuthButton>
        <button type="button" onClick={() => void resend()} disabled={cooldown.seconds > 0 || resending} className={`t-label-md pt-1 ${cooldown.seconds > 0 ? "text-muted" : "text-violet hover:underline"}`}>
          {cooldown.seconds > 0 ? `Resend code in ${cooldown.seconds}s` : "Resend code"}
        </button>
      </form>
    </div>
  );
}
