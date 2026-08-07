import { describe, it, expect } from "vitest";
import {
  BUFFER_MINUTES,
  MIN_HEATING_SAMPLES,
  MIN_SOAKS_FOR_PATTERN,
  effectiveHeaterWatts,
  heatingPlan,
  keepWarmVsReheat,
  nextSoakTime,
  observedHeatingRate,
  reachableByC,
  soakPattern,
  soaksPerWeek,
  type TempRow,
} from "../lib/heating";
import {
  NAMEPLATE_HEATER_WATTS,
  equilibriumTempC,
  heatUpHours,
  heatingRateCPerHour,
  standbyKwhPerDay,
} from "../lib/thermal";

const V = 1180; // the user's tub
const P = NAMEPLATE_HEATER_WATTS;
const HOUR = 60 * 60 * 1000;

describe("thermal model — checked against the manufacturer's figure", () => {
  // Lay-Z-Spa publish "1 °C to 1.5 °C per hour" for this model. If the physics
  // didn't reproduce that, every time this feature prints would be wrong.
  it("lands in the published 1–1.5 °C/h band in normal conditions", () => {
    expect(heatingRateCPerHour(20, 15, P, V)).toBeGreaterThan(1);
    expect(heatingRateCPerHour(20, 15, P, V)).toBeLessThan(1.5);
    expect(heatingRateCPerHour(30, 10, P, V)).toBeGreaterThan(1);
    expect(heatingRateCPerHour(30, 10, P, V)).toBeLessThan(1.5);
  });

  it("slows down as the water warms, because more heat leaks away", () => {
    const early = heatingRateCPerHour(15, 10, P, V);
    const late = heatingRateCPerHour(36, 10, P, V);
    expect(late).toBeLessThan(early);
  });

  it("slows down when it's colder outside", () => {
    expect(heatingRateCPerHour(30, 2, P, V)).toBeLessThan(
      heatingRateCPerHour(30, 18, P, V),
    );
  });

  it("takes about fourteen hours from 20 °C on a mild day", () => {
    expect(heatUpHours(20, 38, 15, P, V)).toBeCloseTo(14.3, 0);
  });

  it("takes far longer from cold in winter — the whole point of the feature", () => {
    const winter = heatUpHours(10, 38, 2, P, V)!;
    expect(winter).toBeGreaterThan(20);
    expect(winter).toBeGreaterThan(heatUpHours(10, 38, 15, P, V)!);
  });

  it("returns zero when it's already there, and null when it can't get there", () => {
    expect(heatUpHours(38, 38, 15, P, V)).toBe(0);
    expect(heatUpHours(40, 38, 15, P, V)).toBe(0);
    // A feeble heater against a hard frost simply cannot reach 40 °C.
    expect(heatUpHours(10, 40, -5, 200, V)).toBeNull();
  });

  it("knows the temperature it would eventually settle at", () => {
    const e = equilibriumTempC(10, P, V);
    expect(e).toBeGreaterThan(40); // comfortably above any target in practice
    expect(equilibriumTempC(2, P, V)).toBeLessThan(e);
  });
});

// --- Learning the real rate ---------------------------------------------------
const BASE = new Date("2026-08-06T06:00:00.000Z").getTime();
const row = (hoursIn: number, tempC: number): TempRow => ({
  measured_at: new Date(BASE + hoursIn * HOUR).toISOString(),
  temperature_c: tempC,
});

