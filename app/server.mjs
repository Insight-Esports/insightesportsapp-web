// server.mjs — the production server: Next.js (the app, under /app) plus the
// marketing site at the host root.
//
// The app uses Next's basePath ("/app"), and Next only routes requests under
// it; the root URLs the marketing site has always had (/, /privacy, /terms,
// /support, /premium-checkout, /riot.txt …) are answered here from
// public/site, which scripts/sync-site.mjs fills from the repo root before
// every build. Everything else goes to Next untouched.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production" && process.env.NEXT_DEV === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/app";
const siteDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "public", "site");

const SITE_PAGES = new Set(["privacy", "terms", "support", "premium-checkout"]);
const SITE_FILES = new Set(["riot.txt", "riot2.txt", "robots.txt", "sitemap.xml", "favicon.ico"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript" };

/** Which file in public/site answers a root URL, or null. */
function siteFile(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "index.html";
  const m = pathname.match(/^\/([a-z0-9-]+)(?:\.html|\/)?$/i);
  if (m && SITE_PAGES.has(m[1].toLowerCase())) return `${m[1].toLowerCase()}.html`;
  const f = pathname.slice(1);
  if (SITE_FILES.has(f)) return f;
  return null;
}

function serveFile(res, file) {
  const full = join(siteDir, file);
  let st;
  try { st = statSync(full); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": file.endsWith(".html") ? "public, max-age=300" : "public, max-age=3600",
  });
  createReadStream(full).pipe(res);
  return true;
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    const host = (req.headers.host ?? "").toLowerCase();
    // On the app subdomain (app.insightesportsapp.com, the Railway domain),
    // the app is the whole site: root URLs go to /app/… instead of the
    // marketing pages.
    if (!host.startsWith("insightesportsapp.com") && !host.startsWith("www.") && p !== basePath && !p.startsWith(basePath + "/") && !p.startsWith("/_next/")) {
      res.writeHead(302, { Location: `${basePath}${p === "/" ? "" : p}${url.search}` });
      res.end();
      return;
    }
    if (p !== basePath && !p.startsWith(basePath + "/")) {
      const file = siteFile(p);
      if (file && serveFile(res, file)) return;
      // Unknown root URL: send people to the site's home rather than a Next 404.
      if (!p.startsWith("/_next/")) { res.writeHead(302, { Location: "/" }); res.end(); return; }
    }
    // App pages may use the camera (Messages → Link this browser scans a QR
    // code); say so explicitly, since a missing policy reads as "deny" to
    // some embedders and browser extensions. Static assets need nothing.
    if ((p === basePath || p.startsWith(basePath + "/")) && !p.startsWith(basePath + "/_next/")) {
      res.setHeader("Permissions-Policy", "camera=(self)");
    }
    handle(req, res);
  }).listen(port, () => {
    console.log(`> Insight web listening on http://localhost:${port} (app at ${basePath}, site at /)`);
  });
});
