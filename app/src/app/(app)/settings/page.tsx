// /settings — SettingsView (?panel=email|password opens those sheets).
"use client";

import { Suspense } from "react";
import { SettingsRoot } from "@/features/settings/SettingsRoot";

export default function SettingsPage() {
  return <Suspense><SettingsRoot /></Suspense>;
}
