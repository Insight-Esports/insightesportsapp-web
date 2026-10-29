// /players/[id]/history?year= — "Match History": the player's whole archive by month.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { EntityArchive } from "@/features/archive/EntityArchive";

export default function PlayerHistoryPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <EntityArchive kind="player" id={decodeURIComponent(String(id ?? ""))} />
    </Suspense>
  );
}
