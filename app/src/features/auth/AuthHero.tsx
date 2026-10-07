// AuthHero — the shared header of the reset / verify screens: the violet
// gradient circle with its SF glyph, a brand-gradient title and a muted
// line underneath. Plus the small status lines and the gradient button.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { clsx } from "@/lib/format";
import { Spinner } from "@/components/ui";

export function AuthBackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="w-full max-w-sm flex">
      <Link href={href} className="flex items-center gap-1 t-label-md text-muted hover:text-primary"><ChevronLeft size={14} />{label}</Link>
    </div>
  );
}

export function AuthHero({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="grid place-items-center size-[72px] rounded-full text-white [&>svg]:size-7" style={{ background: "linear-gradient(135deg, var(--violet), var(--violet-light))" }}>{icon}</span>
      <span className="t-headline-md text-brand-gradient">{title}</span>
      <span className="t-body-md text-muted">{subtitle}</span>
      {children}
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="flex items-center gap-2 px-1 text-error"><AlertCircle size={16} className="shrink-0" /><span className="t-body-sm">{message}</span></div>;
}
export function AuthInfo({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="flex items-center gap-2 px-1"><CheckCircle2 size={16} className="shrink-0 text-violet-light" /><span className="t-body-sm text-muted">{message}</span></div>;
}

export function AuthButton({ loading, disabled, children, type = "submit", onClick }: { loading?: boolean; disabled?: boolean; children: ReactNode; type?: "submit" | "button"; onClick?: () => void }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={clsx("w-full py-4 rounded-xl bg-violet-gradient text-white t-label-lg transition-opacity grid place-items-center", (disabled || loading) && "opacity-50 cursor-not-allowed")}>
      {loading ? <Spinner size={18} className="border-white/40 border-t-white" /> : children}
    </button>
  );
}

/** Resend cooldown that mirrors the server's ~60s limit. */
export function useCooldown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return { seconds, start: (n = 60) => setSeconds(n) };
}
