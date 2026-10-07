// POST /api/avatar (multipart: file) — AvatarUploader.swift for the web.
//
// The backend never receives image bytes: the app uploads straight to
// Supabase Storage (bucket "avatars") with the user's own access token, then
// registers the public URL via POST /users/me/avatar { avatarUrl }. The
// browser can't do the first step itself (the JWT lives in an httpOnly
// cookie), so this route does both halves server-side and returns the
// backend's { avatar_url, avatar_pending } untouched.
//
// Config: SUPABASE_URL + SUPABASE_ANON_KEY (same values as Config.xcconfig).
import { NextResponse } from "next/server";
import { callBackend } from "@/lib/server/backend";
import { readSession, decodeJwtPayload } from "@/lib/server/session";

const BUCKET = "avatars";
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const { accessToken } = await readSession();
  if (!accessToken) return NextResponse.json({ error: "Please log in again.", code: "NO_SESSION" }, { status: 401 });

  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY ?? "";
  if (!base || !anon) return NextResponse.json({ error: "Avatar upload isn't configured yet." }, { status: 501 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Couldn't upload the image. Please try again." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Couldn't upload the image. Please try again." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large. Please choose one under 8 MB." }, { status: 413 });
  const type = file.type || "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return NextResponse.json({ error: "Avatar must be a JPEG, PNG, or WebP image" }, { status: 400 });

  const payload = decodeJwtPayload(accessToken);
  const userId = typeof payload?.sub === "string" ? payload.sub : "user";
  // Unique object path per upload so a re-upload never collides / caches.
  const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;

  try {
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon,
        "Content-Type": type,
        "x-upsert": "true",
        "cache-control": "max-age=31536000",
      },
      body: await file.arrayBuffer(),
    });
    if (!up.ok) return NextResponse.json({ error: "Couldn't upload the image. Please try again." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Couldn't upload the image. Please try again." }, { status: 502 });
  }

  const avatarUrl = `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  try {
    const r = await callBackend("/users/me/avatar", { method: "POST", body: JSON.stringify({ avatarUrl }), accessToken });
    return new NextResponse(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Can't reach Insight.", code: "UNREACHABLE" }, { status: 502 });
  }
}
