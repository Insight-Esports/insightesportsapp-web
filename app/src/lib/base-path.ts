// base-path.ts — the app lives at insightesportsapp.com/app (next.config
// basePath). <Link> and router calls get the prefix automatically; raw
// fetch() URLs and redirects do not, so they go through withBase().
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/app";

export function withBase(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : "/" + path}`;
}
