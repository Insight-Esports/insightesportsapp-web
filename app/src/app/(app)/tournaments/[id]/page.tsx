// /tournaments/[id]?from= — a tournament's bracket (the tree, title odds,
// round by round). `from` is the page Back returns to (a team's Honors);
// otherwise Back goes to the Tournaments list.
"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BracketScreen } from "@/features/tournaments/BracketScreen";

export default function BracketPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <BracketScreen id={decodeURIComponent(String(id ?? ""))} />
    </Suspense>
  );
}
