// /profile/[id] — a public profile (ProfileDetailView(userId:)). "me" = you.
"use client";

import { useParams } from "next/navigation";
import { ProfileDetail } from "@/features/profile/ProfileDetail";

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const decoded = decodeURIComponent(id);
  return <ProfileDetail userId={decoded === "me" ? null : decoded} />;
}