describe("observedHeatingRate", () => {
  // A steady 1.2 °C/h climb, sampled every hour.
  const climb = Array.from({ length: 8 }, (_, i) => row(i, 18 + i * 1.2));

  it("picks up the tub's actual climb rate from probe history", () => {
    const r = observedHeatingRate(climb);
    expect(r.ratePerHour).toBeCloseTo(1.2, 1);
    expect(r.samples).toBeGreaterThanOrEqual(MIN_HEATING_SAMPLES);
    expect(r.meanWaterC).not.toBeNull();
  });

  it("won't guess from a couple of readings", () => {
    const r = observedHeatingRate([row(0, 18), row(1, 19.2)]);
    expect(r.ratePerHour).toBeNull();
    expect(r.samples).toBeLessThan(MIN_HEATING_SAMPLES);
  });

  it("isn't dragged down by intervals where the heater was only part-on", () => {
    // Same tub, but two gaps where it cycled off and barely moved.
    const patchy = [...climb, row(9, 27.6), row(10, 27.9), row(11, 28.2)];
    const r = observedHeatingRate(patchy);
    // A median would sag towards the lazy intervals; the high percentile
    // reports what the tub can actually do.
    expect(r.ratePerHour).toBeGreaterThan(1);
  });

  it("ignores cooling, sensor glitches and stale gaps", () => {
    const noisy = [
      row(0, 30),
      row(1, 28), // cooling — not a heat-up
      row(2, 60), // 32 °C in an hour is a glitch
      row(20, 20), // gap far too wide to attribute to the heater
    ];
    expect(observedHeatingRate(noisy).ratePerHour).toBeNull();
  });

  it("copes with junk timestamps and missing temperatures", () => {
    const rows: TempRow[] = [
      { measured_at: "not-a-date", temperature_c: 20 },
      { measured_at: new Date(BASE).toISOString(), temperature_c: null },
    ];
    expect(observedHeatingRate(rows).ratePerHour).toBeNull();
  });
});

describe("effectiveHeaterWatts", () => {
  it("falls back to the nameplate figure without enough history", () => {
    const out = effectiveHeaterWatts(
      { ratePerHour: null, samples: 2, meanWaterC: null },
      12,
      V,
    );
    expect(out.watts).toBe(NAMEPLATE_HEATER_WATTS);
    expect(out.measured).toBe(false);
  });

  it("adds back the heat that was leaking away while it climbed", () => {
    // The same climb rate observed on a cold day implies a STRONGER heater
    // than on a warm one, because more was being lost at the time.
    const rate = { ratePerHour: 1.2, samples: 9, meanWaterC: 28 };
    const cold = effectiveHeaterWatts(rate, 2, V);
    const mild = effectiveHeaterWatts(rate, 18, V);
    expect(cold.watts).toBeGreaterThan(mild.watts);
    expect(cold.measured).toBe(true);
  });

  it("keeps a wild observation from producing a wild prediction", () => {
    const silly = { ratePerHour: 2.9, samples: 20, meanWaterC: 35 };
    const out = effectiveHeaterWatts(silly, 20, V);
    expect(out.watts).toBeLessThanOrEqual(NAMEPLATE_HEATER_WATTS * 1.5);
  });

  it("round-trips: power backed out of a rate reproduces that rate", () => {
    const observed = 1.15;
    const { watts } = effectiveHeaterWatts(
      { ratePerHour: observed, samples: 8, meanWaterC: 26 },
      12,
      V,
    );
    expect(heatingRateCPerHour(26, 12, watts, V)).toBeCloseTo(observed, 1);
  });
});

