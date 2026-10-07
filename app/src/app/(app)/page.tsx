// / — the Live tab (HomeView.swift). ?game= is optional and shareable.
"use client";

import { Suspense } from "react";
import { HomeScreen } from "@/features/matches/home";

export default function LivePage() {
  return (
    <Suspense>
      <HomeScreen />
    </Suspense>
  );
}
