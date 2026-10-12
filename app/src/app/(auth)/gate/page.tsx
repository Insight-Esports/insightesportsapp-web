// /gate — the team-access door in front of the app's own login.
//
// Step 1 of signing in on the web: a Google account on the team domain.
// Step 2 (after this): the regular Insight login with an app account.
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/ui";
import { withBase } from "@/lib/base-path";

const REASONS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  state: "That sign-in link expired. Please try again.",
  exchange: "Google didn't complete the sign-in. Please try again.",
  token: "Google's response couldn't be verified. Please try again.",
  unverified: "That Google account's email isn't verified.",
  domain: "Only Insight team Google accounts can use the web version right now.",
  required: "Sign in with your Insight team Google account to continue.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.8 38 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function Inner() {
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next") ?? "/";
  const message = error ? (REASONS[error] ?? "Sign-in failed. Please try again.") : null;
  const start = withBase(`/api/auth/google${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);

  return (
    <div className="min-h-dvh flex flex-col items-center px-6 pt-[60px] pb-10">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={80} />
        <span className="t-headline-lg text-brand-gradient">Insight</span>
        <span className="t-body-md text-muted">Live Esports Stats</span>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4 mt-8">
        <div className="flex items-center justify-center gap-2 t-label-md text-muted">
          <ShieldCheck size={15} className="text-violet" /> Team access
        </div>
        <p className="t-body-md text-secondary text-center">
          The web version is open to the Insight team only. Sign in with your team Google account first, then log in with your Insight account.
        </p>

        <a href={start} className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl bg-white text-[#1f1f1f] t-label-lg hover:bg-white/90 transition-colors">
          <GoogleMark /> Continue with Google
        </a>

        {message ? <p className="t-body-sm text-error text-center">{message}</p> : null}

        <p className="t-body-sm text-muted text-center mt-2">
          Not on the team yet? Insight is on the App Store.
        </p>
      </div>
    </div>
  );
}

export default function GatePage() {
  return <Suspense><Inner /></Suspense>;
}
