// premium/PremiumGate.tsx — PremiumGate.swift + PremiumPlanPicker (Components.swift).
//
// Wraps premium-only content: the content when the user is Pro, otherwise
// the locked / upsell state with the plan picker and the legal footer. The
// REAL enforcement is server-side (every premium endpoint is protect +
// isPremium); this is a presentation layer, not the security boundary.
//
// Other features reuse <PremiumGate feature="…"> or <PremiumLockedView …>.
"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { AssetIcon, PickDot } from "@/components/ui";
import { monthlySavingsPercent, PREMIUM_BENEFITS, priceLabel, PRIVACY_URL, TERMS_URL, weeklyPerMonth, type Plan } from "./plans";
import { useCheckout } from "./usePayments";

export interface GateCopy { featureTitle: string; featureBlurb: string; bullets: string[]; lockNote?: string | null }

/** Per-feature copy presets (verbatim from the Swift call sites). */
export const GATE_COPY: Record<string, GateCopy> = {
  predictions: {
    featureTitle: "Pro Predictions",
    featureBlurb: "Data-driven stat breakdowns and win probabilities for every player and team.",
    bullets: PREMIUM_BENEFITS,
  },
  weeklyReport: {
    featureTitle: "Weekly Report",
    featureBlurb: "Your personalized week in esports — match results, prediction performance, and standout players, written for you.",
    bullets: [
      "A personalized weekly recap",
      "Results from the teams & players you follow",
      "Your prediction performance for the week",
      "Standout performances worth watching",
      "Save the reports you want to keep",
    ],
    lockNote: "Unlock this feature with Insight Pro",
  },
  default: {
    featureTitle: "Insight Premium",
    featureBlurb: "Unlock every premium feature",
    bullets: PREMIUM_BENEFITS,
  },
};

export function PremiumGate({ children, feature, featureTitle, featureBlurb, bullets, lockNote }: { children: ReactNode; feature?: string } & Partial<GateCopy>) {
  const { isPremium } = useAppState();
  if (isPremium) return <>{children}</>;
  const preset = GATE_COPY[feature ?? "default"] ?? GATE_COPY.default;
  return (
    <PremiumLockedView
      featureTitle={featureTitle ?? preset.featureTitle}
      featureBlurb={featureBlurb ?? preset.featureBlurb}
      bullets={bullets ?? preset.bullets}
      lockNote={lockNote ?? preset.lockNote ?? null}
    />
  );
}

