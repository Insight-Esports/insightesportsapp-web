// /archive/[year]/[date]?game= — one day's matches (date = YYYY-MM-DD, UTC).
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ArchiveDay } from "@/features/archive/ArchiveDay";

export default function ArchiveDayPage() {
  const { date } = useParams<{ year: string; date: string }>();
  return (
    <Suspense>
      <ArchiveDay dateKey={decodeURIComponent(String(date ?? ""))} />
    </Suspense>
  );
}
