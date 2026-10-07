// premium/usePayments.ts — the server half of StoreManager: GET /payments/status,
// POST /payments/checkout (Stripe hosted page) and POST /payments/portal.
"use client";

import { useCallback, useState } from "react";
import { api, endpoints, errorMessage } from "@/lib/api";
import { iso, str, bool, type Json } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import type { Plan } from "./plans";

/** GET /api/payments/status (PaymentStatus) */
export interface PaymentStatus {
  isPremium: boolean;
  status: string | null;              // active · past_due · expired · revoked · cancelled · inactive
  currentPeriodEnd: string | null;
  provider: string | null;            // apple · stripe · google
  productId: string | null;
  environment: string | null;
  autoRenew: boolean | null;
  graceUntil: string | null;
  cancelledAt: string | null;
  hasStripeAccount: boolean | null;
}
export function normalizePaymentStatus(raw: Json): PaymentStatus {
  const r = raw ?? {};
  const optBool = (v: Json) => (typeof v === "boolean" ? v : null);
  return {
    isPremium: bool(r.isPremium ?? r.is_premium),
    status: str(r.status),
    currentPeriodEnd: iso(r.currentPeriodEnd ?? r.current_period_end),
    provider: str(r.provider),
    productId: str(r.productId),
    environment: str(r.environment),
    autoRenew: optBool(r.autoRenew),
    graceUntil: iso(r.graceUntil),
    cancelledAt: iso(r.cancelledAt),
    hasStripeAccount: optBool(r.hasStripeAccount),
  };
}
export const isStripe = (s: PaymentStatus | null) => s?.provider?.toLowerCase() === "stripe";

/** "Renews Oct 29" / "Ends Oct 29" / "Billing retry until Oct 31" (StoreManager.renewalLine). */
export function renewalLine(s: PaymentStatus | null): string | null {
  if (!s || !s.isPremium) return null;
  const f = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (s.graceUntil && s.status === "past_due") return `Billing retry until ${f(s.graceUntil)}`;
  if (!s.currentPeriodEnd) return null;
  return (s.autoRenew ?? true) && !s.cancelledAt ? `Renews ${f(s.currentPeriodEnd)}` : `Ends ${f(s.currentPeriodEnd)}`;
}

export function usePaymentStatus(enabled = true) {
  return useFetch<PaymentStatus>(async () => normalizePaymentStatus(await api.get(endpoints.paymentsStatus)), [], { enabled });
}

/**
 * POST /payments/checkout → the backend answers { checkoutUrl, sessionId, mode: "hosted" }
 * (paymentController.checkout). We send the chosen plan alongside mode so a
 * plan-aware backend can pick the price; today the server bills its single
 * STRIPE_PREMIUM_PRICE_ID regardless. Tolerates { url } too.
 */
export function useCheckout() {
  const [isPurchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const checkout = useCallback(async (plan: Plan) => {
    if (isPurchasing) return;
    setPurchasing(true);
    setPurchaseError(null);
    setStatusMessage(null);
    try {
      const r = await api.post<{ checkoutUrl?: string; url?: string; mode?: string }>(endpoints.paymentsCheckout, { plan, mode: "hosted" });
      const url = r?.checkoutUrl ?? r?.url;
      if (!url) throw new Error("Couldn't start checkout. Please try again.");
      setStatusMessage("Taking you to secure checkout…");
      window.location.assign(url);
    } catch (e) {
      setPurchaseError(errorMessage(e, "Couldn't start checkout. Please try again."));
      setPurchasing(false);
    }
  }, [isPurchasing]);

  /** POST /payments/portal → { portalUrl } */
  const openPortal = useCallback(async () => {
    try {
      const r = await api.post<{ portalUrl?: string; url?: string }>(endpoints.paymentsPortal, {});
      const url = r?.portalUrl ?? r?.url;
      if (url) window.location.assign(url);
      else setPurchaseError("No subscription found");
    } catch (e) {
      setPurchaseError(errorMessage(e));
    }
  }, []);

  return { checkout, openPortal, isPurchasing, purchaseError, statusMessage, setStatusMessage };
}
