// /results?game=&team= — ResultsView (the Schedule tab's second face).
"use client";

import { Suspense } from "react";
import { ResultsScreen } from "@/features/matches/results";

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsScreen />
    </Suspense>
  );
}
