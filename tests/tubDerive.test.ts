import { describe, it, expect } from "vitest";
import { deriveTubState } from "../lib/tubDerive";
import { sampleInputs } from "./fixtures/sampleTub";

describe("deriveTubState", () => {
  const s = deriveTubState(sampleInputs());

  it("reads the water temperature from the live probe", () => {
    expect(s.waterC).toBe(37.4);
  });

  it("measures the insulation from the probe's own cooling", () => {
    // The sample cools 0.1° an hour with the covers on.
    expect(s.heatLoss.basis).not.toBe("assumed");
    expect(s.heatLoss.standingLossCPerH).toBeCloseTo(0.1, 1);
  });

  it("ages the water from the last refill", () => {
    expect(s.waterAgeDays).toBe(25);
  });

  it("keeps everything running for Freeze Shield, and goes quiet once packed away", () => {
    const shield = deriveTubState(sampleInputs({ hibernating: true, strategy: "freeze_shield" }));
    expect(shield.hibernation.hibernating).toBe(false);
    expect(shield.hibernation.keepingItRunning).toBe(true);
    const packed = deriveTubState(sampleInputs({ hibernating: true }));
    expect(packed.hibernation.hibernating).toBe(true);
  });

  it("copes without a probe", () => {
    const t = deriveTubState(sampleInputs({ noProbe: true }));
    expect(t.waterC).toBeNull();
    expect(t.verdict.status).toBeDefined();
  });
});