// --- The plan -----------------------------------------------------------------
describe("heatingPlan", () => {
  const readyAt = new Date("2026-08-07T20:00:00.000Z");
  const morning = new Date("2026-08-07T05:00:00.000Z");
  const base = {
    targetC: 38,
    readyAt,
    ambientC: 15,
    watts: P,
    volumeLitres: V,
    now: morning,
  };

  it("works backwards from when you want to get in", () => {
    const plan = heatingPlan({ ...base, currentC: 20 })!;
    expect(plan.switchOnAt).not.toBeNull();
    const leadHours = (readyAt.getTime() - plan.switchOnAt!.getTime()) / HOUR;
    expect(leadHours).toBeCloseTo(plan.hours, 1);
    expect(plan.hours).toBeGreaterThan(14);
    expect(plan.cost).toBeGreaterThan(0);
  });

  it("errs early, because overshooting is free and being late isn't", () => {
    const plan = heatingPlan({ ...base, currentC: 20 })!;
    const bare = heatUpHours(20, 38, 15, P, V)!;
    expect(plan.hours).toBeCloseTo(bare + BUFFER_MINUTES / 60, 1);
  });

  it("says nothing to do when it's already hot enough", () => {
    const plan = heatingPlan({ ...base, currentC: 39 })!;
    expect(plan.alreadyWarmEnough).toBe(true);
    expect(plan.switchOnAt).toBeNull();
    expect(plan.cost).toBe(0);
  });

  it("admits when you've left it too late", () => {
    // Stone cold at lunchtime, wanted for 8pm — not happening.
    const plan = heatingPlan({
      ...base,
      currentC: 12,
      now: new Date("2026-08-07T12:00:00.000Z"),
    })!;
    expect(plan.tooLate).toBe(true);
    expect(plan.shortfallHours).toBeGreaterThan(0);
  });

  it("is not too late when there's plenty of runway", () => {
    const plan = heatingPlan({
      ...base,
      currentC: 33,
      now: new Date("2026-08-07T14:00:00.000Z"),
    })!;
    expect(plan.tooLate).toBe(false);
  });

  it("costs more from colder water", () => {
    const warm = heatingPlan({ ...base, currentC: 30 })!;
    const cold = heatingPlan({ ...base, currentC: 15 })!;
    expect(cold.cost).toBeGreaterThan(warm.cost);
    expect(cold.hours).toBeGreaterThan(warm.hours);
  });

  it("flags a target it simply cannot reach", () => {
    const plan = heatingPlan({
      ...base,
      currentC: 10,
      targetC: 40,
      ambientC: -5,
      watts: 200,
    })!;
    expect(plan.unreachable).toBe(true);
  });

  it("returns null without a current temperature — it won't guess", () => {
    expect(heatingPlan({ ...base, currentC: null })).toBeNull();
  });
});

describe("reachableByC", () => {
  it("says how warm it could get in the time available", () => {
    const got = reachableByC(20, 6, 15, P, V);
    expect(got).toBeGreaterThan(20);
    expect(got).toBeLessThan(38); // six hours isn't enough from 20 °C
  });

  it("approaches equilibrium but never passes it", () => {
    const e = equilibriumTempC(15, P, V);
    expect(reachableByC(20, 500, 15, P, V)).toBeLessThanOrEqual(e + 0.1);
  });
});

// --- Habits --------------------------------------------------------------------
describe("soakPattern", () => {
  const soak = (isoLocal: string) => ({ used_at: new Date(isoLocal).toISOString() });

  it("spots the usual evening and the usual days", () => {
    // Five Friday/Saturday evenings around 8pm.
    const rows = [
      soak("2026-07-03T20:00:00"),
      soak("2026-07-04T20:30:00"),
      soak("2026-07-10T19:30:00"),
      soak("2026-07-11T20:00:00"),
      soak("2026-07-17T20:00:00"),
    ];
    const p = soakPattern(rows)!;
    expect(p.hour).toBeGreaterThanOrEqual(19);
    expect(p.hour).toBeLessThanOrEqual(21);
    expect(p.weekdays).toContain(5); // Friday
    expect(p.soaks).toBe(5);
  });

  it("won't invent a pattern from a couple of soaks", () => {
    expect(soakPattern([soak("2026-07-03T20:00:00")])).toBeNull();
    expect(soakPattern([])).toBeNull();
  });

  it("needs a good run of soaks before it calls itself confident", () => {
    const four = Array.from({ length: MIN_SOAKS_FOR_PATTERN }, (_, i) =>
      soak(`2026-07-0${i + 1}T20:00:00`),
    );
    expect(soakPattern(four)?.confident).toBe(false);
  });
});

