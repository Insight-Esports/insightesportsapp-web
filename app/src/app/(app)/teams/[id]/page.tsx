// /teams/[id] — TeamDetailView. The id may be a team NAME (match cards link
// by name when a row shipped null team ids); TeamDetail resolves it.
"use client";

import { useParams } from "next/navigation";
import { TeamDetail } from "@/features/teams/TeamDetail";

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TeamDetail id={decodeURIComponent(String(id ?? ""))} />;
}
