// /profile/[id]/followers — FollowListView(mode: .followers).
"use client";

import { useParams } from "next/navigation";
import { FollowList } from "@/features/profile/FollowList";

export default function FollowersPage() {
  const { id } = useParams<{ id: string }>();
  return <FollowList mode="followers" userId={decodeURIComponent(id)} />;
}
