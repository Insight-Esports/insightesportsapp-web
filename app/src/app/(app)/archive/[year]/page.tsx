// /archive/[year]?game= — one year of the archive as a month-by-month calendar.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ArchiveYear } from "@/features/archive/ArchiveYear";

export default function ArchiveYearPage() {
  const { year } = useParams<{ year: string }>();
  return (
    <Suspense>
      <ArchiveYear year={Number(year)} />
    </Suspense>
  );
}
