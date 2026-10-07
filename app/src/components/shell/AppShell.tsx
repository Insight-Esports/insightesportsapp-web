// AppShell — MainTabView for the web.
//
// Phones: the iOS bottom tab bar (Live · Schedule · Players · Teams · News ·
// Premium). Desktop (≥ md): the same six destinations as a left sidebar,
// with the profile door at the bottom. The global profile side panel
// (ProfilePanelContent) is hosted here once, for every screen.
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";
import { Radio, CalendarDays, User, Users, Newspaper, Search, Bell, WifiOff, Wrench, RadioTower, ChevronRight, UserCircle, Trophy, Settings as SettingsIcon, X, Star } from "lucide-react";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { AssetIcon, BrandMark, InitialAvatar, SidePanel, Spinner, ToolButton } from "@/components/ui";

const TABS: { href: string; label: string; icon: ReactNode; match: (p: string) => boolean }[] = [
  { href: "/", label: "Live", icon: <Radio size={18} />, match: (p) => p === "/" || p.startsWith("/match") },
  { href: "/schedule", label: "Schedule", icon: <CalendarDays size={18} />, match: (p) => p.startsWith("/schedule") || p.startsWith("/results") },
  { href: "/players", label: "Players", icon: <User size={18} />, match: (p) => p.startsWith("/players") },
  { href: "/teams", label: "Teams", icon: <Users size={18} />, match: (p) => p.startsWith("/teams") },
  { href: "/news", label: "News", icon: <Newspaper size={18} />, match: (p) => p.startsWith("/news") },
  { href: "/premium", label: "Premium", icon: <PremiumGlyph />, match: (p) => p.startsWith("/premium") || p.startsWith("/predict") || p.startsWith("/weekly-report") },
];

