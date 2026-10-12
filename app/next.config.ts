import type { NextConfig } from "next";

// The app is served at insightesportsapp.com/app; the marketing site stays at
// the root of the same host (its pages live in public/site, synced from the
// repo root by scripts/sync-site.mjs at build time).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/app";

// Root-site URLs (/, /privacy, /riot.txt …) are mapped onto public/site by
// the middleware (src/proxy.ts): Next refuses config rewrites that cross the
// basePath boundary.

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The app is a logged-in, data-driven client (like the iOS app): every
  // screen fetches through /api/backend at runtime, so component caching
  // buys nothing and only adds Suspense ceremony.
  cacheComponents: false,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Team logos / player photos / avatars come from many CDNs; the
    // backend already proxies and caches them. Allow any https host.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
