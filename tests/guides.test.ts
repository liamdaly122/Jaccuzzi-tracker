import { describe, it, expect } from "vitest";
import { GUIDES, getGuide } from "../lib/guides";
import { TIPS, getTip } from "../lib/tips";

describe("guides data", () => {
  it("every guide has a unique key and at least one step", () => {
    const keys = new Set<string>();
    for (const g of GUIDES) {
      expect(g.key).toBeTruthy();
      expect(keys.has(g.key)).toBe(false);
      keys.add(g.key);
      expect(g.steps.length).toBeGreaterThan(0);
      for (const step of g.steps) {
        expect(step.title).toBeTruthy();
        expect(step.detail).toBeTruthy();
      }
    }
  });

  it("getGuide finds by key and returns undefined otherwise", () => {
    expect(getGuide("drain-and-refill-day")?.completesTaskKey).toBe("drain_refill");
    expect(getGuide("nope")).toBeUndefined();
  });
});

describe("tips data", () => {
  it("every tip has a unique key and both what/why filled in", () => {
    const keys = new Set<string>();
    for (const t of TIPS) {
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
      expect(t.what).toBeTruthy();
      expect(t.why).toBeTruthy();
    }
  });

  it("getTip resolves a known key", () => {
    expect(getTip("ph")?.title).toBe("pH");
    expect(getTip("nope")).toBeUndefined();
  });
});
