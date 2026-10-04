// =============================================================================
//  lib/winter.ts
//  Shutting the spa down for the cold months — when to do it, which of the
//  three honest options to take, and what each one actually costs. PURE, no I/O.
//
//  WHY THIS EXISTS
//  A Lay-Z-Spa left full of water with the power off is the classic winter
//  write-off: water expands about 9% as it freezes, which cracks the pump and
//  can tear the drop-stitch seams. It's also the failure the warranty excludes.
//  So the app should get ahead of the first frost rather than react to it.
//
//  THE THREE OPTIONS (all real, all supported here)
//    freeze_shield     Leave it running. The San Francisco's Freeze Shield
//                      circulates and heats to 10 C whenever ambient drops below
//                      6 C, so the water never freezes — but only while it has
//                      mains power AND the filter is running. Zero effort, and
//                      it costs money every day of winter.
//    pack_down         The manufacturer's route, and the one we recommend:
//                      drain, dry thoroughly, deflate, store above 6 C. Costs
//                      nothing all winter, and gets the vinyl out of the frost.
//    drained_in_place  The honest fallback when there is genuinely nowhere to
//                      put it. Removes the catastrophic risk (no water left to
//                      freeze), but cold makes vinyl brittle, so seams can still
//                      split and UV keeps working on it. The pump still comes
//                      indoors — residual water in the pump housing is what
//                      cracks.
//
//  Sources: Lay-Z-Spa UK's winter care and pack-away guidance.
// =============================================================================

import { heatLossAreaM2 } from "./thermal";
import { DEFAULT_ELECTRICITY_PRICE_PER_KWH } from "./water";

// Re-exported so existing callers and tests keep their import path.
export { heatLossAreaM2 };

// Freeze Shield's published behaviour: on below 6 C ambient, heats to 10 C.
export const FREEZE_SHIELD_ON_C = 6;
export const FREEZE_SHIELD_TARGET_C = 10;
// Freeze Shield cycles between roughly 5 and 10 C, so this is what it holds.
const FREEZE_SHIELD_MEAN_WATER_C = 7.5;

// Storage must stay above this or packing down achieves nothing.
export const SAFE_STORAGE_C = 6;

// The card appears this far ahead of the deadline — any earlier and it's clutter
// in midsummer, any later and there's no time to plan a weekend around it.
export const LEAD_IN_DAYS = 90;
// Inside this, the countdown reads "due soon" rather than "plenty of time".
export const DUE_SOON_DAYS = 14;
// How long before the deadline the window opens (a sensible earliest date).
const WINDOW_LENGTH_DAYS = 21;

export type WinterStrategy = "freeze_shield" | "pack_down" | "drained_in_place";

// --- When ---------------------------------------------------------------------
//
// A seasonal model rather than a forecast, because the useful question in August
// is "roughly when", and no forecast reaches that far. The forecast's job is to
// override this when a cold snap actually turns up (see winterCountdown).
//
// Anchored on 55 N — Britain and northern Europe — where first frost lands about
// the end of October, shifting ~2 days per degree of latitude: further north
// freezes earlier, further south later. Reopening is anchored separately, on
// when it's warm enough to want to get in (late April at 55 N), not on the
// mirror image of the shutdown date.
const SHUTDOWN_ANCHOR_LAT = 55;
const SHUTDOWN_ANCHOR_DAY = 304; // 31 October
const REOPEN_ANCHOR_DAY = 115; // 25 April
const DAYS_PER_DEGREE = 2;
// Below this latitude there's no freezing season worth planning around.
const NO_WINTER_BELOW_LAT = 25;
const SOUTHERN_SHIFT_DAYS = 182;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayOfYearToDate(year: number, dayOfYear: number): Date {
  // Deliberately allows overflow/underflow — Date normalises it into the
  // neighbouring year, which is exactly right for a season that straddles
  // New Year.
  return new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * DAY_MS);
}

// Reopening always belongs to the winter it follows, never the one before it.
function reopenAfter(deadline: Date, year: number, reopenDay: number): Date {
  const same = dayOfYearToDate(year, reopenDay);
  return same.getTime() > deadline.getTime()
    ? same
    : dayOfYearToDate(year + 1, reopenDay);
}

const startOfDayUtc = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface WinterWindow {
  /** Earliest sensible date to start — the window opens here. */
  opens: Date;
  /** The date to be done by, before frost is a real risk. */
  deadline: Date;
  /** When it's worth filling it again. */
  reopen: Date;
}

/**
 * The recommended shutdown window and spring reopen date for a location.
 * Returns null where there is no meaningful freezing season.
 */
