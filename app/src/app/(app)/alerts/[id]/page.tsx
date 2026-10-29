// /alerts/[id] — one active alert ("Alert").
"use client";

import { useParams } from "next/navigation";
import { AlertScreen } from "@/features/alerts/AlertDetail";

export default function AlertPage() {
  const { id } = useParams<{ id: string }>();
  return <AlertScreen id={decodeURIComponent(String(id ?? ""))} />;
}
