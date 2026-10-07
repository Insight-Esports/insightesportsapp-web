// premium/plans.ts — StoreManager.Plan + the price math, without StoreKit.
// Prices are the App Store fallbacks ($1.99/week · $5.99/month); the web
// never loads live products, so these are the labels the screen shows.

export type Plan = "weekly" | "monthly";

export const PLAN_PRICE: Record<Plan, number> = { weekly: 1.99, monthly: 5.99 };
export const PLAN_PERIOD: Record<Plan, string> = { weekly: "week", monthly: "month" };

/** "$1.99/week" or "$5.99/month". */
export function priceLabel(plan: Plan): string {
  return `$${PLAN_PRICE[plan].toFixed(2)}/${PLAN_PERIOD[plan]}`;
}

/** Weekly price × 4.33 weeks, as a monthly-equivalent anchor ("≈ $8.62/month"). */
export function weeklyPerMonth(): string {
  return `$${(PLAN_PRICE.weekly * 4.33).toFixed(2)}`;
}

/** How much monthly saves vs paying weekly for a month: $1.99 × 4.33 = $8.62 vs $5.99 → 31%. */
export function monthlySavingsPercent(): number {
  const perMonth = PLAN_PRICE.weekly * 4.33;
  if (perMonth <= 0) return 0;
  return Math.max(0, Math.round(((perMonth - PLAN_PRICE.monthly) / perMonth) * 100));
}

export const TERMS_URL = "https://insightesportsapp.com/terms";
export const PRIVACY_URL = "https://insightesportsapp.com/privacy";

/** The Pro feature list (PredictionsView / PremiumUpsellView benefits). */
export const PREMIUM_BENEFITS = [
  "Full player & team stat breakdowns",
  "Probability any stat line hits, backed by last-10 form",
  "Live & pre-match win probability",
  "Trends, outliers, and map splits",
  "Personalized weekly report",
  "Ad-free experience",
  "Premium chat badge",
];
