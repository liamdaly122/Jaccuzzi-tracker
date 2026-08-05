import { describe, it, expect } from "vitest";
import {
  listSymptoms,
  diagnose,
  type TroubleshootReading,
} from "../lib/troubleshoot";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "../lib/chemistry";

const chlorineConfig: SpaConfig = {
  volumeLitres: 1000,
  sanitizerType: "chlorine",
  targetRanges: DEFAULT_TARGET_RANGES,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};
const bromineConfig: SpaConfig = { ...chlorineConfig, sanitizerType: "bromine" };

const emptyReading: TroubleshootReading = {
  ph: null,
  freeChlorinePpm: null,
  brominePpm: null,
  totalAlkalinityPpm: null,
  calciumHardnessPpm: null,
};

describe("listSymptoms", () => {
  const symptoms = listSymptoms();

  it("returns several symptoms, each with content", () => {
    expect(symptoms.length).toBeGreaterThanOrEqual(6);
    for (const s of symptoms) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  it("has unique symptom keys", () => {
    const keys = symptoms.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every symptom diagnoses to at least one cause", () => {
    for (const s of symptoms) {
      const d = diagnose(s.key, null, chlorineConfig);
      expect(d).not.toBeNull();
      expect(d!.causes.length).toBeGreaterThan(0);
    }
  });
});

describe("diagnose", () => {
  it("returns null for an unknown symptom", () => {
    expect(diagnose("does-not-exist", null, chlorineConfig)).toBeNull();
  });

  it("works with no reading (nothing flagged)", () => {
    const d = diagnose("cloudy", null, chlorineConfig)!;
    expect(d.hasReading).toBe(false);
    expect(d.causes.every((c) => c.flagged === false)).toBe(true);
  });

  it("flags high pH for cloudy water and puts it first", () => {
    const reading: TroubleshootReading = { ...emptyReading, ph: 8.2 };
    const d = diagnose("cloudy", reading, chlorineConfig)!;
    const phCause = d.causes.find((c) => c.cause === "pH or alkalinity too high");
    expect(phCause?.flagged).toBe(true);
    expect(d.causes[0].flagged).toBe(true);
  });

  it("flags low chlorine for green water using the active sanitizer", () => {
    const reading: TroubleshootReading = { ...emptyReading, freeChlorinePpm: 0.5 };
    const d = diagnose("green", reading, chlorineConfig)!;
    const sanCause = d.causes.find((c) => c.cause === "Sanitizer too low or zero");
    expect(sanCause?.flagged).toBe(true);
  });

  it("uses bromine, not chlorine, as the active sanitizer in bromine mode", () => {
    // High free-chlorine value must NOT flag the sanitizer cause in bromine mode.
    const reading: TroubleshootReading = {
      ...emptyReading,
      freeChlorinePpm: 0,
      brominePpm: 4,
    };
    const d = diagnose("green", reading, bromineConfig)!;
    const sanCause = d.causes.find((c) => c.cause === "Sanitizer too low or zero");
    expect(sanCause?.flagged).toBe(false);
  });

  it("flags high sanitizer for itchy skin", () => {
    const reading: TroubleshootReading = { ...emptyReading, freeChlorinePpm: 9 };
    const d = diagnose("itchy", reading, chlorineConfig)!;
    const cause = d.causes.find((c) => c.cause === "Sanitizer too high");
    expect(cause?.flagged).toBe(true);
  });

  it("does not flag anything when the reading is in range", () => {
    const reading: TroubleshootReading = {
      ph: 7.5,
      freeChlorinePpm: 4,
      brominePpm: null,
      totalAlkalinityPpm: 100,
      calciumHardnessPpm: 150,
    };
    const d = diagnose("cloudy", reading, chlorineConfig)!;
    expect(d.causes.some((c) => c.flagged)).toBe(false);
  });

  // The saturation-index cause is the only one that can fire when every
  // individual number reads fine — which is exactly the case that furs up a
  // heater without anything else warning you.
  it("flags scale-forming balance even with every number inside its own range", () => {
    const reading: TroubleshootReading = {
      ph: 7.8, // top of acceptable
      freeChlorinePpm: 4,
      brominePpm: null,
      totalAlkalinityPpm: 120, // top of range
      calciumHardnessPpm: 250, // top of range
      temperatureC: 40,
    };
    const d = diagnose("scale", reading, chlorineConfig)!;
    const lsiCause = d.causes.find((c) => c.cause.includes("balance as a whole"))!;
    expect(lsiCause.flagged).toBe(true);
    // Nothing is individually out of range, so no other cause should fire.
    expect(d.causes.filter((c) => c.flagged)).toHaveLength(1);
    // Flagged causes come first.
    expect(d.causes[0].cause).toBe(lsiCause.cause);
  });

  it("stays quiet on balanced water", () => {
    const reading: TroubleshootReading = {
      ph: 7.4,
      freeChlorinePpm: 4,
      brominePpm: null,
      totalAlkalinityPpm: 90,
      calciumHardnessPpm: 150,
      temperatureC: 38,
    };
    const d = diagnose("scale", reading, chlorineConfig)!;
    expect(d.causes.some((c) => c.cause.includes("balance as a whole") && c.flagged)).toBe(
      false,
    );
  });

  it("cannot judge the balance without a calcium reading", () => {
    const reading: TroubleshootReading = {
      ph: 8.0,
      freeChlorinePpm: 4,
      brominePpm: null,
      totalAlkalinityPpm: 150,
      calciumHardnessPpm: null,
      temperatureC: 40,
    };
    const d = diagnose("scale", reading, chlorineConfig)!;
    // pH/alkalinity are genuinely high, so that cause fires — but the
    // combination check refuses to guess at the missing calcium.
    expect(d.causes.some((c) => c.cause.includes("balance as a whole") && c.flagged)).toBe(
      false,
    );
    expect(d.causes.some((c) => c.cause.includes("pH or alkalinity") && c.flagged)).toBe(
      true,
    );
  });

  it("keeps a stable order among unflagged causes", () => {
    const d1 = diagnose("scale", null, chlorineConfig)!;
    const d2 = diagnose("scale", emptyReading, chlorineConfig)!;
    expect(d1.causes.map((c) => c.cause)).toEqual(d2.causes.map((c) => c.cause));
  });
});

describe("won't hold sanitizer — measured stabiliser", () => {
  const reading = (cya: number | null): TroubleshootReading => ({
    ph: 7.5,
    freeChlorinePpm: 3,
    brominePpm: null,
    totalAlkalinityPpm: 100,
    calciumHardnessPpm: 150,
    cyanuricAcidPpm: cya,
  });

  it("flags chlorine lock and leads with it", () => {
    const d = diagnose("wont_hold_sanitizer", reading(140), chlorineConfig)!;
    expect(d.causes[0].cause).toMatch(/stabiliser/i);
    expect(d.causes[0].flagged).toBe(true);
    // The one problem you cannot dose your way out of — say so.
    expect(d.causes[0].fix).toMatch(/drain/i);
  });

  it("stays quiet at a healthy stabiliser level", () => {
    const d = diagnose("wont_hold_sanitizer", reading(40), chlorineConfig)!;
    expect(d.causes.some((c) => /stabiliser has locked/i.test(c.cause) && c.flagged)).toBe(
      false,
    );
  });

  it("does not guess when the strip never measured it", () => {
    const d = diagnose("wont_hold_sanitizer", reading(null), chlorineConfig)!;
    expect(d.causes.some((c) => /stabiliser has locked/i.test(c.cause) && c.flagged)).toBe(
      false,
    );
  });
});
