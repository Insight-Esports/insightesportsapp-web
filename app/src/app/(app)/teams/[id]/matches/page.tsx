// /teams/[id]/matches?year= — "All Matches": the team's whole archive by month.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EntityArchive } from "@/features/archive/EntityArchive";

export default function TeamMatchesPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <EntityArchive kind="team" id={decodeURIComponent(String(id ?? ""))} />
    </Suspense>
  );
}
