// /archive?game= — the general match archive (Archive.swift): years → days → matches.
"use client";

import { Suspense } from "react";
import { ArchiveHome } from "@/features/archive/ArchiveHome";

export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveHome />
    </Suspense>
  );
}
