// premium/UpgradeScreen.tsx — PremiumUpsellView (ProfileView.swift): the
// purchase screen at /premium/upgrade. Subscribed accounts see the
// "You're subscribed" state with Manage Subscription (Stripe portal).
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAppState } from "@/store/app-state";
import { Page } from "@/components/ui";
import { BenefitList, PremiumLegalFooter, PremiumMark, PremiumPlanPicker, PurchaseButton } from "./PremiumGate";
import { PREMIUM_BENEFITS, type Plan } from "./plans";
import { isStripe, renewalLine, useCheckout, usePaymentStatus } from "./usePayments";

export function UpgradeScreen() {
  const router = useRouter();
  const { user, isPremium } = useAppState();
  const [plan, setPlan] = useState<Plan>("monthly");
  const { checkout, openPortal, isPurchasing, purchaseError, statusMessage } = useCheckout();
  const status = usePaymentStatus(!!user);
  const subscribed = isPremium || status.data?.isPremium === true;
  const line = renewalLine(status.data);

  return (
    <Page>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card"><ChevronLeft size={20} /></button>
        <span className="t-headline-sm text-primary">Premium</span>
      </div>

      <div className="flex flex-col items-center gap-6 pt-8">
        <PremiumMark />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="t-headline-md text-primary">Insight Premium</h1>
          <span className="t-body-md text-secondary">Unlock every premium feature</span>
        </div>

        <div className="w-full max-w-xl px-5 flex flex-col gap-6">
          <BenefitList bullets={PREMIUM_BENEFITS} />

          {subscribed ? (
            <div className="flex flex-col items-center gap-3 pt-2 text-center">
              <span className="t-headline-md text-primary">You&apos;re subscribed</span>
              <span className="t-body-sm text-muted px-6">
                {isStripe(status.data) ? "Insight Premium · Manage or cancel anytime on the website." : "Insight Premium · Manage or cancel anytime in your App Store settings."}
              </span>
              {line ? <span className="t-mono-sm text-secondary">{line}</span> : null}
              {statusMessage ? <span className="t-label-sm text-muted px-6">{statusMessage}</span> : null}
              <button type="button" onClick={() => router.back()} className="w-full py-[15px] rounded-[14px] bg-violet text-white t-label-lg hover:brightness-110 transition">Done</button>
              {isStripe(status.data) || status.data?.hasStripeAccount ? (
                <button type="button" onClick={openPortal} className="t-label-md text-secondary hover:text-primary">Manage Subscription</button>
              ) : (
                <span className="t-label-md text-secondary">Manage Subscription</span>
              )}
              {purchaseError ? <span className="t-label-sm text-error">{purchaseError}</span> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <PremiumPlanPicker selection={plan} onChange={setPlan} />
              <PurchaseButton plan={plan} isPurchasing={isPurchasing} onClick={() => checkout(plan)} />
              {statusMessage ? <span className="t-label-sm text-muted text-center">{statusMessage}</span> : null}
              {purchaseError ? <span className="t-label-sm text-error text-center">{purchaseError}</span> : null}
              <PremiumLegalFooter plan={plan} />
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
