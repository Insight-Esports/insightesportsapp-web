// components/ui — the web port of Components.swift.
//
// One voice for every screen: the ledger container (hairline border, 12pt
// radius, striped rows), the TabHeaderTitle with its violet rule, the
// underline-tab FilterSegment/FilterChip selection (no pills), quiet
// skeletons in the content's own silhouette. Dark only.
"use client";

import { useEffect, useState, type ReactNode, type CSSProperties, type InputHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { AlertTriangle, Crown, WifiOff, X, Check, Search } from "lucide-react";
import { clsx, initials as toInitials } from "@/lib/format";
import { gamePillLabel, gameTint, GAMES, type GameId } from "@/lib/types";

// ── Tab header ────────────────────────────────────────────────────────────
/** Title + violet rule under the word (TabHeaderTitle). */
export function TabHeaderTitle({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("inline-flex flex-col items-start gap-1 pt-0.5", className)}>
      <span className="text-[22px] font-bold tracking-[-0.6px] text-primary leading-none whitespace-nowrap">{text}</span>
      <span className="violet-rule w-full" />
    </div>
  );
}

/** In-content tab bar: title + rule on the left, a tools cluster (equal 32pt
 *  boxes inside one hairline outline) on the right. */
export function TabHeader({ title, tools, className }: { title: string; tools?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3.5 px-4 pt-1.5 pb-2 bg-bg", className)}>
      <TabHeaderTitle text={title} />
      <div className="flex-1 min-w-2" />
      {tools ? (
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-hairline">{tools}</div>
      ) : null}
    </div>
  );
}

/** A 32×32 tool slot for the header cluster. */
export function ToolButton({ label, badge, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx("relative grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card transition-colors", className)} {...rest}>
      {children}
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-live text-white text-[10px] font-semibold grid place-items-center leading-none">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </button>
  );
}

// ── Selection: underline tabs (GameTabBar / FilterSegment / FilterChip) ───
export function FilterChip({ label, selected, onClick, live, className }: { label: string; selected: boolean; onClick: () => void; live?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={clsx("flex flex-col items-center gap-1.5 shrink-0", className)} aria-pressed={selected}>
      <span className={clsx("flex items-start gap-1 whitespace-nowrap leading-tight", selected ? "t-label-lg text-primary" : "t-body-md text-muted")}>
        {label}
        {live ? <span className="size-[5px] rounded-full bg-live mt-[3px]" /> : null}
      </span>
      <span className={clsx("violet-rule w-full", !selected && "opacity-0")} />
    </button>
  );
}

export function FilterSegment<T extends string | number>({ options, value, onChange, className, gap = "gap-[22px]" }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; className?: string; gap?: string }) {
  return (
    <div className={clsx("flex items-end", gap, className)}>
      {options.map((o) => (
        <FilterChip key={String(o.value)} label={o.label} selected={o.value === value} onClick={() => onChange(o.value)} />
      ))}
    </div>
  );
}

/** The per-tab game bar: All · VALORANT · CS2 · LoL with live dots. */
export function GameTabBar({ selected, onChange, games = GAMES, liveGames, className }: { selected: GameId; onChange: (g: GameId) => void; games?: { id: GameId; label: string }[]; liveGames?: Set<string>; className?: string }) {
  return (
    <div className={clsx("flex items-end gap-6 px-4 overflow-x-auto no-scrollbar", className)}>
      {games.map((g) => (
        <FilterChip key={g.id} label={g.label} selected={selected === g.id} onClick={() => onChange(g.id)} live={g.id !== "all" && !!liveGames?.has(g.id)} />
      ))}
    </div>
  );
}

/** A filter row: kicker on top, control beneath, hairline below. */
export function FilterRow({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2.5 py-3.5 hairline-b", className)}>
      <span className="t-kicker">{title}</span>
      {children}
    </div>
  );
}

/** Filter sheets: a kicker with a violet dot over a wrap of flat chips. */
export function FilterGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle", className)}>
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-violet" />
        <span className="t-kicker">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** Flat chip for filter sheets: solid violet when selected, card + hairline otherwise. */
export function FlatChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={clsx("px-3 py-1.5 rounded-lg t-label-md border transition-colors", selected ? "bg-violet border-violet text-white" : "bg-card border-hairline text-secondary hover:text-primary")}>
      {label}
    </button>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("t-kicker", className)}>{children}</span>;
}

