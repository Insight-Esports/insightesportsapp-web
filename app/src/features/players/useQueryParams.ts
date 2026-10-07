// useQueryParams — filter state that lives in the URL (shareable, back/forward
// works), the web's stand-in for a view model's @Published filters.
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = useCallback((patch: Record<string, string | null | undefined>, opts: { push?: boolean } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k); else next.set(k, v);
    }
    const qs = next.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (opts.push) router.push(href, { scroll: false }); else router.replace(href, { scroll: false });
  }, [params, pathname, router]);
  return { params, set };
}
