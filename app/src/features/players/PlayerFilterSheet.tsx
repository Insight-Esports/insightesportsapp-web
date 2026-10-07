// PlayerFilterSheet — PlayerFilterSheetView.swift: Role + Region rows of
// underline tabs, Reset / Done in the header, "Apply Filters" at the foot.
"use client";

import { useEffect, useState } from "react";
import { FilterChip, FilterRow, PrimaryButton, Sheet } from "@/components/ui";

export function PlayerFilterSheet({ open, onClose, roles, regions, role, region, onApply }: {
  open: boolean;
  onClose: () => void;
  roles: string[];
  regions: string[];
  role: string | null;
  region: string | null;
  onApply: (role: string | null, region: string | null) => void;
}) {
  const [tempRole, setTempRole] = useState<string | null>(role);
  const [tempRegion, setTempRegion] = useState<string | null>(region);
  useEffect(() => { if (open) { setTempRole(role); setTempRegion(region); } }, [open, role, region]);

  const apply = () => { onApply(tempRole, tempRegion); onClose(); };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter Players"
      trailing={<button type="button" onClick={apply} className="t-label-lg text-violet">Done</button>}
    >
      <div className="flex justify-start -mt-1 mb-1">
        <button type="button" onClick={() => { setTempRole(null); setTempRegion(null); }} className="t-label-lg text-violet">Reset</button>
      </div>
      <FilterRow title="Role">
        <div className="flex items-end gap-[22px] overflow-x-auto no-scrollbar">
          {["All", ...roles].map((r) => (
            <FilterChip key={r} label={r} selected={r === "All" ? tempRole === null : tempRole === r} onClick={() => setTempRole(r === "All" ? null : r)} />
          ))}
        </div>
      </FilterRow>
      <FilterRow title="Region">
        <div className="flex items-end gap-[22px] overflow-x-auto no-scrollbar">
          {["All", ...regions].map((r) => (
            <FilterChip key={r} label={r} selected={r === "All" ? tempRegion === null : tempRegion === r} onClick={() => setTempRegion(r === "All" ? null : r)} />
          ))}
        </div>
      </FilterRow>
      <PrimaryButton onClick={apply} className="w-full mt-5 !rounded-xl !py-3.5 bg-violet-gradient">Apply Filters</PrimaryButton>
    </Sheet>
  );
}
