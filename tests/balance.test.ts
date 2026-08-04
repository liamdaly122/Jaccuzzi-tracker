import { describe, it, expect } from "vitest";
import {
  ASSUMED_TEMP_C,
  computeLsi,
  interpretLsi,
  latestCalciumForFill,
  lsiSeries,
  saturationPh,
  temperatureTerm,
  type CalciumReadingLike,
} from "../lib/balance";

// Worked examples computed straight from the published formula:
//   pHs = (9.3 + A + B) - (C + D)
// Each was calculated by hand before the code existed, so these assertions are
// checking the implementation, not just restating whatever it happens to output.
describe("computeLsi — worked examples", () => {
  it("well-balanced spa water sits near zero", () => {
    // pH 7.5, TA 100, calcium 250, 38 °C:
    // A 0.2 · B 1.8422 · C 1.9979 · D 2.0  ->  pHs 7.344, LSI +0.16
    expect(
      computeLsi({
        ph: 7.5,
        alkalinityPpm: 100,
        calciumHardnessPpm: 250,
        temperatureC: 38,
      }),
    ).toBeCloseTo(0.16, 2);
  });

  it("soft tap water straight from the mains reads strongly corrosive", () => {
    // pH 7.2, TA 60, calcium 40, 38 °C -> pHs 8.362, LSI -1.16
    expect(
      computeLsi({
        ph: 7.2,
        alkalinityPpm: 60,
        calciumHardnessPpm: 40,
        temperatureC: 38,
      }),
    ).toBeCloseTo(-1.16, 2);
  });

  it("high pH, high alkalinity, hard water reads strongly scaling", () => {
    // pH 8.0, TA 150, calcium 400, 40 °C -> pHs 6.927, LSI +1.07
    expect(
      computeLsi({
        ph: 8.0,
        alkalinityPpm: 150,
        calciumHardnessPpm: 400,
        temperatureC: 40,
      }),
    ).toBeCloseTo(1.07, 2);
  });

  it("the same water is more scale-forming hot than cold", () => {
    const cold = computeLsi({
      ph: 7.5,
      alkalinityPpm: 100,
      calciumHardnessPpm: 250,
      temperatureC: 25,
    })!;
    const hot = computeLsi({
      ph: 7.5,
      alkalinityPpm: 100,
      calciumHardnessPpm: 250,
      temperatureC: 38,
    })!;
    // This is the whole reason a hot tub scales where a pool wouldn't.
    expect(cold).toBeCloseTo(-0.09, 2);
    expect(hot).toBeGreaterThan(cold);
  });

  it("moves one-for-one with pH", () => {
    const base = { alkalinityPpm: 100, calciumHardnessPpm: 250, temperatureC: 38 };
    const low = computeLsi({ ...base, ph: 7.2 })!;
    const high = computeLsi({ ...base, ph: 7.8 })!;
    expect(high - low).toBeCloseTo(0.6, 2);
  });

  it("is barely moved by the TDS assumption", () => {
    // Documented in lib/balance.ts as "under 0.06 across 500-2000 ppm" — the
    // reason it's safe to assume rather than measure.
    const base = {
      ph: 7.5,
      alkalinityPpm: 100,
      calciumHardnessPpm: 250,
      temperatureC: 38,
    };
    const lowTds = computeLsi({ ...base, tdsPpm: 500 })!;
    const highTds = computeLsi({ ...base, tdsPpm: 2000 })!;
    expect(Math.abs(lowTds - highTds)).toBeLessThan(0.07);
  });
});

describe("temperatureTerm / saturationPh", () => {
  it("falls as water gets hotter, which is what pushes LSI up", () => {
    expect(temperatureTerm(25)).toBeCloseTo(2.0854, 3);
    expect(temperatureTerm(38)).toBeCloseTo(1.8422, 3);
    expect(temperatureTerm(40)).toBeLessThan(temperatureTerm(38));
  });

  it("gives the pH at which water is exactly saturated", () => {
    expect(saturationPh(100, 250, 38)).toBeCloseTo(7.344, 2);
    // Water sitting exactly at its saturation pH has an LSI of zero.
    expect(
      computeLsi({
        ph: saturationPh(100, 250, 38),
        alkalinityPpm: 100,
        calciumHardnessPpm: 250,
        temperatureC: 38,
      }),
    ).toBeCloseTo(0, 2);
  });
});

