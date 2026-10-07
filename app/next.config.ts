import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
