import { describe, it, expect } from "vitest";
import { summariseTest } from "../lib/testResult";
import {
  calculateRecommendations,
  DEFAULT_DOSING_CONSTANTS,
  DEFAULT_TARGET_RANGES,
  type SpaConfig,
} from "../lib/chemistry";

const config: SpaConfig = {
  volumeLitres: 1180,
  sanitizerType: "chlorine",
  sanitizerUnit: "ppm",
  targetRanges: DEFAULT_TARGET_RANGES,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};
const run = (r: Partial<Parameters<typeof calculateRecommendations>[0]>, cfg = config) =>
  calculateRecommendations({ ph: 7.5, totalAlkalinityPpm: 100, freeChlorinePpm: 4, ...r }, cfg);

describe("summariseTest", () => {
  it("says there's nothing to add when everything is in range", () => {
    const s = summariseTest(run({}), "chlorine", { sanitiser: true });
    expect(s.title).toBe("Nothing to add");
    expect(s.doses).toEqual([]);
    expect(s.fine).toEqual(["Alkalinity", "pH", "Chlorine"]);
  });

  it("lists doses alkalinity first and counts them in the heading", () => {
    const s = summariseTest(run({ totalAlkalinityPpm: 60, freeChlorinePpm: 1 }), "chlorine", { sanitiser: true });
    expect(s.doses[0].chemical).toBe("ta_increaser");
    expect(s.doses.map((d) => d.order)).toEqual([...s.doses.map((d) => d.order)].sort());
    expect(s.title).toBe(`${s.doses.length} things to add, in this order`);
    expect(s.fine).toEqual(["pH"]);
  });

  it("leads with the warning when it isn't safe, and doesn't repeat it as a note", () => {
    const s = summariseTest(run({ freeChlorinePpm: 12 }), "chlorine", { sanitiser: true });
    expect(s.title).toBe("Don't get in yet");
    expect(s.notes.some((n) => /do not use/i.test(n.label))).toBe(false);
    expect(s.fine).not.toContain("Chlorine");
  });

  it("doesn't call chlorine fine when it wasn't tested", () => {
    const s = summariseTest(run({ freeChlorinePpm: null, orpMv: 700 }, { ...config, sanitizerUnit: "orp" }), "chlorine", { sanitiser: false });
    expect(s.fine).not.toContain("Chlorine");
  });
});
