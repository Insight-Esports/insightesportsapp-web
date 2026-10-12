// /login — LoginView.swift (Log In tab only).
//
// The web is limited to @insightesportsapp.com accounts for now, so there's
// no Sign Up tab and no Sign in with Apple; team members log in with the
// account they already use in the app.
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { BrandMark, Field } from "@/components/ui";
import { withBase } from "@/lib/base-path";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const reason = params.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(reason === "expired" ? "Your session ended. Please log in again." : null);
  const valid = email.trim() !== "" && password !== "";
  // Step 1 (the Google team gate) — shown as a small verified line so it's
  // clear this login is the Insight account, not the Google one.
  const [gate, setGate] = useState<{ enabled: boolean; email: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(withBase("/api/auth/gate"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setGate({ enabled: !!j.enabled, email: j.email ?? null }); })
      .catch(() => { if (!cancelled) setGate({ enabled: false, email: null }); });
    return () => { cancelled = true; };
  }, []);
  async function switchGoogle() {
    await fetch(withBase("/api/auth/gate"), { method: "DELETE" }).catch(() => {});
    window.location.assign(withBase("/gate"));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("No internet connection. Check your network and try again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(withBase("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error ?? (r.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Invalid email or password"));
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Can't reach Insight right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 pt-[60px] pb-10">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={80} />
        <span className="t-headline-lg text-brand-gradient">Insight</span>
        <span className="t-body-md text-muted">Live Esports Stats</span>
      </div>

      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-4 mt-8">
        {/* The app's Log In / Sign Up segment: with sign-up off on the web, a
            single selected segment is just noise — a plain title instead. */}
        <h1 className="t-headline-md text-primary text-center mb-1">Log In</h1>
        {gate?.enabled && gate.email ? (
          <div className="flex items-center justify-center gap-2 t-body-sm text-muted -mt-2">
            <ShieldCheck size={14} className="text-success" />
            <span>Team access verified as <span className="text-secondary">{gate.email}</span></span>
            <button type="button" onClick={switchGoogle} className="text-violet hover:underline">Not you?</button>
          </div>
        ) : null}

        <Field type="email" name="username" autoComplete="username" placeholder="Email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <Field type="password" name="password" autoComplete="current-password" placeholder="Password" icon={<Lock />} value={password} onChange={(e) => setPassword(e.target.value)} />

        {error ? (
          <div className="flex items-center gap-2 px-1 text-error">
            <AlertCircle size={16} className="shrink-0" />
            <span className="t-body-sm">{error}</span>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Link href="/forgot-password" className="t-label-md text-violet">Forgot password?</Link>
        </div>

        <button type="submit" disabled={!valid || loading} className="w-full py-4 rounded-xl bg-violet-gradient text-white t-label-lg disabled:opacity-50 transition-opacity">
          {loading ? "Logging in…" : "Log In"}
        </button>

        <p className="t-body-sm text-muted text-center mt-2">
          {gate?.enabled ? "Log in with the account you use in the Insight app." : "The web version is currently available to Insight team accounts only."}
        </p>
      </form>
    </div>
  );
}
