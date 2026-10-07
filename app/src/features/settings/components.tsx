// features/settings/components — SettingsSection / rows / toggles from
// SettingsView.swift, plus SettingsFrame: on wide screens settings is a
// two-column layout (section nav on the left, the screen on the right); on
// phones it is the iOS stack with a back arrow.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ArrowUpRight, Settings as SettingsIcon, Bell, Gamepad2, Hand, LayoutGrid } from "lucide-react";
import { clsx } from "@/lib/format";
import { Page } from "@/components/ui";

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/settings", label: "Settings", icon: <SettingsIcon size={16} /> },
  { href: "/settings/notifications", label: "Notifications", icon: <Bell size={16} /> },
  { href: "/settings/games", label: "Favorite Games", icon: <Gamepad2 size={16} /> },
  { href: "/settings/blocked", label: "Blocked Users", icon: <Hand size={16} /> },
  { href: "/settings/icons", label: "Icon Gallery", icon: <LayoutGrid size={16} /> },
];

export function SettingsFrame({ title, trailing, children, backHref }: { title: string; trailing?: ReactNode; children: ReactNode; backHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = pathname === "/settings";
  return (
    <Page>
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:px-4">
        <nav className="hidden lg:flex flex-col gap-0.5 pt-4 self-start sticky top-4">
          {NAV.map((n) => {
            const active = n.href === "/settings" ? isRoot : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg t-label-lg transition-colors", active ? "text-violet bg-violet/10" : "text-secondary hover:text-primary hover:bg-surface/60")}>
                <span className="w-5 grid place-items-center">{n.icon}</span>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">
          <div className="flex items-center gap-2 px-4 lg:px-0 pt-3 pb-2 hairline-b">
            {!isRoot ? (
              <button type="button" onClick={() => (backHref ? router.push(backHref) : router.back())} aria-label="Back" className="lg:hidden grid place-items-center size-8 -ml-2 text-secondary hover:text-primary"><ChevronLeft size={20} /></button>
            ) : null}
            <span className="t-headline-sm text-primary flex-1">{title}</span>
            {trailing}
          </div>
          <div className="px-4 lg:px-0 pt-4 max-w-2xl">{children}</div>
        </div>
      </div>
    </Page>
  );
}

export function SettingsSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <span className="t-label-sm text-muted uppercase px-1">{title}</span>
      <div className="ledger ledger-stripe">{children}</div>
    </div>
  );
}

function RowBody({ icon, title, subtitle, tint = "text-secondary", trailing }: { icon: ReactNode; title: string; subtitle?: string | null; tint?: string; trailing?: ReactNode }) {
  return (
    <>
      <span className={clsx("w-6 grid place-items-center shrink-0 [&>svg]:size-[15px]", tint)}>{icon}</span>
      <span className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="t-body-md text-primary">{title}</span>
        {subtitle ? <span className="t-label-sm text-muted truncate">{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );
}

/** Tappable row with a chevron (SettingsRow / SettingsRowContent). */
export function SettingsRow({ icon, title, subtitle, tint, href, onClick }: { icon: ReactNode; title: string; subtitle?: string | null; tint?: string; href?: string; onClick?: () => void }) {
  const body = <RowBody icon={icon} title={title} subtitle={subtitle} tint={tint} trailing={<ChevronRight size={13} className="text-muted shrink-0" />} />;
  const cls = "flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-surface/60 transition-colors";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

/** External link row (SettingsLinkRow). */
export function SettingsLinkRow({ icon, title, href }: { icon: ReactNode; title: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-surface/60 transition-colors">
      <RowBody icon={icon} title={title} trailing={<ArrowUpRight size={12} className="text-muted shrink-0" />} />
    </a>
  );
}

/** The iOS Toggle: violet when on. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("relative inline-flex h-[26px] w-[44px] shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-violet" : "bg-surface border border-hairline")}
    >
      <span className={clsx("absolute top-[2px] size-[22px] rounded-full bg-white shadow transition-transform", checked ? "translate-x-[20px]" : "translate-x-[1px]", !checked && "top-[1px]")} />
    </button>
  );
}

export function SettingsToggleRow({ icon, title, subtitle, tint, checked, onChange, disabled }: { icon?: ReactNode; title: string; subtitle?: string | null; tint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
      {icon ? <span className={clsx("w-6 grid place-items-center shrink-0 [&>svg]:size-[15px]", tint ?? "text-secondary")}>{icon}</span> : null}
      <span className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="t-body-md text-primary">{title}</span>
        {subtitle ? <span className="t-label-sm text-muted">{subtitle}</span> : null}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </label>
  );
}

/** Labeled input used by the email / password forms (labeledField). */
export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-label-md text-muted">{label}</span>
      {children}
    </div>
  );
}

/** Full-width gradient primary (primaryButton in the email/password screens). */
export function WideButton({ children, disabled, loading, type = "button", onClick }: { children: ReactNode; disabled?: boolean; loading?: boolean; type?: "button" | "submit"; onClick?: () => void }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={clsx("w-full py-3.5 rounded-xl t-label-lg text-white transition-opacity", disabled ? "bg-surface" : "bg-violet-gradient", "disabled:cursor-not-allowed")}>
      {loading ? "…" : children}
    </button>
  );
}