describe("computeLsi — refuses to guess", () => {
  const full = {
    ph: 7.5,
    alkalinityPpm: 100,
    calciumHardnessPpm: 250,
    temperatureC: 38,
  };

  it("returns null when any single input is missing", () => {
    // An index built on an invented number would be worse than no index.
    expect(computeLsi({ ...full, ph: null })).toBeNull();
    expect(computeLsi({ ...full, alkalinityPpm: null })).toBeNull();
    expect(computeLsi({ ...full, calciumHardnessPpm: null })).toBeNull();
    expect(computeLsi({ ...full, temperatureC: null })).toBeNull();
  });

  it("returns null for values the logarithms can't take", () => {
    expect(computeLsi({ ...full, alkalinityPpm: 0 })).toBeNull();
    expect(computeLsi({ ...full, calciumHardnessPpm: 0 })).toBeNull();
    expect(computeLsi({ ...full, alkalinityPpm: -50 })).toBeNull();
    expect(computeLsi({ ...full, tdsPpm: 0 })).toBeNull();
    expect(computeLsi({ ...full, temperatureC: -300 })).toBeNull();
    expect(computeLsi({ ...full, ph: Number.NaN })).toBeNull();
  });
});

describe("interpretLsi — bands and advice", () => {
  it("names each band", () => {
    expect(interpretLsi(-1.2).band).toBe("corrosive");
    expect(interpretLsi(-0.4).band).toBe("slightly-corrosive");
    expect(interpretLsi(0).band).toBe("balanced");
    expect(interpretLsi(0.4).band).toBe("slightly-scaling");
    expect(interpretLsi(1.0).band).toBe("scaling");
  });

  it("treats the band edges themselves as still balanced / still mild", () => {
    expect(interpretLsi(0.3).band).toBe("balanced");
    expect(interpretLsi(-0.3).band).toBe("balanced");
    expect(interpretLsi(0.31).band).toBe("slightly-scaling");
    expect(interpretLsi(-0.31).band).toBe("slightly-corrosive");
    expect(interpretLsi(0.5).band).toBe("slightly-scaling");
    expect(interpretLsi(-0.5).band).toBe("slightly-corrosive");
    expect(interpretLsi(0.51).band).toBe("scaling");
    expect(interpretLsi(-0.51).band).toBe("corrosive");
  });

  it("escalates severity as the water gets further from balanced", () => {
    expect(interpretLsi(0).severity).toBe("info");
    expect(interpretLsi(0.4).severity).toBe("medium");
    expect(interpretLsi(0.9).severity).toBe("high");
    expect(interpretLsi(-0.4).severity).toBe("medium");
    expect(interpretLsi(-0.9).severity).toBe("high");
  });

  it("never tells you to reduce calcium — you can't, short of draining", () => {
    for (const lsi of [0.4, 0.8, 1.5]) {
      const actions = interpretLsi(lsi).actions.join(" ").toLowerCase();
      expect(actions).not.toMatch(/lower.*calcium|reduce.*calcium|drop.*calcium/);
    }
  });

  it("leads with pH when scaling — the biggest, easiest lever", () => {
    expect(interpretLsi(0.9).actions[0]).toMatch(/pH/);
    expect(interpretLsi(0.4).actions[0]).toMatch(/pH/);
  });

  it("leads with calcium when corrosive — that's what the water is short of", () => {
    expect(interpretLsi(-0.9).actions[0]).toMatch(/calcium/i);
    expect(interpretLsi(-0.4).actions[0]).toMatch(/calcium/i);
  });

  it("has nothing to nag about when balanced", () => {
    expect(interpretLsi(0.1).actions).toHaveLength(0);
  });
});

// --- Occasional calcium readings --------------------------------------------
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-04T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const calcReading = (
  ago: number,
  calcium: number | string | null,
): CalciumReadingLike => ({
  recorded_at: daysAgo(ago),
  calcium_hardness_ppm: calcium,
});

