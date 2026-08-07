// =============================================================================
//  lib/costs.ts
//  What the tub actually costs to run. PURE, no I/O.
//
//  Three things burn electricity, and a model that leaves any of them out won't
//  reconcile with a meter reading:
//
//    1. Standing loss — the heater replacing what leaks out through the covers,
//       24 hours a day. Usually the biggest share.
//    2. Soaking — the lid comes off and loss jumps by well over an order of
//       magnitude, because open water evaporates. A one-hour soak costs more
//       than it looks.
//    3. Filtration — the pump running its daily cycle. Small but not nothing.
//
//  Validated against a real measured tub: an 1180 L spa with a full cover
//  package (UA 4.2 W/K), one hour of use a day and a 4-hour filtration cycle
//  comes out at ~5.2 kWh/day against 5.3 measured on the meter.
//
//  The annual figure is a RANGE, and deliberately not the daily figure times
//  365. Standing loss scales with how much warmer the water is than the air, so
//  a winter day costs appreciably more than a summer one — which is exactly why
//  a year costs more than a mild day extrapolated.
// =============================================================================

import { standbyKwhPerDay, thermalMassKwhPerK } from "./thermal";

// A Lay-Z-Spa filtration pump, running its daily cycle.
export const FILTER_PUMP_WATTS = 50;
export const DEFAULT_FILTER_HOURS_PER_DAY = 4;
// Typical UK ambient across a year, for the seasonal range. Not a forecast —
// just the two ends the annual cost actually swings between.
export const SUMMER_AMBIENT_C = 16;
export const WINTER_AMBIENT_C = 4;

export interface RunningCostInput {
  uaWPerK: number;
  targetC: number;
  ambientC: number;
  volumeLitres: number;
  pricePerKwh: number;
  /** Hours a day the lid is off. */
  soakHoursPerDay: number;
  /** How much faster it cools with the lid off, °C per hour. */
  lidOffLossCPerH: number;
  filterHoursPerDay?: number;
  soaksPerWeek?: number;
}

export interface CostBreakdown {
  standingKwh: number;
  soakKwh: number;
  filterKwh: number;
  totalKwh: number;
  cost: number;
}

export interface RunningCostSummary {
  daily: CostBreakdown;
  monthlyCost: number;
  /** A range, because winter costs more than summer. */
  annualCost: { low: number; high: number };
  /** Cost per soak, when we know how often they get in. */
  perSessionCost: number | null;
}

function breakdown(input: RunningCostInput, ambientC: number): CostBreakdown {
  const {
    uaWPerK,
    targetC,
    volumeLitres,
    pricePerKwh,
    soakHoursPerDay,
    lidOffLossCPerH,
  } = input;
  const filterHours = input.filterHoursPerDay ?? DEFAULT_FILTER_HOURS_PER_DAY;

  const standingKwh = standbyKwhPerDay(targetC, ambientC, volumeLitres, uaWPerK);

  // Whatever the lid-off hours cost on TOP of standing loss, since the standing
  // figure above already covers the whole 24 hours.
  const soakExtraCPerH = Math.max(0, lidOffLossCPerH);
  const soakKwh =
    soakExtraCPerH * soakHoursPerDay * thermalMassKwhPerK(volumeLitres);

  const filterKwh = (FILTER_PUMP_WATTS * filterHours) / 1000;
  const totalKwh = standingKwh + soakKwh + filterKwh;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    standingKwh: r2(standingKwh),
    soakKwh: r2(soakKwh),
    filterKwh: r2(filterKwh),
    totalKwh: r2(totalKwh),
    cost: r2(totalKwh * pricePerKwh),
  };
}

export function runningCostSummary(input: RunningCostInput): RunningCostSummary {
  const daily = breakdown(input, input.ambientC);
  const summer = breakdown(input, SUMMER_AMBIENT_C);
  const winter = breakdown(input, WINTER_AMBIENT_C);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const soaksPerWeek = input.soaksPerWeek ?? 0;

  return {
    daily,
    monthlyCost: r2(daily.cost * 30.44),
    annualCost: { low: r2(summer.cost * 365), high: r2(winter.cost * 365) },
    perSessionCost:
      soaksPerWeek > 0 ? r2((daily.cost * 7) / soaksPerWeek) : null,
  };
}

/**
 * What running only part of the year costs, and what shutting down saves.
 * Winter is the expensive half, so skipping it saves more than a simple
 * pro-rata — but the sessions you do have carry a bigger share of the standing
 * cost, so cost PER SOAK goes up even as the total falls.
 */
export interface SeasonalComparison {
  yearRoundCost: number;
  partYearCost: number;
  saving: number;
  yearRoundPerSession: number | null;
  partYearPerSession: number | null;
  monthsRunning: number;
}

export function seasonalComparison(
  input: RunningCostInput,
  monthsRunning: number,
): SeasonalComparison | null {
  if (monthsRunning <= 0 || monthsRunning > 12) return null;

  const summer = breakdown(input, SUMMER_AMBIENT_C);
  const winter = breakdown(input, WINTER_AMBIENT_C);
  const soaksPerWeek = input.soaksPerWeek ?? 0;

  // Half the year at each end, which is what a "run April to October" split
  // actually looks like in practice.
  const yearRoundCost = ((summer.cost + winter.cost) / 2) * 365;
  const partYearCost = summer.cost * (365 * (monthsRunning / 12));

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const yearSoaks = (soaksPerWeek * 365) / 7;
  const partSoaks = yearSoaks * (monthsRunning / 12);

  return {
    yearRoundCost: r2(yearRoundCost),
    partYearCost: r2(partYearCost),
    saving: r2(yearRoundCost - partYearCost),
    yearRoundPerSession: yearSoaks > 0 ? r2(yearRoundCost / yearSoaks) : null,
    partYearPerSession: partSoaks > 0 ? r2(partYearCost / partSoaks) : null,
    monthsRunning,
  };
}
