// /profile/[id]/following — FollowListView(mode: .following).
"use client";

import { useParams } from "next/navigation";
import { FollowList } from "@/features/profile/FollowList";

export default function FollowingPage() {
  const { id } = useParams<{ id: string }>();
  return <FollowList mode="following" userId={decodeURIComponent(id)} />;
}