// ── Ledger ────────────────────────────────────────────────────────────────
/** The app's one container. Children are rows; striping + hairlines are automatic. */
export function Ledger({ children, className, striped = true }: { children: ReactNode; className?: string; striped?: boolean }) {
  return <div className={clsx("ledger", striped && "ledger-stripe", className)}>{children}</div>;
}

export function LedgerRow({ children, className, onClick, href, style }: { children: ReactNode; className?: string; onClick?: () => void; href?: string; style?: CSSProperties }) {
  const cls = clsx("ledger-row", (onClick || href) && "hover:bg-surface/60 transition-colors cursor-pointer", className);
  if (href) return <a href={href} className={cls} style={style}>{children}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={clsx(cls, "w-full text-left")} style={style}>{children}</button>;
  return <div className={cls} style={style}>{children}</div>;
}

/** Column header row for stat tables: muted kicker cells. */
export function LedgerHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex items-center gap-2.5 px-3 py-2 bg-surface/40 hairline-b", className)}>{children}</div>;
}

// ── Badges & marks ────────────────────────────────────────────────────────
export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-[5px] text-live t-label-md", className)}>
      <span className="live-dot size-[7px] rounded-full bg-live" />
      Live
    </span>
  );
}

export function TeamBadge({ abbreviation, color = "var(--violet)", size = 36, className }: { abbreviation: string; color?: string; size?: number; className?: string }) {
  return (
    <span className={clsx("inline-grid place-items-center rounded-md text-white font-medium shrink-0", className)} style={{ width: size, height: size, background: color, opacity: 0.9, fontSize: Math.max(9, size * 0.3) }}>
      {abbreviation.slice(0, 3).toUpperCase()}
    </span>
  );
}

/** Image with a graceful fallback (CachedAsyncImage + placeholder). */
export function Img({ src, alt, fallback, className, style, fit = "contain" }: { src: string | null | undefined; alt: string; fallback: ReactNode; className?: string; style?: CSSProperties; fit?: "contain" | "cover" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={{ objectFit: fit, ...style }} loading="lazy" decoding="async" onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}

/** Team mark: the real logo when there is one, the colored abbreviation otherwise. */
export function TeamMark({ name, logoURL, color = "var(--violet)", size = 28, className }: { name: string; logoURL?: string | null; color?: string; size?: number; className?: string }) {
  const fallback = <TeamBadge abbreviation={name} color={color} size={size} />;
  return (
    <span className={clsx("inline-grid place-items-center shrink-0 overflow-hidden", className)} style={{ width: size, height: size, borderRadius: size * 0.2 }}>
      <Img src={logoURL} alt={name} fallback={fallback} style={{ width: size, height: size }} />
    </span>
  );
}

/** Colored short label for the game (GamePill): VAL / CS2 / LoL. */
export function GamePill({ game, className }: { game: string; className?: string }) {
  return <span className={clsx("font-rounded text-[10px] font-black", className)} style={{ color: gameTint(game) }}>{gamePillLabel(game)}</span>;
}

/** Finals/playoffs get a gold outline pill; routine stages stay muted text. */
export function StagePill({ stage, className }: { stage: string; className?: string }) {
  const s = stage.toLowerCase();
  const high = s.includes("final") || s.includes("playoff") || s.includes("semi");
  if (high) {
    return <span className={clsx("t-label-sm text-gold px-[7px] py-[3px] rounded bg-gold/15 border border-border-gold", className)}>{stage}</span>;
  }
  return <span className={clsx("t-label-sm text-muted", className)}>{stage}</span>;
}

export function TierBadge({ tier, className }: { tier: number; className?: string }) {
  const color = tier === 1 ? "text-gold" : tier === 2 ? "text-violet-light" : "text-muted";
  return <span className={clsx("t-label-sm", color, className)}>Tier {tier}</span>;
}

export function CrownBadge({ className }: { className?: string }) {
  return <Crown size={12} className={clsx("text-gold fill-gold", className)} />;
}

/** Quiet avatar: photo when there is one, surface-toned initials otherwise. */
export function InitialAvatar({ name, imageURL, size = 40, className }: { name: string; imageURL?: string | null; size?: number; className?: string }) {
  const fallback = (
    <span className="grid place-items-center w-full h-full bg-surface text-secondary font-semibold" style={{ fontSize: size * 0.32 }}>
      {toInitials(name)}
    </span>
  );
  return (
    <span className={clsx("inline-block shrink-0 rounded-full overflow-hidden border border-border-subtle", className)} style={{ width: size, height: size }}>
      <Img src={imageURL} alt={name} fallback={fallback} fit="cover" style={{ width: size, height: size }} />
    </span>
  );
}

/** The legacy violet→orange gradient avatar. */
export function GradientAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="inline-grid place-items-center rounded-full text-white t-label-lg shrink-0" style={{ width: size, height: size, background: "linear-gradient(135deg,#7c5cfc,#ff6b35)" }}>
      {toInitials(name)}
    </span>
  );
}

