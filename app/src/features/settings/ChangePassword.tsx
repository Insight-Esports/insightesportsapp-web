// ChangePasswordForm — ChangePasswordView.swift. The server re-verifies the
// current password before setting the new one (PATCH /users/me/password).
"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { api, endpoints, ApiError } from "@/lib/api";
import { Field } from "@/components/ui";
import { clsx } from "@/lib/format";
import { LabeledField, WideButton } from "./components";

function Req({ text, met }: { text: string; met: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {met ? <CheckCircle2 size={11} className="text-success" /> : <Circle size={11} className="text-muted" />}
      <span className={clsx("t-label-sm", met ? "text-secondary" : "text-muted")}>{text}</span>
    </span>
  );
}

export function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const meetsLength = next.length >= 8;
  const passwordsMatch = next !== "" && next === confirm;
  const isDifferent = next !== "" && next !== current;
  const canSubmit = current !== "" && meetsLength && passwordsMatch && isDifferent;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!canSubmit) { setError("Please meet all requirements."); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.patch(endpoints.changePassword, { currentPassword: current, newPassword: next });
      setSuccess("Password updated.");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Couldn't update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="t-body-sm text-muted">Choose a strong password you don&apos;t use elsewhere. You&apos;ll stay signed in on this device.</p>
      <LabeledField label="Current Password"><Field type="password" placeholder="Enter current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus /></LabeledField>
      <LabeledField label="New Password"><Field type="password" placeholder="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></LabeledField>
      <LabeledField label="Confirm New Password"><Field type="password" placeholder="Re-enter new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></LabeledField>
      <div className="flex flex-col gap-1">
        <Req text="At least 8 characters" met={meetsLength} />
        <Req text="Passwords match" met={passwordsMatch} />
        <Req text="Different from current" met={isDifferent} />
      </div>
      {error ? <span className="t-label-sm text-error">{error}</span> : null}
      {success ? <span className="t-label-sm text-success">{success}</span> : null}
      <WideButton type="submit" disabled={!canSubmit} loading={submitting}>Update Password</WideButton>
    </form>
  );
}
