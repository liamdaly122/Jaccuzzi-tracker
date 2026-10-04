// =============================================================================
//  lib/clock.ts
//  The tub is in the UK but the server runs on UTC, so a time the server
//  formats would read an hour early all summer, and wouldn't match what the
//  phone draws when the page comes alive. Anything shown as a date or clock
//  time goes through here first.
// =============================================================================

export const APP_TIME_ZONE = "Europe/London";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * A Date whose own fields read as UK wall-clock time, for date-fns `format`.
 * Display only: never do arithmetic with the result.
 */
export function ukClock(d: Date | string | number): Date {
  const parts = PARTS.formatToParts(new Date(d));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
