import { describe, it, expect } from "vitest";
import { normalizeScan, type RawScan } from "../lib/scan";

const chlorine = { sanitizerType: "chlorine" as const };
const bromine = { sanitizerType: "bromine" as const };

describe("normalizeScan", () => {
  it("passes through valid values for the active sanitizer", () => {
    const raw: RawScan = {
      ph: 7.5,
      totalAlkalinityPpm: 100,
      freeChlorinePpm: 3,
      brominePpm: null,
      calciumHardnessPpm: 150,
    };
    expect(normalizeScan(raw, chlorine)).toEqual({
      ph: 7.5,
      totalAlkalinityPpm: 100,
      freeChlorinePpm: 3,
      brominePpm: null,
      calciumHardnessPpm: 150,
      cyanuricAcidPpm: null,
    });
  });

  it("drops out-of-range values to null", () => {
    const raw: RawScan = {
      ph: 14, // impossible on a strip
      totalAlkalinityPpm: 5000, // absurd
      freeChlorinePpm: 3,
      calciumHardnessPpm: -20, // negative
    };
    const out = normalizeScan(raw, chlorine);
    expect(out.ph).toBeNull();
    expect(out.totalAlkalinityPpm).toBeNull();
    expect(out.freeChlorinePpm).toBe(3);
    expect(out.calciumHardnessPpm).toBeNull();
  });

  it("treats missing/non-numeric keys as null", () => {
    const raw = {
      ph: "not a number",
      freeChlorinePpm: undefined,
    } as unknown as RawScan;
    const out = normalizeScan(raw, chlorine);
    expect(out.ph).toBeNull();
    expect(out.freeChlorinePpm).toBeNull();
    expect(out.totalAlkalinityPpm).toBeNull();
  });

  it("keeps only the active sanitizer (chlorine tub ignores bromine)", () => {
    const raw: RawScan = { freeChlorinePpm: 3, brominePpm: 5 };
    const out = normalizeScan(raw, chlorine);
    expect(out.freeChlorinePpm).toBe(3);
    expect(out.brominePpm).toBeNull();
  });

  it("keeps only the active sanitizer (bromine tub ignores chlorine)", () => {
    const raw: RawScan = { freeChlorinePpm: 3, brominePpm: 5 };
    const out = normalizeScan(raw, bromine);
    expect(out.brominePpm).toBe(5);
    expect(out.freeChlorinePpm).toBeNull();
  });

  it("parses numeric strings", () => {
    const raw = {
      ph: "7.4",
      totalAlkalinityPpm: "80",
    } as unknown as RawScan;
    const out = normalizeScan(raw, chlorine);
    expect(out.ph).toBe(7.4);
    expect(out.totalAlkalinityPpm).toBe(80);
  });

  it("rounds pH to one decimal and alkalinity to a whole number", () => {
    const raw: RawScan = { ph: 7.46, totalAlkalinityPpm: 104.7 };
    const out = normalizeScan(raw, chlorine);
    expect(out.ph).toBe(7.5);
    expect(out.totalAlkalinityPpm).toBe(105);
  });

  it("handles null/undefined raw safely", () => {
    expect(normalizeScan(null, chlorine)).toEqual({
      ph: null,
      totalAlkalinityPpm: null,
      freeChlorinePpm: null,
      brominePpm: null,
      calciumHardnessPpm: null,
      cyanuricAcidPpm: null,
    });
    expect(normalizeScan(undefined, bromine).ph).toBeNull();
  });
});

describe("cyanuric acid pad", () => {
  it("passes a plausible stabiliser reading through", () => {
    expect(
      normalizeScan({ ph: 7.5, cyanuricAcidPpm: 45 }, chlorine).cyanuricAcidPpm,
    ).toBe(45);
  });

  it("drops a misread that no strip could actually show", () => {
    expect(
      normalizeScan({ cyanuricAcidPpm: 5000 }, chlorine).cyanuricAcidPpm,
    ).toBeNull();
  });

  it("is null when the strip has no stabiliser pad", () => {
    expect(normalizeScan({ ph: 7.5 }, chlorine).cyanuricAcidPpm).toBeNull();
  });
});
