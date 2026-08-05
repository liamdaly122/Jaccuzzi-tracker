import { describe, it, expect } from "vitest";
import {
  ASSUMED_TEMP_C,
  carbonateAlkalinity,
  computeLsi,
  cyanurateCorrectionFactor,
  interpretLsi,
  latestCyaForFill,
  CYA_STALE_DAYS,
  latestCalciumForFill,
  lsiSeries,
  lsiSnapshot,
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

describe("cyanurate correction", () => {
  // The whole feature rests on this factor, so it's pinned to the figures the
  // PHTA publishes rather than to whatever the code happens to produce.
  it("reproduces the published correction factors", () => {
    expect(cyanurateCorrectionFactor(7.4)).toBeCloseTo(0.31, 2);
    expect(cyanurateCorrectionFactor(7.6)).toBeCloseTo(0.33, 2);
  });

  it("rises with pH, because more of the acid has dissociated", () => {
    expect(cyanurateCorrectionFactor(7.0)).toBeLessThan(
      cyanurateCorrectionFactor(7.5),
    );
    expect(cyanurateCorrectionFactor(7.5)).toBeLessThan(
      cyanurateCorrectionFactor(8.0),
    );
    // Never more than the full CaCO3 equivalence, however high the pH goes.
    expect(cyanurateCorrectionFactor(12)).toBeLessThan(50 / 129 + 1e-9);
  });

  it("subtracts stabiliser from the alkalinity that counts", () => {
    // CYA 50 at pH 7.5 -> ~16 ppm of the 100 is cyanurate, not carbonate.
    expect(carbonateAlkalinity(100, 50, 7.5)).toBeCloseTo(83.8, 1);
  });

  it("leaves alkalinity untouched when CYA was never measured", () => {
    // Absent is not the same as zero — this is the pre-CYA behaviour.
    expect(carbonateAlkalinity(100, null, 7.5)).toBe(100);
  });

  it("treats a genuine zero as a real measurement of none", () => {
    expect(carbonateAlkalinity(100, 0, 7.5)).toBe(100);
  });
});

describe("computeLsi with stabiliser", () => {
  const base = {
    ph: 7.5,
    alkalinityPpm: 100,
    calciumHardnessPpm: 250,
    temperatureC: 38,
  };

  it("lowers the index, because cyanurate never took part in the balance", () => {
    const uncorrected = computeLsi(base)!;
    const corrected = computeLsi({ ...base, cyanuricAcidPpm: 50 })!;
    expect(corrected).toBeLessThan(uncorrected);
    // ~0.08 at CYA 50 — enough to matter against band edges at +/-0.3.
    expect(uncorrected - corrected).toBeCloseTo(0.08, 2);
  });

  it("corrects further as stabiliser climbs", () => {
    const at50 = computeLsi({ ...base, cyanuricAcidPpm: 50 })!;
    const at100 = computeLsi({ ...base, cyanuricAcidPpm: 100 })!;
    expect(computeLsi(base)! - at100).toBeCloseTo(0.17, 2);
    expect(at100).toBeLessThan(at50);
  });

  it("is unchanged when CYA is absent — old readings keep their old answer", () => {
    expect(computeLsi({ ...base, cyanuricAcidPpm: null })).toBe(computeLsi(base));
  });

  it("can flip a 'scaling' verdict back to balanced", () => {
    const water = { ph: 7.8, alkalinityPpm: 120, calciumHardnessPpm: 300, temperatureC: 40 };
    const without = computeLsi(water)!;
    const with100 = computeLsi({ ...water, cyanuricAcidPpm: 100 })!;
    expect(interpretLsi(without).band).toBe("scaling");
    expect(interpretLsi(with100).band).not.toBe("scaling");
  });

  it("refuses to answer when stabiliser has eaten the whole alkalinity", () => {
    // 200 ppm CYA at pH 7.5 is ~65 ppm of cyanurate — more than a TA of 50.
    expect(
      computeLsi({ ...base, alkalinityPpm: 50, cyanuricAcidPpm: 200 }),
    ).toBeNull();
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

describe("latestCyaForFill", () => {
  const cyaReading = (ago: number, cya: number | null) => ({
    recorded_at: daysAgo(ago),
    cyanuric_acid_ppm: cya,
  });

  it("carries the most recent stabiliser reading forward", () => {
    const found = latestCyaForFill(
      [cyaReading(9, 30), cyaReading(2, 60), cyaReading(1, null)],
      daysAgo(30),
      NOW,
    );
    expect(found?.valuePpm).toBe(60);
    expect(found?.ageDays).toBe(2);
  });

  it("never carries it across a drain — a refill resets stabiliser to zero", () => {
    expect(
      latestCyaForFill([cyaReading(20, 90)], daysAgo(10), NOW),
    ).toBeNull();
  });

  it("returns null when the strip has no stabiliser pad", () => {
    expect(
      latestCyaForFill([{ recorded_at: daysAgo(1) }], null, NOW),
    ).toBeNull();
  });

  it("goes stale faster than calcium, because dichlor keeps adding it", () => {
    expect(CYA_STALE_DAYS).toBeLessThan(30);
  });
});

describe("lsiSnapshot", () => {
  const test = (
    ago: number,
    ph: number | null,
    ta: number | null,
    calcium: number | null = null,
  ) => ({
    recorded_at: daysAgo(ago),
    ph,
    total_alkalinity_ppm: ta,
    calcium_hardness_ppm: calcium,
  });

  it("combines the latest test, the fill's calcium and the probe temperature", () => {
    const snap = lsiSnapshot(
      [test(9, 7.3, 95, 250), test(1, 7.5, 100)],
      [{ measured_at: daysAgo(0), temperature_c: 38 }],
      daysAgo(20),
      NOW,
    );
    expect(snap.ph).toBe(7.5); // newest test
    expect(snap.calcium?.valuePpm).toBe(250); // older test, still this fill
    expect(snap.temperatureIsMeasured).toBe(true);
    expect(snap.lsi).toBeCloseTo(0.16, 2);
    expect(snap.verdict?.band).toBe("balanced");
    expect(snap.missing).toEqual([]);
  });

  it("takes readings in any order", () => {
    const newestFirst = lsiSnapshot([test(1, 7.5, 100, 250), test(9, 7.3, 95)], [], null, NOW);
    const oldestFirst = lsiSnapshot([test(9, 7.3, 95), test(1, 7.5, 100, 250)], [], null, NOW);
    expect(newestFirst.lsi).toBe(oldestFirst.lsi);
    expect(newestFirst.ph).toBe(7.5);
  });

  it("says what's missing instead of guessing at it", () => {
    const noCalcium = lsiSnapshot([test(1, 7.5, 100)], [], null, NOW);
    expect(noCalcium.lsi).toBeNull();
    expect(noCalcium.verdict).toBeNull();
    expect(noCalcium.missing).toEqual(["a calcium hardness reading"]);

    const nothing = lsiSnapshot([], [], null, NOW);
    expect(nothing.lsi).toBeNull();
    expect(nothing.missing).toHaveLength(2);
  });

  it("falls back to the assumed spa temperature when the probe is silent", () => {
    const noProbe = lsiSnapshot([test(1, 7.5, 100, 250)], [], null, NOW);
    expect(noProbe.temperatureIsMeasured).toBe(false);
    expect(noProbe.temperatureC).toBe(ASSUMED_TEMP_C);

    // A probe reading from a fortnight ago isn't "what the water is now".
    const staleProbe = lsiSnapshot(
      [test(1, 7.5, 100, 250)],
      [{ measured_at: daysAgo(14), temperature_c: 25 }],
      null,
      NOW,
    );
    expect(staleProbe.temperatureIsMeasured).toBe(false);
    expect(staleProbe.temperatureC).toBe(ASSUMED_TEMP_C);
  });

  it("flags a calcium reading that has aged past a month", () => {
    const fresh = lsiSnapshot([test(1, 7.5, 100, 250)], [], null, NOW);
    expect(fresh.calciumIsStale).toBe(false);

    const old = lsiSnapshot(
      [test(60, 7.5, 100, 250), test(1, 7.5, 100)],
      [],
      null,
      NOW,
    );
    // Still usable — calcium moves slowly — but the UI should say how old it is.
    expect(old.calciumIsStale).toBe(true);
    expect(old.lsi).not.toBeNull();
    expect(old.calcium?.ageDays).toBe(60);
  });

  it("uses stabiliser when a strip has measured it, and says so", () => {
    const withCya = lsiSnapshot(
      [
        {
          recorded_at: daysAgo(1),
          ph: 7.5,
          total_alkalinity_ppm: 100,
          calcium_hardness_ppm: 250,
          cyanuric_acid_ppm: 50,
        },
      ],
      [],
      null,
      NOW,
    );
    expect(withCya.cya?.valuePpm).toBe(50);
    expect(withCya.cyaCorrected).toBe(true);
    expect(withCya.carbonateAlkalinityPpm).toBeCloseTo(83.8, 1);
    // Lower than the uncorrected 0.16 for the same water.
    expect(withCya.lsi).toBeLessThan(0.16);
  });

  it("admits when it is still working without a stabiliser reading", () => {
    const snap = lsiSnapshot([test(1, 7.5, 100, 250)], [], null, NOW);
    expect(snap.cyaCorrected).toBe(false);
    expect(snap.cya).toBeNull();
    // Carbonate alkalinity falls back to the total, so the number is unchanged.
    expect(snap.carbonateAlkalinityPpm).toBe(100);
    expect(snap.lsi).toBeCloseTo(0.16, 2);
  });

  it("flags a stabiliser reading that has aged past a fortnight", () => {
    const snap = lsiSnapshot(
      [
        {
          recorded_at: daysAgo(20),
          ph: 7.5,
          total_alkalinity_ppm: 100,
          calcium_hardness_ppm: 250,
          cyanuric_acid_ppm: 50,
        },
      ],
      [],
      null,
      NOW,
    );
    expect(snap.cyaIsStale).toBe(true);
  });

  it("reports over-stabilised water as a finding, not a missing input", () => {
    const snap = lsiSnapshot(
      [
        {
          recorded_at: daysAgo(1),
          ph: 7.5,
          total_alkalinity_ppm: 50,
          calcium_hardness_ppm: 250,
          cyanuric_acid_ppm: 200,
        },
      ],
      [],
      null,
      NOW,
    );
    expect(snap.lsi).toBeNull();
    expect(snap.overStabilised).toBe(true);
    expect(snap.missing.join(" ")).toMatch(/fresh water/i);
  });

  it("drops the calcium when the tub has been drained since", () => {
    const snap = lsiSnapshot(
      [test(20, 7.5, 100, 250), test(1, 7.5, 100)],
      [],
      daysAgo(10),
      NOW,
    );
    expect(snap.calcium).toBeNull();
    expect(snap.lsi).toBeNull();
    expect(snap.missing).toContain("a calcium hardness reading");
  });
});