/** Custom-asset icons (Karlo's marks) with baked-in colors. */
export function AssetIcon({ name, height = 16, className }: { name: "baren" | "correct" | "dragon" | "inhibitor" | "messages" | "premium" | "premiumlocked" | "streakmilestone" | "tower2" | "weeklyreport" | "wrong" | "tournament"; height?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/icons/${name}.png`} alt="" aria-hidden className={clsx("inline-block object-contain", className)} style={{ height, width: "auto" }} />;
}

/** The app's logo mark (BrandMark). */
export function BrandMark({ size = 80, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logo-insight.png" alt="Insight" width={size} height={size} className={clsx("shrink-0", className)} style={{ width: size, height: size, borderRadius: size * 0.22 }} />;
}

// ── Stats & sections ──────────────────────────────────────────────────────
export function StatCard({ label, value, valueClassName, className }: { label: string; value: ReactNode; valueClassName?: string; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-1.5 p-3 rounded-[10px] bg-surface border border-border-subtle min-w-0", className)}>
      <span className="t-label-sm text-muted">{label}</span>
      <span className={clsx("t-mono-md text-primary truncate", valueClassName)}>{value}</span>
    </div>
  );
}

/** Section header with the violet left bar. */
export function SectionHeader({ title, trailing, className }: { title: string; trailing?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5 px-4", className)}>
      <span className="w-[3px] h-[18px] rounded-sm bg-violet" />
      <span className="t-headline-sm text-primary">{title}</span>
      <span className="flex-1" />
      {trailing}
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <span className={clsx("inline-block rounded-full border-2 border-violet/30 border-t-violet animate-spin", className)} style={{ width: size, height: size }} aria-label="Loading" />;
}

export function EmptyState({ icon, title, subtitle, actionTitle, onAction, className }: { icon?: ReactNode; title: string; subtitle?: string; actionTitle?: string; onAction?: () => void; className?: string }) {
  return (
    <div className={clsx("mx-4 flex flex-col items-center gap-3 p-8 rounded-xl bg-card border border-border-subtle text-center", className)}>
      {icon ? <span className="text-muted [&>svg]:size-10">{icon}</span> : null}
      <span className="t-headline-sm text-primary">{title}</span>
      {subtitle ? <span className="t-body-sm text-muted max-w-sm">{subtitle}</span> : null}
      {actionTitle && onAction ? (
        <button type="button" onClick={onAction} className="btn-pill mt-1">{actionTitle}</button>
      ) : null}
    </div>
  );
}

export function ErrorView({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-4 p-6 text-center", className)}>
      <AlertTriangle size={36} className="text-warning" />
      <span className="t-body-md text-secondary max-w-sm">{message}</span>
      {onRetry ? <button type="button" onClick={onRetry} className="btn-pill">Try Again</button> : null}
    </div>
  );
}

/** Full-screen connection-problem state with a retry. Quiet, honest. */
export function ConnectionErrorView({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3.5 py-16 text-center", className)}>
      <WifiOff size={40} className="text-muted" />
      <span className="t-headline-sm text-primary">Can&apos;t reach Insight</span>
      <span className="t-body-sm text-muted max-w-xs">Check your internet connection and try again.</span>
      <button type="button" onClick={onRetry} className="btn-pill mt-1.5">Retry</button>
    </div>
  );
}

/** Picks the right failure surface: connection problem vs server message. */
export function LoadFailure({ error, connectionProblem, onRetry }: { error: string; connectionProblem: boolean; onRetry: () => void }) {
  return connectionProblem ? <ConnectionErrorView onRetry={onRetry} /> : <ErrorView message={error} onRetry={onRetry} />;
}

/** Blurred overlay on premium-locked content for free users. */
export function PremiumLockOverlay({ message = "Premium Only", className }: { message?: string; className?: string }) {
  return (
    <div className={clsx("absolute inset-0 rounded-xl backdrop-blur-md bg-bg/60 grid place-items-center", className)}>
      <div className="flex flex-col items-center gap-2">
        <Crown size={24} className="text-gold fill-gold" />
        <span className="t-label-md text-gold">{message}</span>
      </div>
    </div>
  );
}

// ── Skeletons (static silhouettes, no shimmer) ───────────────────────────
export function SkeletonBar({ width, height = 10, className }: { width?: number | string; height?: number; className?: string }) {
  return <span className={clsx("block rounded-[3px] bg-surface", className)} style={{ width: width ?? "100%", height }} />;
}

export function SkeletonLedger({ rows = 8, avatar = 28, className }: { rows?: number; avatar?: number; className?: string }) {
  const widths = [120, 92, 140, 104];
  return (
    <Ledger className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ledger-row">
          <SkeletonBar width={22} />
          {avatar > 0 ? <span className="rounded-full bg-surface shrink-0" style={{ width: avatar, height: avatar }} /> : null}
          <div className="flex flex-col gap-[5px] flex-1">
            <SkeletonBar width={widths[i % 4]} height={11} />
            <SkeletonBar width={56} height={8} />
          </div>
          <SkeletonBar width={40} height={11} />
        </div>
      ))}
    </Ledger>
  );
}

export function SkeletonMatchCard({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2.5 px-3.5 py-3 rounded-xl bg-card border border-border-subtle", className)}>
      <div className="flex justify-between"><SkeletonBar width={110} height={9} /><SkeletonBar width={44} height={9} /></div>
      {[0, 1].map((i) => (
        <div key={i} className={clsx("flex items-center gap-2.5 py-[7px]", i === 1 && "border-t border-border-subtle ml-[38px]")}>
          {i === 0 ? <span className="size-7 rounded-full bg-surface" /> : <span className="size-7 rounded-full bg-surface -ml-[38px]" />}
          <SkeletonBar width={i === 0 ? 96 : 118} height={11} />
          <span className="flex-1" />
          <SkeletonBar width={22} height={14} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatRow({ columns = 3, className }: { columns?: number; className?: string }) {
  return (
    <div className={clsx("ledger", className)}>
      <div className="flex gap-1.5 px-3 py-2">{Array.from({ length: columns }).map((_, i) => <span key={i} className="flex-1 flex justify-center"><SkeletonBar width={42} height={8} /></span>)}</div>
      <div className="flex gap-1.5 px-3 py-3 bg-card">{Array.from({ length: columns }).map((_, i) => <span key={i} className="flex-1 text-center t-mono-md text-muted/50">—</span>)}</div>
    </div>
  );
}

// ── Inputs & buttons ──────────────────────────────────────────────────────
export function Field({ icon, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <label className={clsx("field", className)}>
      {icon ? <span className="text-muted shrink-0 [&>svg]:size-5">{icon}</span> : null}
      <input {...rest} />
    </label>
  );
}

export function SearchField({ value, onChange, placeholder = "Search", autoFocus, onClear }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onClear?: () => void }) {
  return (
    <label className="field !py-2.5 !px-3">
      <Search size={18} className="text-muted shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="!text-[15px]" />
      {value ? (
        <button type="button" aria-label="Clear" onClick={() => { onChange(""); onClear?.(); }} className="text-muted hover:text-primary"><X size={16} /></button>
      ) : null}
    </label>
  );
}

export function PrimaryButton({ loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type="button" className={clsx("btn-pill", className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={16} className="border-white/40 border-t-white" /> : null}
      {children}
    </button>
  );
}
export function GhostButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={clsx("btn-ghost", className)} {...rest}>{children}</button>;
}

/** Row toggle: a 6pt violet dot (filled) / hollow ring — the app's pick grammar. */
export function PickDot({ selected, className }: { selected: boolean; className?: string }) {
  return <span className={clsx("size-2 rounded-full border-[1.2px] shrink-0", selected ? "bg-violet border-violet" : "border-muted/50", className)} />;
}

export function Checkmark({ visible }: { visible: boolean }) {
  return visible ? <Check size={16} className="text-violet" /> : null;
}

// ── Overlays: side panel + bottom sheet / modal ───────────────────────────
export function SidePanel({ open, onClose, children, side = "right", width = 320 }: { open: boolean; onClose: () => void; children: ReactNode; side?: "left" | "right"; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <div className={clsx("fixed inset-0 z-50", !open && "pointer-events-none")} aria-hidden={!open}>
      <div className={clsx("absolute inset-0 bg-black/60 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <div className={clsx("absolute top-0 bottom-0 bg-card border-hairline transition-transform duration-200 ease-out overflow-y-auto", side === "right" ? "right-0 border-l" : "left-0 border-r", open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full")} style={{ width: `min(${width}px, 88vw)` }} role="dialog">
        {children}
      </div>
    </div>
  );
}

/** Sheet: bottom sheet on phones, centered modal on wider screens. */
export function Sheet({ open, onClose, title, children, trailing, size = "md" }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; trailing?: ReactNode; size?: "md" | "lg" | "full" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const maxW = size === "full" ? "sm:max-w-3xl" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={clsx("relative w-full bg-bg border-hairline sm:border rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl", maxW)}>
        <div className="flex items-center gap-3 px-4 py-3 hairline-b">
          <button type="button" onClick={onClose} aria-label="Close" className="text-secondary hover:text-primary"><X size={20} /></button>
          <span className="t-headline-sm text-primary flex-1 text-center truncate">{title}</span>
          <span className="min-w-5 flex justify-end">{trailing}</span>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}

/** Searchable single-select sheet with an "Any" option (SearchablePickerSheet). */
export function SearchablePickerSheet({ open, onClose, title, options, value, onChange }: { open: boolean; onClose: () => void; title: string; options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  const [query, setQuery] = useState("");
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options;
  const pick = (v: string | null) => { onChange(v); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="mb-3"><SearchField value={query} onChange={setQuery} placeholder={`Search ${title.toLowerCase()}`} autoFocus /></div>
      <Ledger>
        <LedgerRow onClick={() => pick(null)}><span className="flex-1 t-body-lg text-primary">Any</span><Checkmark visible={value === null} /></LedgerRow>
        {filtered.map((o) => (
          <LedgerRow key={o} onClick={() => pick(o)}><span className="flex-1 t-body-lg text-primary">{o}</span><Checkmark visible={value === o} /></LedgerRow>
        ))}
      </Ledger>
    </Sheet>
  );
}

/** Simple confirm dialog (replaces .alert / .confirmationDialog). */
export function ConfirmDialog({ open, title, message, confirmTitle = "Confirm", destructive, onConfirm, onCancel }: { open: boolean; title: string; message?: string; confirmTitle?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="alertdialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-card border border-hairline p-5 flex flex-col gap-3">
        <span className="t-headline-sm text-primary">{title}</span>
        {message ? <span className="t-body-sm text-secondary">{message}</span> : null}
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onCancel} className="btn-ghost !py-2">Cancel</button>
          <button type="button" onClick={onConfirm} className={clsx("btn-pill !py-2", destructive && "!bg-error")}>{confirmTitle}</button>
        </div>
      </div>
    </div>
  );
}

/** Transient toast at the bottom (banners / "Copied" / errors). */
export function Toast({ message, kind = "info" }: { message: string | null; kind?: "info" | "error" | "success" }) {
  if (!message) return null;
  const color = kind === "error" ? "border-error/50" : kind === "success" ? "border-success/50" : "border-hairline";
  return (
    <div className="fixed bottom-[calc(var(--tabbar-h)+16px)] md:bottom-6 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
      <div className={clsx("px-4 py-2.5 rounded-full bg-card border t-label-md text-primary shadow-xl", color)}>{message}</div>
    </div>
  );
}

/** Horizontal scroll strip (chip rows). */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex gap-2 overflow-x-auto no-scrollbar", className)}>{children}</div>;
}

/** Standard page column: full-bleed on phones, max 1100px on desktop. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={clsx("w-full mx-auto pb-[calc(var(--tabbar-h)+24px)] md:pb-10", wide ? "max-w-[1280px]" : "max-w-[1100px]", className)}>{children}</div>;
}

/** Two-column layout on desktop (main + rail), single column on phones. */
export function SplitLayout({ main, rail, className }: { main: ReactNode; rail?: ReactNode; className?: string }) {
  return (
    <div className={clsx("grid gap-4 px-4", rail ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "", className)}>
      <div className="min-w-0">{main}</div>
      {rail ? <div className="min-w-0">{rail}</div> : null}
    </div>
  );
}
