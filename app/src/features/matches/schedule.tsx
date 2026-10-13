// features/matches/schedule.tsx — ScheduleView + CalendarScheduleView as one
// screen at /schedule?game=&date=. The calendar (month grid on desktop, day
// strip on phones, month grid on demand) picks a day; that day's fixtures
// and results sit beside it. Consumes Home's pendingScheduleGame handoff.
"use client";
import { useSearchParams } from "next/navigation";
import { useGameParam } from "./shared";
import { CalendarPhone, SchedulePhone } from "./schedule-phone";


export function ScheduleScreen() {
  const params0 = useSearchParams();
  const [game0, setGame0] = useGameParam();
  // One structure on every width (the app's): Upcoming | Results picker, the
  // calendar behind the toolbar icon. Cards go left → right on wide screens.
  return params0.get("view") === "calendar" ? <CalendarPhone game={game0} /> : <SchedulePhone game={game0} setGame={setGame0} />;
}
