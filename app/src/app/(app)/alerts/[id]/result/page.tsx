// /alerts/[id]/result — one decided alert from History ("Result"); id is the result row's id.
"use client";

import { useParams } from "next/navigation";
import { AlertResultScreen } from "@/features/alerts/AlertDetail";

export default function AlertResultPage() {
  const { id } = useParams<{ id: string }>();
  return <AlertResultScreen id={decodeURIComponent(String(id ?? ""))} />;
}
