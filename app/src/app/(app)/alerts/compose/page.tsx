// /alerts/compose — Set Alert / Change Alert (?type, id, name, game, stat,
// direction, target, match — see features/alerts/entry.ts — or ?edit=<id>).
"use client";

import { ComposerScreen } from "@/features/alerts/Composer";

export default function ComposeAlertPage() {
  return <ComposerScreen />;
}
