// backend.ts — server-side calls to the Express API (adds x-api-key).
import "server-only";
import { serverConfig, hostRoot } from "./config";

export interface BackendResult {
  status: number;
  headers: Headers;
  body: ArrayBuffer;
}

export async function callBackend(
  path: string,
  init: {
    method?: string;
    body?: BodyInit | null;
    accessToken?: string | null;
    contentType?: string | null;
    atHostRoot?: boolean;
  } = {},
): Promise<BackendResult> {
  const base = init.atHostRoot ? hostRoot() : serverConfig.apiBaseURL;
  const url = base + (path.startsWith("/") ? path : "/" + path);
  const headers: Record<string, string> = { "x-api-key": serverConfig.appApiKey };
  if (init.contentType !== null) headers["Content-Type"] = init.contentType ?? "application/json";
  if (init.accessToken) headers["Authorization"] = `Bearer ${init.accessToken}`;
  // Identifies the web client in backend logs (appGate ignores it for gating).
  headers["X-Client"] = "web";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), serverConfig.timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body ?? undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: res.status, headers: res.headers, body: await res.arrayBuffer() };
  } finally {
    clearTimeout(timer);
  }
}

export function jsonOf(result: BackendResult): unknown {
  try {
    return JSON.parse(Buffer.from(result.body).toString("utf8"));
  } catch {
    return null;
  }
}

/** POST /auth/refresh { refreshToken } → { token, refreshToken } */
export async function refreshTokens(refreshToken: string): Promise<{ token: string; refreshToken: string | null } | "rejected" | "transient"> {
  try {
    const r = await callBackend("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) });
    if (r.status === 200) {
      const j = jsonOf(r) as { token?: string; accessToken?: string; refreshToken?: string; refresh_token?: string } | null;
      const token = j?.token ?? j?.accessToken;
      if (!token) return "transient";
      return { token, refreshToken: j?.refreshToken ?? j?.refresh_token ?? null };
    }
    if (r.status === 401 || r.status === 403) return "rejected";
    return "transient";
  } catch {
    return "transient";
  }
}
