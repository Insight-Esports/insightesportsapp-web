// Server-only configuration. Never import from client components.
import "server-only";

export const serverConfig = {
  apiBaseURL: (process.env.API_BASE_URL ?? "https://esports-app-production.up.railway.app/api").replace(/\/$/, ""),
  appApiKey: process.env.APP_API_KEY ?? "",
  // null = any Insight account (only when the Google gate is on and no domain is configured).
  allowedEmailDomain: ((): string | null => {
    const raw = process.env.ALLOWED_EMAIL_DOMAIN;
    if (raw === undefined) return process.env.GOOGLE_CLIENT_ID ? null : "insightesportsapp.com";
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    return d || null;
  })(),
  cookieSecure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  timeoutMs: 30_000,
};

/** The /status endpoint lives at the host root, outside /api. */
export function hostRoot(): string {
  return serverConfig.apiBaseURL.replace(/\/api$/, "");
}
