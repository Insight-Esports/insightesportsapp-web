// ChangeEmailForm — ChangeEmailView.swift. Multi-step, code-based:
//   1. New email + current password  → POST /users/me/email/change-start
//   2. (if required) code sent to the CURRENT email
//   3. Code sent to the NEW email     → POST /users/me/email/change-verify
"use client";

import { useState, type FormEvent } from "react";
import { api, endpoints, ApiError } from "@/lib/api";
import { Field } from "@/components/ui";
import { LabeledField, WideButton } from "./components";

type Step = "form" | "oldCode" | "newCode";

function isValidEmail(s: string) { return s.includes("@") && s.includes(".") && s.length >= 6; }

export function ChangeEmailForm({ currentEmail, onDone }: { currentEmail: string; onDone: () => void }) {
  const [step, setStep] = useState<Step>("form");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);

  const canSubmit = isValidEmail(newEmail.trim()) && password !== "";
  const codeReady = code.trim().length >= 6;

  function advance(remaining: string[]) {
    const next = remaining[0];
    if (next) setStep(next === "current" ? "oldCode" : "newCode");
    else onDone();
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    setError(null);
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) { setError("That's already your email."); return; }
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const r = await api.post<{ confirmationsRequired?: string[] }>(endpoints.changeEmailStart, { newEmail: trimmed, password });
      const list = Array.isArray(r?.confirmationsRequired) && r.confirmationsRequired.length ? r.confirmationsRequired : ["new"];
      setPending(list);
      advance(list);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Couldn't start the email change. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const target = pending[0];
    if (!target || !codeReady || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post(endpoints.changeEmailVerify, { target, code: code.trim() });
      const rest = pending.slice(1);
      setPending(rest);
      setCode("");
      advance(rest);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Couldn't verify the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() { setStep("form"); setCode(""); setError(null); setPending([]); }

  if (step === "form") {
    return (
      <form onSubmit={start} className="flex flex-col gap-5">
        <p className="t-body-sm text-muted">Your email is used to sign in and recover your account. We&apos;ll send a verification code to confirm the change.</p>
        <LabeledField label="Current Email"><Field value={currentEmail} disabled readOnly className="opacity-70" /></LabeledField>
        <LabeledField label="New Email"><Field type="email" placeholder="you@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoCapitalize="none" autoComplete="email" autoFocus /></LabeledField>
        <LabeledField label="Current Password"><Field type="password" placeholder="Enter your password to confirm" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></LabeledField>
        {error ? <span className="t-label-sm text-error">{error}</span> : null}
        <WideButton type="submit" disabled={!canSubmit} loading={submitting}>Continue</WideButton>
      </form>
    );
  }

  const isOld = step === "oldCode";
  return (
    <form onSubmit={verify} className="flex flex-col gap-5">
      <p className="t-body-sm text-muted">{isOld ? "To protect your account, first enter the code we sent to your current email." : "Enter the code we sent to your new email."}</p>
      <span className="t-label-lg text-primary">{isOld ? currentEmail : newEmail.trim()}</span>
      <LabeledField label="Verification Code"><Field inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" autoFocus /></LabeledField>
      {error ? <span className="t-label-sm text-error">{error}</span> : null}
      <WideButton type="submit" disabled={!codeReady} loading={submitting}>Verify</WideButton>
      <button type="button" onClick={reset} className="t-label-sm text-muted hover:text-primary text-center">Didn&apos;t get it? Start over</button>
    </form>
  );
}