export function winterWindow(
  latitude: number | null,
  now: Date = new Date(),
): WinterWindow | null {
  if (latitude === null || !Number.isFinite(latitude)) return null;
  if (Math.abs(latitude) < NO_WINTER_BELOW_LAT) return null;

  const southern = latitude < 0;
  const absLat = Math.abs(latitude);

  // Further from the anchor latitude towards the pole -> earlier.
  const shift = (absLat - SHUTDOWN_ANCHOR_LAT) * DAYS_PER_DEGREE;
  let shutdownDay = SHUTDOWN_ANCHOR_DAY - shift;
  let reopenDay = REOPEN_ANCHOR_DAY + shift;
  if (southern) {
    shutdownDay -= SOUTHERN_SHIFT_DAYS;
    reopenDay += SOUTHERN_SHIFT_DAYS;
  }

  // Find the season we are actually IN, which is not the same as the next
  // deadline in the future. Once the deadline passes in November, the right
  // answer all winter is still "you're overdue" — rolling forward to next
  // year's date would make the warning vanish at the exact moment the tub is
  // sitting outside full of water. So a season runs from its deadline through
  // to the following spring, and only then do we move on to the next one.
  const today = startOfDayUtc(now);
  let year = today.getUTCFullYear() - 1;
  let deadline = dayOfYearToDate(year, shutdownDay);
  let reopen = reopenAfter(deadline, year, reopenDay);

  // Advance until this season's reopening is still ahead of us.
  for (let i = 0; i < 4 && reopen.getTime() < today.getTime(); i += 1) {
    year += 1;
    deadline = dayOfYearToDate(year, shutdownDay);
    reopen = reopenAfter(deadline, year, reopenDay);
  }

  return {
    opens: new Date(deadline.getTime() - WINDOW_LENGTH_DAYS * DAY_MS),
    deadline,
    reopen,
  };
}

// --- How urgent ---------------------------------------------------------------
export type WinterStatus = "not_yet" | "ok" | "due_soon" | "overdue";

export interface WinterCountdown {
  /** 1 at the start of the lead-in, 0 at the deadline. Same shape as TaskLife. */
  fractionRemaining: number;
  daysUntil: number;
  status: WinterStatus;
  /** Whether the calendar or an actual cold forecast set the urgency. */
  decidedBy: "calendar" | "forecast";
  /** The forecast low that triggered an escalation, when one did. */
  forecastLowC: number | null;
}

export interface ForecastLike {
  date: string;
  tempMin: number;
}

/**
 * Where we are relative to the window. A forecast showing temperatures near
 * Freeze Shield's threshold overrides the seasonal estimate — the calendar is a
 * guess, a cold snap is a fact.
 */
export function winterCountdown(
  window: WinterWindow | null,
  now: Date = new Date(),
  forecast: ForecastLike[] = [],
): WinterCountdown | null {
  if (!window) return null;

  const today = startOfDayUtc(now);
  const daysUntil = Math.round(
    (window.deadline.getTime() - today.getTime()) / DAY_MS,
  );
  const fractionRemaining = Math.max(0, Math.min(1, daysUntil / LEAD_IN_DAYS));

  const lows = forecast
    .map((f) => f.tempMin)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  const coldest = lows.length > 0 ? Math.min(...lows) : null;
  const forecastCold = coldest !== null && coldest <= FREEZE_SHIELD_ON_C;

  let status: WinterStatus;
  if (daysUntil <= 0) status = "overdue";
  else if (daysUntil <= DUE_SOON_DAYS) status = "due_soon";
  else if (daysUntil <= LEAD_IN_DAYS) status = "ok";
  else status = "not_yet";

  // A cold snap promotes urgency but never demotes it.
  if (forecastCold && status !== "overdue") status = "due_soon";

  return {
    fractionRemaining,
    daysUntil,
    status,
    decidedBy: forecastCold && daysUntil > DUE_SOON_DAYS ? "forecast" : "calendar",
    forecastLowC: forecastCold ? coldest : null,
  };
}

// --- What it costs ------------------------------------------------------------
//
// The whole reason for shutting down is money, so the comparison has to be
// honest about how rough it is. Two things are modelled, both stated:
//
//  1. Heat loss is Q = UA x dT, where UA (W/K) is this tub's own figure —
//     watched by the probe, entered by the owner, or the uninsulated estimate
//     as a last resort (resolveHeatLoss in lib/heating.ts). The caller must
//     pass it in: assuming a bare tub overstated an insulated one several times.
//  2. The answer is a RANGE, not a single figure dressed up as precision: its
//     ends are a mild winter's day and a cold snap.
//
// Packing down costs nothing all winter; its only cost is refilling in spring,
// which lib/water.ts already knows how to price.
// Ambient on a mild winter day vs during a cold snap.
const MILD_WINTER_AMBIENT_C = 5;
const COLD_SNAP_AMBIENT_C = -2;

export interface CostRange {
  low: number;
  high: number;
}

export interface WinterCostComparison {
  days: number;
  /** Keeping Freeze Shield ticking over for the whole winter. */
  freezeShield: CostRange;
  /** Shutting down: nothing all winter, one refill in spring. */
  shutdown: number;
  /** What packing down saves, at both ends of the range. */
  saving: CostRange;
  kwhPerDay: CostRange;
}