/** Karlo's premium mark, template-tinted like every other tab icon. */
function PremiumGlyph() {
  return (
    <span
      aria-hidden
      className="inline-block size-5 bg-current"
      style={{ WebkitMaskImage: "url(/icons/premium.png)", maskImage: "url(/icons/premium.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isCheckingAuth, gate, connectionTrouble, status, profilePanelOpen, setProfilePanelOpen, unreadNotifications, unreadDMs, checkStatus } = useAppState();

  if (gate.kind === "maintenance") return <MaintenanceView message={gate.message} onRetry={checkStatus} />;
  if (gate.kind === "unreachable") return <MaintenanceView unreachable onRetry={checkStatus} />;
  if (isCheckingAuth && !user) return <Splash />;

  const banner = typeof status?.banner === "string" ? status.banner : status?.banner?.message ?? null;

  return (
    <div className="min-h-dvh flex">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 bg-card border-r border-hairline z-30" style={{ width: "var(--sidebar-w)" }}>
        <Link href="/" className="flex items-center gap-3 px-4 h-16 hairline-b">
          <BrandMark size={32} />
          <span className="text-[20px] font-bold tracking-[-0.5px] text-brand-gradient">Insight</span>
        </Link>
        <nav className="flex flex-col gap-0.5 p-2 pt-3">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link key={t.href} href={t.href} className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg t-label-lg transition-colors", active ? "text-violet bg-violet/10" : "text-secondary hover:text-primary hover:bg-surface/60")}>
                <span className="w-5 grid place-items-center">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
          <div className="my-2 hairline-b" />
          <Link href="/search" className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg t-label-lg transition-colors", pathname.startsWith("/search") ? "text-violet bg-violet/10" : "text-secondary hover:text-primary hover:bg-surface/60")}>
            <span className="w-5 grid place-items-center"><Search size={18} /></span>Search
          </Link>
          <Link href="/notifications" className={clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg t-label-lg transition-colors", pathname.startsWith("/notifications") ? "text-violet bg-violet/10" : "text-secondary hover:text-primary hover:bg-surface/60")}>
            <span className="w-5 grid place-items-center"><Bell size={18} /></span>Notifications
            {unreadNotifications > 0 ? <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-violet text-white text-[11px] font-bold grid place-items-center">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}
          </Link>
        </nav>
        <div className="flex-1" />
        {user ? (
          <button type="button" onClick={() => setProfilePanelOpen(true)} className="flex items-center gap-3 px-4 py-3 hairline-t hover:bg-surface/60 text-left">
            <InitialAvatar name={user.username} imageURL={user.avatarURL} size={32} />
            <span className="flex flex-col min-w-0">
              <span className="t-label-lg text-primary truncate">{user.username}</span>
              <span className="t-label-sm text-muted truncate">{user.isPremium ? "Insight Pro" : "Free"}</span>
            </span>
            {unreadDMs > 0 ? <span className="ml-auto size-2 rounded-full bg-violet" /> : null}
          </button>
        ) : null}
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0 md:pl-[var(--sidebar-w)] flex flex-col">
        {connectionTrouble ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-card hairline-b">
            <WifiOff size={16} className="text-muted" />
            <span className="t-label-md text-primary">Connection trouble — retrying</span>
            <span className="flex-1" />
            <Spinner size={14} className="border-muted/40 border-t-muted" />
          </div>
        ) : null}
        {banner ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-card hairline-b">
            <span className="size-1.5 rounded-full bg-violet" />
            <span className="t-label-md text-primary">{banner}</span>
          </div>
        ) : null}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* ── Bottom tab bar (phones) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-hairline pt-2 pb-[max(2px,env(safe-area-inset-bottom))]" style={{ minHeight: "var(--tabbar-h)" }}>
        <div className="flex items-start">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link key={t.href} href={t.href} className={clsx("flex-1 flex flex-col items-center gap-1 pb-1", active ? "text-violet" : "text-muted")}>
                <span className="h-6 grid place-items-center">{t.icon}</span>
                <span className="text-[10px] font-medium leading-none">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ProfilePanel open={profilePanelOpen} onClose={() => setProfilePanelOpen(false)} />
    </div>
  );
}

/** The profile door in every tab's toolbar (ProfileToolbarButton). */
export function ProfileToolbarButton() {
  const { user, setProfilePanelOpen, unreadDMs } = useAppState();
  return (
    <ToolButton label="Profile" onClick={() => setProfilePanelOpen(true)} badge={unreadDMs || undefined}>
      {user ? <InitialAvatar name={user.username} imageURL={user.avatarURL} size={26} /> : <UserCircle size={22} className="text-secondary" />}
    </ToolButton>
  );
}

/** Tools every tab header carries on phones: search · notifications · profile. */
export function HeaderTools({ extra }: { extra?: ReactNode }) {
  const router = useRouter();
  const { unreadNotifications } = useAppState();
  return (
    <>
      {extra}
      <ToolButton label="Search" onClick={() => router.push("/search")} className="md:hidden"><Search size={18} /></ToolButton>
      <ToolButton label="Notifications" onClick={() => router.push("/notifications")} badge={unreadNotifications || undefined} className="md:hidden"><Bell size={18} /></ToolButton>
      <ProfileToolbarButton />
    </>
  );
}

function PanelRow({ icon, title, onClick, badge, tint }: { icon: ReactNode; title: string; onClick: () => void; badge?: number; tint?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 px-3 py-[13px] rounded-[10px] hover:bg-surface/60 text-left w-full">
      <span className={clsx("w-5 grid place-items-center", tint ?? "text-secondary")}>{icon}</span>
      <span className="t-body-md text-primary">{title}</span>
      <span className="flex-1" />
      {badge ? <span className="px-[7px] py-[2px] rounded-full bg-violet text-white text-[11px] font-bold">{badge > 99 ? "99+" : badge}</span> : null}
      <ChevronRight size={14} className="text-muted" />
    </button>
  );
}

function ProfilePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, isPremium, unreadDMs } = useAppState();
  const go = (href: string) => { onClose(); router.push(href); };
  const Row = PanelRow;
  return (
    <SidePanel open={open} onClose={onClose}>
      <div className="flex justify-end pt-3 pr-2">
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-muted hover:text-primary"><X size={16} /></button>
      </div>
      {user ? (
        <div className="flex flex-col gap-3 px-3.5 pb-4">
          <span className={clsx("inline-grid place-items-center rounded-full", isPremium && "size-[60px] border-2 border-violet")}>
            <InitialAvatar name={user.username} imageURL={user.avatarURL} size={50} />
          </span>
          <div className="flex flex-col gap-[3px]">
            <span className="flex items-center gap-[5px]">
              <span className="text-[16px] font-bold text-primary truncate">{user.username}</span>
              {isPremium ? <span className="text-[9px] font-bold tracking-[0.5px] text-gold">PRO</span> : null}
            </span>
            <span className="flex items-center gap-1 t-label-sm text-violet"><Star size={11} className="fill-violet" />{user.tokenBalance.toLocaleString()} pts</span>
          </div>
        </div>
      ) : null}
      <div className="hairline-b" />
      <div className="flex flex-col gap-1 px-2.5 pt-2">
        <Row icon={<UserCircle size={16} />} title="Profile" onClick={() => go("/profile")} />
        <Row icon={<AssetIcon name="messages" height={18} />} title="Messages" badge={unreadDMs} onClick={() => go("/messages")} />
        <Row icon={<Trophy size={16} />} title="Leaderboard" tint="text-gold" onClick={() => go("/leaderboard")} />
        <Row icon={<SettingsIcon size={16} />} title="Settings" onClick={() => go("/settings")} />
        {!isPremium ? (
          <>
            <div className="my-2 mx-1.5 hairline-b" />
            <Row icon={<AssetIcon name="premium" height={18} />} title="Upgrade to Pro" onClick={() => go("/premium/upgrade")} />
          </>
        ) : null}
      </div>
    </SidePanel>
  );
}

export function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4 animate-[fadein_.5s_ease-out]">
        <BrandMark size={80} />
        <span className="t-headline-lg text-brand-gradient">Insight</span>
      </div>
      <style>{`@keyframes fadein{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

export function MaintenanceView({ message, unreachable, onRetry }: { message?: string | null; unreachable?: boolean; onRetry: () => void }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg px-6">
      <div className="flex flex-col items-center gap-[18px] text-center max-w-sm">
        {unreachable ? <RadioTower size={34} className="text-violet" /> : <Wrench size={34} className="text-violet" />}
        <div className="flex flex-col gap-2">
          <span className="text-[22px] font-bold tracking-[-0.4px] text-primary">{unreachable ? "Can't reach Insight right now" : "Insight is under maintenance"}</span>
          <span className="t-body-sm text-muted">{message ?? (unreachable ? "Our servers aren't answering. We'll keep trying and reconnect the moment they're back." : "We're making improvements. The app will reconnect automatically as soon as we're back.")}</span>
        </div>
        <button type="button" onClick={onRetry} className="btn-ghost">Try again</button>
      </div>
    </div>
  );
}
