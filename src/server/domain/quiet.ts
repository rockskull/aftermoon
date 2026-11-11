import { addDays, dateKeyToMs, seoulParts, toDateKey } from "@/lib/dates";

/** No pushes between 22:00 and 09:00 KST; anything created then waits until 09:00. */
const QUIET_START = 22;
const QUIET_END = 9;

export function deliveryTime(now: number): number {
  const hour = seoulParts(now).hour;
  if (hour >= QUIET_END && hour < QUIET_START) return now;
  const day = hour >= QUIET_START ? addDays(toDateKey(now), 1) : toDateKey(now);
  return dateKeyToMs(day) + QUIET_END * 3_600_000;
}
