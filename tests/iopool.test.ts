import { describe, it, expect } from "vitest";
import { normalizeMeasure, normalizePool, pickPool } from "../lib/iopool-parse";

const NOW = new Date("2026-08-04T12:00:00.000Z");

// A realistic /v1/pools payload.
const samplePool = {
  id: "4dedb437-2488-4350-94d8-aaaabbbbcccc",
  title: "Hot tub",
  mode: "STANDARD",
  hasAnActionRequired: false,
  advice: { filtrationDuration: 4 },
  latestMeasure: {
    temperature: 37.4,
    ph: 7.52,
    orp: 715,
    mode: "standard",
    isValid: true,
    ecoId: "ECO-123",
    measuredAt: "2026-08-04T11:30:00.000Z",
  },
};

describe("normalizeMeasure", () => {
  it("reads pH, ORP and temperature from a probe measurement", () => {
    const m = normalizeMeasure(samplePool.latestMeasure, NOW);
    expect(m.ph).toBe(7.52);
    expect(m.orpMv).toBe(715);
    expect(m.temperatureC).toBe(37.4);
    expect(m.isValid).toBe(true);
  });

  it("works out how stale the reading is", () => {
    const m = normalizeMeasure(samplePool.latestMeasure, NOW);
    expect(m.ageMinutes).toBe(30);
    expect(m.measuredAt).toBe("2026-08-04T11:30:00.000Z");
  });

  it("rejects physically impossible values rather than passing them on", () => {
    const m = normalizeMeasure(
      { ph: 99, orp: -5, temperature: 900, measuredAt: "nonsense" },
      NOW,
    );
    expect(m.ph).toBeNull();
    expect(m.orpMv).toBeNull();
    expect(m.temperatureC).toBeNull();
    expect(m.measuredAt).toBeNull();
    expect(m.ageMinutes).toBeNull();
  });

  it("handles a missing measurement object", () => {
    const m = normalizeMeasure(undefined, NOW);
    expect(m.ph).toBeNull();
    expect(m.orpMv).toBeNull();
    expect(m.isValid).toBe(true);
  });

  it("respects iopool's isValid flag when it says the reading is settling", () => {
    const m = normalizeMeasure({ ...samplePool.latestMeasure, isValid: false }, NOW);
    expect(m.isValid).toBe(false);
  });
});

describe("normalizePool", () => {
  it("maps the pool envelope including the filtration advice", () => {
    const p = normalizePool(samplePool, NOW)!;
    expect(p.id).toBe(samplePool.id);
    expect(p.title).toBe("Hot tub");
    expect(p.filtrationHours).toBe(4);
    expect(p.hasActionRequired).toBe(false);
    expect(p.measure.orpMv).toBe(715);
  });

  it("returns null without an id", () => {
    expect(normalizePool({ title: "no id" }, NOW)).toBeNull();
  });

  it("falls back to a sensible title", () => {
    expect(normalizePool({ id: "x" }, NOW)!.title).toBe("My spa");
  });
});

describe("pickPool", () => {
  const other = { ...samplePool, id: "other-id", title: "Other" };

  it("takes the first pool when no preference is given", () => {
    expect(pickPool([samplePool, other], null, NOW)!.id).toBe(samplePool.id);
  });

  it("honours a preferred pool id", () => {
    expect(pickPool([samplePool, other], "other-id", NOW)!.title).toBe("Other");
  });

  it("falls back to the first when the preferred id isn't there", () => {
    expect(pickPool([samplePool, other], "missing", NOW)!.id).toBe(samplePool.id);
  });

  it("copes with a single object instead of an array", () => {
    expect(pickPool(samplePool, null, NOW)!.id).toBe(samplePool.id);
  });

  it("returns null for an empty or junk payload", () => {
    expect(pickPool([], null, NOW)).toBeNull();
    expect(pickPool([{ nope: true }], null, NOW)).toBeNull();
  });
});
