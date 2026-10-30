// /tournaments/series/[id] — one series of a tournament bracket. `?from=`
// is the page to return to (the bracket it was opened from); the series'
// games link back here with this page's own path, so match → series →
// bracket unwinds in order.
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SeriesScreen } from "@/features/tournaments/series/SeriesScreen";

export default function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const from = useSearchParams().get("from");
  const seriesId = decodeURIComponent(String(id ?? ""));
  return <SeriesScreen key={seriesId} id={seriesId} from={from} />;
}
