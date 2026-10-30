// /tournaments?game= — the Schedule tab's Tournaments face (ScheduleView's
// middle segment): ON NOW, the games on now, PAST EDITIONS.
"use client";

import { Suspense } from "react";
import { TournamentsScreen } from "@/features/tournaments/TournamentsScreen";

export default function TournamentsPage() {
  return (
    <Suspense>
      <TournamentsScreen />
    </Suspense>
  );
}
