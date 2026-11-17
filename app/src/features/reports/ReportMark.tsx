// reports/ReportMark.tsx — the weekly report's own glyph, tinted violet on a
// surface tile (iOS WeeklyReportView.swift ReportMark): the Premium tab's
// icon style (Players, Teams, Stat Alerts). The Premium tab's Weekly Report
// row and the report screen's header both use it (Nov 5 §10).
import { withBase } from "@/lib/base-path";
import { clsx } from "@/lib/format";

/** The report glyph alone, in the current text colour (a template image, like the app's). */
export function ReportGlyph({ size = 18, className }: { size?: number; className?: string }) {
  const mask = `url(${withBase("/icons/weeklyreport.png")})`;
  return (
    <span
      aria-hidden
      className={clsx("block bg-current shrink-0", className)}
      style={{ width: size, height: size, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }}
    />
  );
}

/** The glyph in violet on a surface tile (corner radius 28% of the tile). */
export function ReportMark({ tile = 32, glyph = 18, className }: { tile?: number; glyph?: number; className?: string }) {
  return (
    <span aria-hidden className={clsx("grid place-items-center bg-surface text-violet shrink-0", className)} style={{ width: tile, height: tile, borderRadius: tile * 0.28 }}>
      <ReportGlyph size={glyph} />
    </span>
  );
}