describe("latestCalciumForFill", () => {
  it("uses the most recent reading that actually has a calcium value", () => {
    const found = latestCalciumForFill(
      [calcReading(10, 180), calcReading(3, 220), calcReading(1, null)],
      daysAgo(30),
      NOW,
    );
    expect(found?.valuePpm).toBe(220);
    expect(found?.ageDays).toBe(3);
  });

  it("NEVER carries a reading across a drain — that water no longer exists", () => {
    // Strip test 20 days ago said 240 ppm; the tub was drained 10 days ago.
    // Fresh tap water has whatever hardness it has — the old number is not it.
    const found = latestCalciumForFill(
      [calcReading(20, 240)],
      daysAgo(10),
      NOW,
    );
    expect(found).toBeNull();
  });

  it("keeps a reading taken after the refill", () => {
    const found = latestCalciumForFill(
      [calcReading(20, 240), calcReading(5, 90)],
      daysAgo(10),
      NOW,
    );
    expect(found?.valuePpm).toBe(90);
  });

  it("counts a reading taken at the moment of the refill", () => {
    const found = latestCalciumForFill([calcReading(10, 110)], daysAgo(10), NOW);
    expect(found?.valuePpm).toBe(110);
  });

  it("accepts every reading when the tub has never been drained", () => {
    expect(latestCalciumForFill([calcReading(40, 150)], null, NOW)?.valuePpm).toBe(
      150,
    );
  });

  it("returns null when calcium has never been measured", () => {
    expect(
      latestCalciumForFill(
        [calcReading(2, null), calcReading(5, "")],
        daysAgo(30),
        NOW,
      ),
    ).toBeNull();
  });

  it("parses numeric strings from Postgres and rejects junk", () => {
    expect(
      latestCalciumForFill([calcReading(1, "205.5")], null, NOW)?.valuePpm,
    ).toBe(205.5);
    expect(latestCalciumForFill([calcReading(1, "n/a")], null, NOW)).toBeNull();
    expect(latestCalciumForFill([calcReading(1, 0)], null, NOW)).toBeNull();
    expect(
      latestCalciumForFill(
        [{ recorded_at: "not-a-date", calcium_hardness_ppm: 200 }],
        null,
        NOW,
      ),
    ).toBeNull();
  });

  it("reports the reading's age so the UI can say how stale it is", () => {
    expect(latestCalciumForFill([calcReading(0, 200)], null, NOW)?.ageDays).toBe(0);
    expect(latestCalciumForFill([calcReading(45, 200)], null, NOW)?.ageDays).toBe(
      45,
    );
  });
});

// --- LSI over time -----------------------------------------------------------
describe("lsiSeries", () => {
  const readings = [
    {
      recorded_at: daysAgo(6),
      ph: 7.4,
      total_alkalinity_ppm: 100,
      calcium_hardness_ppm: null,
    },
    {
      recorded_at: daysAgo(4),
      ph: 7.5,
      total_alkalinity_ppm: 100,
      calcium_hardness_ppm: 250,
    },
    {
      recorded_at: daysAgo(2),
      ph: 7.6,
      total_alkalinity_ppm: 110,
      calcium_hardness_ppm: null,
    },
  ];

  it("plots one point per reading, oldest first", () => {
    const series = lsiSeries(readings, [], daysAgo(30));
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.date)).toEqual([
      daysAgo(6),
      daysAgo(4),
      daysAgo(2),
    ]);
  });

  it("leaves a gap before calcium was ever measured, then fills in", () => {
    const series = lsiSeries(readings, [], daysAgo(30));
    // No calcium known yet on the first test, so no honest LSI for that day.
    expect(series[0].value).toBeNull();
    expect(series[1].value).toBeCloseTo(0.16, 2);
    // Later tests reuse the calcium measured during this fill.
    expect(series[2].value).not.toBeNull();
  });

  it("uses the nearest probe temperature when there is probe history", () => {
    const probes = [
      { measured_at: daysAgo(4), temperature_c: 25 },
      { measured_at: daysAgo(2), temperature_c: 40 },
    ];
    const withProbe = lsiSeries(readings, probes, daysAgo(30));
    const withoutProbe = lsiSeries(readings, [], daysAgo(30));
    // Same water chemistry, colder measured temperature -> lower LSI.
    expect(withProbe[1].value).toBeCloseTo(-0.09, 2);
    expect(withoutProbe[1].value).toBeCloseTo(0.16, 2);
  });

  it("falls back to the assumed spa temperature with no probe data", () => {
    expect(ASSUMED_TEMP_C).toBe(38);
    const series = lsiSeries(readings, [], daysAgo(30));
    expect(series[1].value).toBeCloseTo(
      computeLsi({
        ph: 7.5,
        alkalinityPpm: 100,
        calciumHardnessPpm: 250,
        temperatureC: ASSUMED_TEMP_C,
      })!,
      2,
    );
  });

  it("ignores calcium measured before the last drain", () => {
    const acrossDrain = [
      {
        recorded_at: daysAgo(20),
        ph: 7.5,
        total_alkalinity_ppm: 100,
        calcium_hardness_ppm: 250,
      },
      {
        recorded_at: daysAgo(5),
        ph: 7.5,
        total_alkalinity_ppm: 100,
        calcium_hardness_ppm: null,
      },
    ];
    const series = lsiSeries(acrossDrain, [], daysAgo(10));
    expect(series[1].value).toBeNull();
  });

  it("copes with an empty history", () => {
    expect(lsiSeries([], [], null)).toEqual([]);
  });
});