export function compareWinterCosts(
  days: number,
  // Heat loss is required: Freeze Shield's cost is almost entirely heat loss,
  // so a bare-tub default overstates it several times for an insulated tub.
  opts: { pricePerKwh?: number; refillCost?: number; uaWPerK: number },
): WinterCostComparison {
  const pricePerKwh = opts.pricePerKwh ?? DEFAULT_ELECTRICITY_PRICE_PER_KWH;
  const ua = opts.uaWPerK;

  const dailyKwh = (ambientC: number): number => {
    const deltaT = Math.max(0, FREEZE_SHIELD_MEAN_WATER_C - ambientC);
    const watts = ua * deltaT;
    return (watts * 24) / 1000;
  };

  const kwhLow = dailyKwh(MILD_WINTER_AMBIENT_C);
  const kwhHigh = dailyKwh(COLD_SNAP_AMBIENT_C);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const freezeShield = {
    low: round2(kwhLow * pricePerKwh * days),
    high: round2(kwhHigh * pricePerKwh * days),
  };
  const shutdown = round2(opts.refillCost ?? 0);

  return {
    days,
    freezeShield,
    shutdown,
    saving: {
      low: round2(Math.max(0, freezeShield.low - shutdown)),
      high: round2(Math.max(0, freezeShield.high - shutdown)),
    },
    kwhPerDay: { low: round2(kwhLow), high: round2(kwhHigh) },
  };
}

/** How many days the tub would be shut down for, given a window. */
export function winterLengthDays(window: WinterWindow): number {
  return Math.max(
    0,
    Math.round((window.reopen.getTime() - window.deadline.getTime()) / DAY_MS),
  );
}

// --- The options, described ---------------------------------------------------
export interface StrategyOption {
  key: WinterStrategy;
  title: string;
  summary: string;
  /** Honest downside — every option has one. */
  catch: string;
  recommended: boolean;
}

export const STRATEGIES: StrategyOption[] = [
  {
    key: "pack_down",
    title: "Pack it away",
    summary:
      "Drain, dry it thoroughly, deflate and store it somewhere above 6 °C. Costs nothing all winter and gets the vinyl out of the frost — this is what Bestway tells you to do.",
    catch:
      "It's an afternoon's work, and you need somewhere to put it. Less room than you'd think: the liner and lid fold down to about the size of a large suitcase and the pump goes back in its box.",
    recommended: true,
  },
  {
    key: "freeze_shield",
    title: "Leave it running",
    summary:
      "Freeze Shield keeps the water moving and warms it to 10 °C whenever it drops below 6 °C outside, so nothing freezes. No work at all, and you can use it on a clear winter day.",
    catch:
      "You pay for it every day of the winter, and it only protects the tub while it has power and the filter is running — a tripped socket during a cold snap is how pumps crack.",
    recommended: false,
  },
  {
    key: "drained_in_place",
    title: "Drain it, leave it there",
    summary:
      "Empty and dry it but leave it standing. Nothing left to freeze, nothing to store, and no running cost.",
    catch:
      "Cold makes vinyl brittle, so seams can still split, and UV keeps working on it — you're trading tub lifespan for storage space. The pump still has to come indoors: it's the water left in the pump housing that cracks it.",
    recommended: false,
  },
];

export function strategy(key: WinterStrategy): StrategyOption {
  return STRATEGIES.find((s) => s.key === key) ?? STRATEGIES[0];
}

// --- Hibernation --------------------------------------------------------------
//
// Once the tub is packed away, "Test the water — 2 days overdue" every morning is
// noise, and noise is how an app gets muted. But a tub that's still outdoors is
// still at risk, so frost warnings survive hibernation while routine nagging
// doesn't.
export interface HibernationState {
  /** Packed away or drained: routine reminders go quiet. */
  hibernating: boolean;
  /** Chose Freeze Shield: the tub stays full and live, so nothing goes quiet. */
  keepingItRunning: boolean;
  strategy: WinterStrategy | null;
  since: Date | null;
  /** Still outside, so still worth a frost warning. */
  stillOutdoors: boolean;
  reopen: Date | null;
}

export function hibernationState(
  winterisedAt: string | null,
  winterStrategy: string | null,
  window: WinterWindow | null,
): HibernationState {
  const since = winterisedAt ? new Date(winterisedAt) : null;
  const valid = since !== null && Number.isFinite(since.getTime());
  const key = STRATEGIES.some((s) => s.key === winterStrategy)
    ? (winterStrategy as WinterStrategy)
    : null;

  // Freeze Shield isn't hibernation at all: the tub is full, live and can be
  // used, so its water needs testing and dosing like any other week. Treating
  // it as hibernation silenced every reminder for the whole winter.
  const keepingItRunning = valid && key === "freeze_shield";
  const hibernating = valid && !keepingItRunning;

  return {
    hibernating,
    keepingItRunning,
    strategy: key,
    since: valid ? since : null,
    stillOutdoors: hibernating && key !== "pack_down",
    reopen: window?.reopen ?? null,
  };
}
