import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Insight", template: "%s · Insight" },
  description: "Live esports stats, predictions and fan engagement for VALORANT, CS2 and League of Legends.",
  icons: { icon: "/favicon-64.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Team logos / player photos are served by the backend's /img thumbnail
// route. Opening the TLS connection to that host at page load (instead of on
// the first <img>) saves the handshake on the first screen of pictures.
const imageOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://esports-app-production.up.railway.app").origin; } catch { return null; }
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {imageOrigin ? <link rel="preconnect" href={imageOrigin} crossOrigin="" /> : null}
        {imageOrigin ? <link rel="dns-prefetch" href={imageOrigin} /> : null}
      </head>
      <body className="min-h-full flex flex-col bg-bg text-primary">{children}</body>
    </html>
  );
}
