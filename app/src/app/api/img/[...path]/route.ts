// GET /api/img/<size>/<sig>/<src> — same-origin mirror of the backend's /img
// thumbnail route.
//
// The backend sits behind helmet(), whose default Cross-Origin-Resource-Policy
// is `same-origin`; browsers therefore refuse to render its images inside a
// page on another host (the iOS app is not a browser, so it never noticed).
// Until the backend sends `Cross-Origin-Resource-Policy: cross-origin` on
// /img, the page loads pictures through this route instead. Public (the
// backend's URLs are signed; nothing else is reachable through here).
import { hostRoot } from "@/lib/server/config";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length || path.some((p) => p === ".." || p === "")) return new Response("Not found", { status: 404 });
  const target = `${hostRoot()}/img/${path.map(encodeURIComponent).join("/")}`;
  let r: Response;
  try {
    r = await fetch(target, {
      headers: { accept: req.headers.get("accept") ?? "image/*" },
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
  const headers = new Headers();
  headers.set("Content-Type", r.headers.get("content-type") ?? "image/webp");
  headers.set("Cache-Control", r.ok ? (r.headers.get("cache-control") ?? "public, max-age=31536000, immutable") : "no-store");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  const xc = r.headers.get("x-cache");
  if (xc) headers.set("X-Cache", xc);
  return new Response(r.body, { status: r.status, headers });
}
