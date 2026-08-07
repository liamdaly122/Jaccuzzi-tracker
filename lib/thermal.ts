// =============================================================================
//  lib/thermal.ts
//  The heat physics shared by the winter cost model and the heating scheduler.
//  PURE, no I/O.
//
//  One tub, one set of numbers. These used to live privately inside
//  lib/winter.ts, which was fine while only the Freeze-Shield cost estimate
//  needed them — but the heating scheduler needs exactly the same heat-loss
//  term, and two copies would eventually disagree.
//
//  The model treats the spa as a lumped mass losing heat through its surface:
//
//      dT/dt = ( P - U·A·(T - Tambient) ) / (m·c)
//
//  P is the heater, U·A the heat-loss coefficient, m·c the thermal mass. The
//  useful consequence is that heating SLOWS as the water warms, because the
//  loss term grows — a flat "1.5 °C per hour" overstates the back end of every
//  heat-up. This has a closed-form solution (see heatUpHours), so nothing here
//  needs numerical integration.
//
//  Validated against the manufacturer's published figure: at 2.05 kW this
//  predicts 0.9-1.6 °C/h across realistic UK conditions, and Lay-Z-Spa quote
//  "1 °C to 1.5 °C per hour" for this model.
// =============================================================================

import { SPECIFIC_HEAT_KJ_PER_KG_K } from "./water";

// A bare air-filled vinyl wall with the standard cover on — the last-resort
// fallback for a tub we know nothing about. It is a poor description of an
// insulated one: a full cover package measures nearer 0.5 W/m2K, which is a
// FIVE-fold difference in every heat-loss figure the app prints. Prefer a
// measured UA whenever there is one (see heatLossFromStandingLoss).
export const DEFAULT_U_VALUE_W_PER_M2K = 3;

// Water depth at a typical fill, used to infer the tub's shape from its volume.
const TYPICAL_FILL_DEPTH_M = 0.55;

// Nameplate heater power for a UK 13 A Lay-Z-Spa. Used only until the app has
// watched enough real heat-ups to work out the tub's actual figure.
export const NAMEPLATE_HEATER_WATTS = 2050;

/**
 * Heat-loss surface area (top, walls and base) implied by a tub's water volume,
 * assuming a square tub at typical fill depth. Derived from volume rather than
 * hard-coded dimensions so this works for any spa, not just this one.
 */
export function heatLossAreaM2(volumeLitres: number): number {
  const volumeM3 = volumeLitres / 1000;
  const footprint = volumeM3 / TYPICAL_FILL_DEPTH_M;
  const side = Math.sqrt(footprint);
  return footprint * 2 + 4 * side * TYPICAL_FILL_DEPTH_M;
}

/**
 * Watts lost per degree the water sits above its surroundings — "UA".
 *
 * UA is the primitive the physics actually needs, and the one to store. A
 * U-value alone is ambiguous because it is coupled to whichever surface area
 * was assumed; UA is measurable straight off a cooling curve with no area
 * estimate at all.
 */
export function defaultHeatLossPerKelvin(volumeLitres: number): number {
  return DEFAULT_U_VALUE_W_PER_M2K * heatLossAreaM2(volumeLitres);
}

/**
 * Turn a measured standing loss into UA: "the water drops X °C an hour with the
 * lid on, when it's Y degrees warmer than the air".
 *
 * This is how a real insulation figure gets into the model — from a measurement
 * of the tub, rather than a manufacturer's claim about a cover.
 */
export function heatLossFromStandingLoss(
  ratePerHourC: number,
  deltaTK: number,
  volumeLitres: number,
): number | null {
  if (!(ratePerHourC > 0) || !(deltaTK > 0) || !(volumeLitres > 0)) return null;
  const watts = ratePerHourC * thermalMassKwhPerK(volumeLitres) * 1000;
  return watts / deltaTK;
}

/** The U-value a given UA implies, for display only — never for calculation. */
export function impliedUValue(uaWPerK: number, volumeLitres: number): number {
  return uaWPerK / heatLossAreaM2(volumeLitres);
}

/** Energy needed to lift the whole tub by one degree, in kWh. */
export function thermalMassKwhPerK(volumeLitres: number): number {
  return (volumeLitres * SPECIFIC_HEAT_KJ_PER_KG_K) / 3600;
}

/**
 * The temperature the water would eventually settle at with the heater running
 * flat out. Above this the heater simply cannot win, which is the honest answer
 * for an uninsulated tub in a hard frost.
 */
export function equilibriumTempC(
  ambientC: number,
  watts: number,
  uaWPerK: number,
): number {
  return ambientC + watts / uaWPerK;
}

/** Instantaneous climb rate in °C per hour at a given water temperature. */
export function heatingRateCPerHour(
  waterC: number,
  ambientC: number,
  watts: number,
  volumeLitres: number,
  uaWPerK: number = defaultHeatLossPerKelvin(volumeLitres),
): number {
  const netWatts = watts - uaWPerK * (waterC - ambientC);
  return netWatts / 1000 / thermalMassKwhPerK(volumeLitres);
}

/**
 * Hours to get from one temperature to another, integrating the falling rate:
 *
 *     t = (m·c / U·A) · ln[ (E - T0) / (E - T1) ]      where E is equilibrium
 *
 * Returns null when the target is unreachable in these conditions rather than
 * an absurd number of hours — "you can't get there" is the useful answer.
 */
export function heatUpHours(
  fromC: number,
  toC: number,
  ambientC: number,
  watts: number,
  volumeLitres: number,
  uaWPerK: number = defaultHeatLossPerKelvin(volumeLitres),
): number | null {
  if (!Number.isFinite(fromC) || !Number.isFinite(toC)) return null;
  if (toC <= fromC) return 0;
  if (watts <= 0 || volumeLitres <= 0 || uaWPerK <= 0) return null;

  const equilibrium = equilibriumTempC(ambientC, watts, uaWPerK);
  // A hair below the ceiling takes infinitely long, so treat it as unreachable.
  if (toC >= equilibrium) return null;

  const uaKw = uaWPerK / 1000;
  const hours =
    (thermalMassKwhPerK(volumeLitres) / uaKw) *
    Math.log((equilibrium - fromC) / (equilibrium - toC));

  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/** Energy the heater burns over a continuous run of this many hours. */
export function heatUpKwh(hours: number, watts: number): number {
  return (watts / 1000) * hours;
}

/**
 * Energy per day to hold the water at temperature — the heater only has to
 * replace what leaks out, so this is pure heat loss with no heating term.
 */
export function standbyKwhPerDay(
  holdAtC: number,
  ambientC: number,
  volumeLitres: number,
  uaWPerK: number = defaultHeatLossPerKelvin(volumeLitres),
): number {
  const watts = Math.max(0, uaWPerK * (holdAtC - ambientC));
  return (watts * 24) / 1000;
}
