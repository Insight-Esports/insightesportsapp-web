// /players/[id] — PlayerDetailView (+ PlayerCommentsView, RecentGamesList).
"use client";

import { useParams } from "next/navigation";
import { PlayerDetail } from "@/features/players/PlayerDetail";

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PlayerDetail id={decodeURIComponent(String(id ?? ""))} />;
}
