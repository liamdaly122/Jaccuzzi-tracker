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

  it("keeps a stable order among unflagged causes", () => {
    const d1 = diagnose("scale", null, chlorineConfig)!;
    const d2 = diagnose("scale", emptyReading, chlorineConfig)!;
    expect(d1.causes.map((c) => c.cause)).toEqual(d2.causes.map((c) => c.cause));
  });
});
