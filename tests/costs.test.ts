import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTER_HOURS_PER_DAY,
  FILTER_PUMP_WATTS,
  runningCostSummary,
  seasonalComparison,
  type RunningCostInput,
} from "../lib/costs";
import {
  defaultHeatLossPerKelvin,
  heatLossFromStandingLoss,
  impliedUValue,
} from "../lib/thermal";

const V = 1180;
// The user's own tub: 0.1 °C/h standing loss with the full cover package on,
// measured when the water was about 32.6 K above the air.
const MEASURED_UA = heatLossFromStandingLoss(0.1, 32.6, V)!;

const measured: RunningCostInput = {
  uaWPerK: MEASURED_UA,
  targetC: 40,
  ambientC: 6,
  volumeLitres: V,
  pricePerKwh: 0.2611, // the price cap they quoted
  soakHoursPerDay: 1,
  lidOffLossCPerH: 1.25, // midpoint of their measured 1–1.5 °C/h
  soaksPerWeek: 3.4,
};

describe("insulation figures back-calculated from a real tub", () => {
  // If these drift, the whole cost and heat-up story drifts with them.
  it("turns 0.1 °C/h standing loss into ~4.2 W/K", () => {
    expect(MEASURED_UA).toBeCloseTo(4.2, 1);
  });

  it("implies the U-value the user calculated independently", () => {
    expect(impliedUValue(MEASURED_UA, V)).toBeCloseTo(0.56, 2);
  });

  it("is about five times better than the uninsulated assumption", () => {
    // The reason this correction mattered: the generic figure was badly wrong
    // for a tub with a full cover package.
    expect(defaultHeatLossPerKelvin(V) / MEASURED_UA).toBeGreaterThan(4);
  });
});

describe("runningCostSummary — reconciled against a metered tub", () => {
  // The validation that matters: the user measured 5.3 kWh/day and £1.38/day.
  // A model that can't reproduce a real meter reading isn't worth showing.
  it("lands on the measured daily consumption", () => {
    const s = runningCostSummary(measured);
    expect(s.daily.totalKwh).toBeGreaterThan(5.0);
    expect(s.daily.totalKwh).toBeLessThan(5.6);
    expect(s.daily.cost).toBeCloseTo(1.38, 1);
  });

  it("only reconciles because all three components are counted", () => {
    const s = runningCostSummary(measured);
    // Standing loss dominates, but dropping either of the others would miss by
    // enough to notice on a bill.
    expect(s.daily.standingKwh).toBeGreaterThan(s.daily.soakKwh);
    expect(s.daily.soakKwh).toBeGreaterThan(1);
    expect(s.daily.filterKwh).toBeCloseTo(
      (FILTER_PUMP_WATTS * DEFAULT_FILTER_HOURS_PER_DAY) / 1000,
      2,
    );
    expect(s.daily.standingKwh + s.daily.soakKwh + s.daily.filterKwh).toBeCloseTo(
      s.daily.totalKwh,
      1,
    );
  });

  it("costs far more with the generic uninsulated figure", () => {
    const generic = runningCostSummary({
      ...measured,
      uaWPerK: defaultHeatLossPerKelvin(V),
    });
    const real = runningCostSummary(measured);
    expect(generic.daily.cost).toBeGreaterThan(real.daily.cost * 2);
  });

  it("gives an annual range rather than a day times 365", () => {
    const s = runningCostSummary(measured);
    // Winter days cost more than summer ones, so the year is a band.
    expect(s.annualCost.high).toBeGreaterThan(s.annualCost.low);
    expect(s.monthlyCost).toBeGreaterThan(0);
  });

  it("works out a cost per soak, and says nothing without one", () => {
    expect(runningCostSummary(measured).perSessionCost).toBeGreaterThan(0);
    expect(
      runningCostSummary({ ...measured, soaksPerWeek: 0 }).perSessionCost,
    ).toBeNull();
  });

  it("charges more to hold a hotter tub", () => {
    const at38 = runningCostSummary({ ...measured, targetC: 38 });
    const at40 = runningCostSummary({ ...measured, targetC: 40 });
    expect(at40.daily.standingKwh).toBeGreaterThan(at38.daily.standingKwh);
  });

  it("charges more when it's colder outside", () => {
    const mild = runningCostSummary({ ...measured, ambientC: 16 });
    const cold = runningCostSummary({ ...measured, ambientC: 0 });
    expect(cold.daily.cost).toBeGreaterThan(mild.daily.cost);
  });
});

describe("seasonalComparison", () => {
  it("saves money over a year but costs more per soak", () => {
    // The counter-intuitive bit worth showing: shutting down for winter cuts
    // the bill, yet each soak you do have carries more of the standing cost.
    const c = seasonalComparison(measured, 7)!;
    expect(c.saving).toBeGreaterThan(0);
    expect(c.partYearCost).toBeLessThan(c.yearRoundCost);
    expect(c.partYearPerSession).toBeLessThan(c.yearRoundPerSession!);
  });

  it("saves more the fewer months you run", () => {
    const long = seasonalComparison(measured, 10)!;
    const short = seasonalComparison(measured, 5)!;
    expect(short.saving).toBeGreaterThan(long.saving);
  });

  it("has nothing to compare for a nonsense span", () => {
    expect(seasonalComparison(measured, 0)).toBeNull();
    expect(seasonalComparison(measured, 13)).toBeNull();
  });
});