describe("nextSoakTime", () => {
  it("picks the next matching day at the usual hour", () => {
    const pattern = { weekdays: [5], hour: 20, soaks: 8, confident: true };
    const wed = new Date("2026-08-05T09:00:00");
    const next = nextSoakTime(pattern, wed);
    expect(next.getDay()).toBe(5);
    expect(next.getHours()).toBe(20);
    expect(next.getTime()).toBeGreaterThan(wed.getTime());
  });

  it("skips today once the usual hour has already gone", () => {
    const pattern = { weekdays: [5], hour: 20, soaks: 8, confident: true };
    const fridayLate = new Date("2026-08-07T22:00:00");
    expect(nextSoakTime(pattern, fridayLate).getTime()).toBeGreaterThan(
      fridayLate.getTime(),
    );
  });

  it("falls back to a sensible evening with no pattern at all", () => {
    const next = nextSoakTime(null, new Date("2026-08-05T09:00:00"));
    expect(next.getHours()).toBe(19);
    expect(next.getTime()).toBeGreaterThan(
      new Date("2026-08-05T09:00:00").getTime(),
    );
  });
});

describe("soaksPerWeek", () => {
  it("works out the rate over the window the log actually covers", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    const rows = Array.from({ length: 8 }, (_, i) => ({
      used_at: new Date(now.getTime() - i * 3.5 * 24 * HOUR).toISOString(),
    }));
    expect(soaksPerWeek(rows, now)).toBeCloseTo(2, 0);
  });

  it("doesn't annualise from a couple of days of data", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    const rows = [{ used_at: new Date(now.getTime() - HOUR).toISOString() }];
    expect(soaksPerWeek(rows, now)).toBe(1);
  });
});

// --- Hold it hot, or let it cool? ----------------------------------------------
describe("keepWarmVsReheat", () => {
  const base = {
    targetC: 38,
    ambientC: 12,
    coolsToC: 16,
    watts: P,
    volumeLitres: V,
  };

  it("tells an occasional user to let it cool", () => {
    const r = keepWarmVsReheat({ ...base, soaksPerWeek: 1 })!;
    expect(r.cheaper).toBe("let_it_cool");
    expect(r.savingWeekly).toBeGreaterThan(0);
  });

  it("tells a frequent user to leave it hot", () => {
    const r = keepWarmVsReheat({ ...base, soaksPerWeek: 6 })!;
    expect(r.cheaper).toBe("keep_warm");
  });

  it("crosses over somewhere sensible in the middle", () => {
    const two = keepWarmVsReheat({ ...base, soaksPerWeek: 2 })!;
    const five = keepWarmVsReheat({ ...base, soaksPerWeek: 5 })!;
    expect(two.cheaper).toBe("let_it_cool");
    expect(five.cheaper).toBe("keep_warm");
    // Standby doesn't care how often you get in; reheating does.
    expect(two.keepWarmWeekly).toBe(five.keepWarmWeekly);
    expect(five.reheatWeekly).toBeGreaterThan(two.reheatWeekly);
  });

  it("costs more to hold when it's colder outside", () => {
    const mild = keepWarmVsReheat({ ...base, soaksPerWeek: 3 })!;
    const cold = keepWarmVsReheat({ ...base, ambientC: 0, soaksPerWeek: 3 })!;
    expect(cold.keepWarmWeekly).toBeGreaterThan(mild.keepWarmWeekly);
  });

  it("has nothing to compare for someone who never gets in", () => {
    expect(keepWarmVsReheat({ ...base, soaksPerWeek: 0 })).toBeNull();
  });

  it("agrees with the standby figure it's built on", () => {
    const r = keepWarmVsReheat({ ...base, soaksPerWeek: 3 })!;
    const expected = standbyKwhPerDay(38, 12, V) * 7 * 0.27;
    expect(r.keepWarmWeekly).toBeCloseTo(expected, 1);
  });
});
