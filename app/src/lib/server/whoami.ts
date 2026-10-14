// whoami.ts — "which account does this token belong to?" via GET /users/me.
//
// Used by the Link-web relay, where the web (cookie session) and the phone
// (its own JWT in an Authorization header) must prove they are the SAME
// account before the key hand-off is relayed. The backend verifies the JWT;
// we only read the id it answers with.
import "server-only";
import { callBackend, jsonOf, refreshTokens } from "./backend";
import { readSession, writeSession, clearSession, isAllowedEmail, emailFromToken } from "./session";

export type WhoAmI = { id: string; email: string | null } | "unauthorized" | "unreachable";

export async function whoAmI(accessToken: string): Promise<WhoAmI> {
  let r;
  try {
    r = await callBackend("/users/me", { accessToken, contentType: null });
  } catch {
    return "unreachable";
  }
  if (r.status === 401 || r.status === 403) return "unauthorized";
  if (r.status !== 200) return "unreachable";
  const raw = jsonOf(r) as { id?: unknown; email?: unknown } | null;
  if (raw?.id === undefined || raw.id === null) return "unreachable";
  return { id: String(raw.id), email: typeof raw.email === "string" ? raw.email : null };
}

/** The account signed in on the web (httpOnly cookie session), refreshing the
 *  access token once on 401 like /api/backend does. */
export async function webWhoAmI(): Promise<WhoAmI | "no-session"> {
  const { accessToken, refreshToken } = await readSession();
  if (!accessToken) return "no-session";
  if (!isAllowedEmail(emailFromToken(accessToken))) return "unauthorized";
  let me = await whoAmI(accessToken);
  if (me === "unauthorized" && refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed === "rejected") { await clearSession(); return "unauthorized"; }
    if (refreshed !== "transient") {
      await writeSession(refreshed.token, refreshed.refreshToken);
      me = await whoAmI(refreshed.token);
    }
  }
  return me;
}

/** The account behind a raw `Authorization: Bearer …` header (the phone). */
export function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
