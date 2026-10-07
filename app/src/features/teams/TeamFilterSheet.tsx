// TeamFilterSheet — TeamsView.swift's TeamFilterSheet: Tier segment,
// Region tabs, Sort by segment. Reset / Done in the header, "Apply Filters"
// at the foot.
"use client";

import { useEffect, useState } from "react";
import { FilterChip, FilterRow, FilterSegment, PrimaryButton, Sheet } from "@/components/ui";
import { TEAM_SORT_OPTIONS, teamRegionsForGame, type TeamSortOption } from "./types";

type TierValue = 0 | 1 | 2 | 3;   // 0 = All

export function TeamFilterSheet({ open, onClose, game, tier, region, sort, onApply }: {
  open: boolean;
  onClose: () => void;
  game: string;
  tier: number | null;
  region: string | null;
  sort: TeamSortOption;
  onApply: (tier: number | null, region: string | null, sort: TeamSortOption) => void;
}) {
  const [tempTier, setTempTier] = useState<TierValue>((tier ?? 0) as TierValue);
  const [tempRegion, setTempRegion] = useState<string | null>(region);
  const [tempSort, setTempSort] = useState<TeamSortOption>(sort);
  useEffect(() => { if (open) { setTempTier((tier ?? 0) as TierValue); setTempRegion(region); setTempSort(sort); } }, [open, tier, region, sort]);

  const regions = teamRegionsForGame(game);
  const apply = () => { onApply(tempTier === 0 ? null : tempTier, tempRegion, tempSort); onClose(); };

  return (
    <Sheet open={open} onClose={onClose} title="Filter Teams" trailing={<button type="button" onClick={apply} className="t-label-lg text-violet">Done</button>}>
      <div className="flex justify-start -mt-1 mb-1">
        <button type="button" onClick={() => { setTempTier(0); setTempRegion(null); setTempSort("Ranking"); }} className="t-label-lg text-violet">Reset</button>
      </div>
      <FilterRow title="Tier">
        <FilterSegment<TierValue>
          options={[{ label: "All", value: 0 }, { label: "Tier 1", value: 1 }, { label: "Tier 2", value: 2 }, { label: "Tier 3", value: 3 }]}
          value={tempTier}
          onChange={setTempTier}
        />
      </FilterRow>
      <FilterRow title="Region">
        <div className="flex items-end gap-[22px] overflow-x-auto no-scrollbar">
          {["All", ...regions].map((r) => (
            <FilterChip key={r} label={r} selected={r === "All" ? tempRegion === null : tempRegion === r} onClick={() => setTempRegion(r === "All" ? null : r)} />
          ))}
        </div>
      </FilterRow>
      <FilterRow title="Sort by">
        <FilterSegment<TeamSortOption> options={TEAM_SORT_OPTIONS.map((o) => ({ label: o, value: o }))} value={tempSort} onChange={setTempSort} />
      </FilterRow>
      <PrimaryButton onClick={apply} className="w-full mt-5 !rounded-xl !py-3.5 bg-violet-gradient">Apply Filters</PrimaryButton>
    </Sheet>
  );
}
