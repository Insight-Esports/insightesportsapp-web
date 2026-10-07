// /schedule?game=&date= — ScheduleView + CalendarScheduleView.
"use client";

import { Suspense } from "react";
import { ScheduleScreen } from "@/features/matches/schedule";

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleScreen />
    </Suspense>
  );
}
