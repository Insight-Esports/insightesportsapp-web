// IconGallery — IconGalleryView.swift (dev-only in the app). On the web it is
// just the gallery of Karlo's custom PNG marks from /icons, with the places
// each one is used; no app-icon switching.
"use client";

import { AssetIcon } from "@/components/ui";
import { SettingsFrame } from "./components";

type AssetName = Parameters<typeof AssetIcon>[0]["name"];

const SECTIONS: { title: string; entries: { name: AssetName; label: string }[] }[] = [
  { title: "Home screen", entries: [
    { name: "tournament", label: "Tournament name on cards" },
    { name: "premium", label: "Premium upsell card" },
  ] },
  { title: "Live match screen", entries: [
    { name: "correct", label: "Your poll pick — CORRECT" },
    { name: "wrong", label: "Your poll pick — WRONG" },
    { name: "premiumlocked", label: "Premium-locked section" },
  ] },
  { title: "League objectives (live + results)", entries: [
    { name: "dragon", label: "Dragons count" },
    { name: "baren", label: "Barons count" },
    { name: "tower2", label: "Towers count" },
    { name: "inhibitor", label: "Inhibitors count" },
  ] },
  { title: "Notification inbox (one icon per type)", entries: [
    { name: "streakmilestone", label: "Streak milestone" },
    { name: "weeklyreport", label: "Weekly report ready" },
  ] },
  { title: "Comments (match + player pages)", entries: [
    { name: "messages", label: "Open comments (results)" },
    { name: "messages", label: "Comments screens header" },
  ] },
  { title: "Profile drawer & Weekly Report", entries: [
    { name: "premium", label: "Upgrade to Pro row + hero" },
    { name: "weeklyreport", label: "Weekly Report row + screen" },
  ] },
  { title: "Search & News", entries: [
    { name: "tournament", label: "Tournaments section (search)" },
  ] },
  { title: "Results screen", entries: [
    { name: "messages", label: "Match comments button" },
  ] },
];

export function IconGallery() {
  return (
    <SettingsFrame title="Icon Gallery" backHref="/settings">
      <div className="flex flex-col gap-7">
        {SECTIONS.map((s) => (
          <div key={s.title} className="flex flex-col gap-3">
            <span className="t-headline-sm text-primary">{s.title}</span>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
              {s.entries.map((e, i) => (
                <div key={`${e.name}-${i}`} className="flex flex-col items-center gap-2 p-2.5 rounded-[10px] bg-card border border-border-subtle text-center">
                  <span className="h-8 grid place-items-center"><AssetIcon name={e.name} height={32} /></span>
                  <span className="t-label-sm text-secondary">{e.label}</span>
                  <span className="font-mono text-[8px] text-muted truncate w-full">{e.name}.png</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SettingsFrame>
  );
}