/** The premium mark, template-tinted brand violet (Image("premium").renderingMode(.template)). */
export function PremiumMark({ height = 52, className }: { height?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block bg-violet", className)}
      style={{ height, width: height, WebkitMaskImage: "url(/icons/premium.png)", maskImage: "url(/icons/premium.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }}
    />
  );
}

/** Violet-dot bullet list in one bordered card (the feature bullets). */
export function BenefitList({ bullets }: { bullets: string[] }) {
  return (
    <ul className="flex flex-col gap-3.5 p-5 rounded-2xl bg-card border border-border-subtle">
      {bullets.map((b) => (
        <li key={b} className="flex items-start gap-3">
          <span className="size-1.5 rounded-full bg-violet shrink-0 mt-[7px]" />
          <span className="t-body-md text-primary">{b}</span>
        </li>
      ))}
    </ul>
  );
}

// MARK: - Locked / Upsell State
export function PremiumLockedView({ featureTitle, featureBlurb, bullets, lockNote }: GateCopy) {
  const [plan, setPlan] = useState<Plan>("monthly");
  const { checkout, isPurchasing, purchaseError, statusMessage } = useCheckout();
  return (
    <div className="flex flex-col items-stretch pb-[calc(var(--tabbar-h)+24px)] md:pb-10">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 pt-10 pb-6 px-8 text-center">
        <PremiumMark />
        <span className="t-label-lg text-violet tracking-[0.12em]">PREMIUM FEATURE</span>
        <span className="t-headline-sm text-primary">{featureTitle}</span>
        <span className="t-body-md text-secondary max-w-md">{featureBlurb}</span>
      </div>

      {lockNote ? (
        <div className="self-center flex items-center gap-2 px-4 py-2.5 rounded-full bg-gold/12 text-gold mb-6">
          <AssetIcon name="premiumlocked" height={14} />
          <span className="t-label-md">{lockNote}</span>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-xl px-5 flex flex-col gap-5">
        <BenefitList bullets={bullets} />

        <div className="flex flex-col gap-3 px-1">
          <PremiumPlanPicker selection={plan} onChange={setPlan} />
          <PurchaseButton plan={plan} isPurchasing={isPurchasing} onClick={() => checkout(plan)} />
          {statusMessage ? <span className="t-label-sm text-muted text-center">{statusMessage}</span> : null}
          {purchaseError ? <span className="t-label-sm text-error text-center">{purchaseError}</span> : null}
          <PremiumLegalFooter plan={plan} />
        </div>
      </div>
    </div>
  );
}

/** "Start Premium · $5.99/month" / "Processing…" */
export function PurchaseButton({ plan, isPurchasing, onClick }: { plan: Plan; isPurchasing: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={isPurchasing} className="w-full py-4 rounded-[14px] bg-violet text-white t-label-lg hover:brightness-110 disabled:opacity-60 transition">
      {isPurchasing ? "Processing…" : `Start Premium · ${priceLabel(plan)}`}
    </button>
  );
}

// MARK: - Plan picker (Components.swift)
// Weekly vs monthly as a two-row ledger. The monthly row carries
// "BEST VALUE · SAVE N%"; the weekly row shows its monthly-equivalent.
export function PremiumPlanPicker({ selection, onChange }: { selection: Plan; onChange: (p: Plan) => void }) {
  const rows: { plan: Plan; title: string; note: string; violet: boolean }[] = [
    { plan: "monthly", title: "Monthly", note: `BEST VALUE · SAVE ${monthlySavingsPercent()}%`, violet: true },
    { plan: "weekly", title: "Weekly", note: `≈ ${weeklyPerMonth()}/month`, violet: false },
  ];
  return (
    <div className="ledger" role="radiogroup" aria-label="Plan">
      {rows.map((r, i) => {
        const selected = selection === r.plan;
        return (
          <button
            key={r.plan}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(r.plan)}
            className={clsx("flex items-center gap-3 w-full px-3.5 py-3 text-left transition-colors hover:bg-surface/60", selected ? "bg-card" : "bg-surface/50", i > 0 && "border-t border-border-subtle")}
          >
            <PickDot selected={selected} />
            <span className="flex flex-col gap-0.5">
              <span className={clsx(selected ? "t-label-lg" : "t-body-md", "text-primary")}>{r.title}</span>
              <span className={clsx("text-[10px] font-semibold", r.violet ? "text-violet tracking-[0.1em]" : "text-muted")}>{r.note}</span>
            </span>
            <span className="flex-1" />
            <span className={clsx("t-mono-md", selected ? "text-primary" : "text-muted")}>{priceLabel(r.plan)}</span>
          </button>
        );
      })}
    </div>
  );
}

// MARK: - Legal footer (App Review 3.1.2)
// Auto-renewal terms, Restore Purchases, Terms of Use and Privacy Policy —
// one component shared by the lock screen and the upgrade screen.
export function PremiumLegalFooter({ plan }: { plan: Plan }) {
  const { refreshUser } = useAppState();
  const [restoring, setRestoring] = useState(false);
  const period = plan === "weekly" ? "weekly" : "monthly";
  const renewal = `Auto-renews ${period} at ${priceLabel(plan)} until cancelled. Cancel anytime in your App Store settings.`;
  // No StoreKit on the web: "Restore" re-syncs the account's entitlement from the server.
  const restore = async () => { setRestoring(true); try { await refreshUser(); } finally { setRestoring(false); } };
  return (
    <div className="flex flex-col items-center gap-2.5 pt-1 text-center">
      <span className="t-label-sm text-muted">{renewal}</span>
      <div className="flex items-center gap-[18px] t-label-sm text-secondary">
        <button type="button" onClick={restore} disabled={restoring} className="hover:text-primary disabled:opacity-50">Restore Purchases</button>
        <a href={TERMS_URL} target="_blank" rel="noreferrer" className="hover:text-primary">Terms of Use</a>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="hover:text-primary">Privacy Policy</a>
      </div>
    </div>
  );
}
