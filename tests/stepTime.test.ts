import { describe, it, expect } from "vitest";
import { stepTime } from "../lib/clock";

describe("stepTime", () => {
  it("steps by a quarter of an hour", () => {
    expect(stepTime("19:30", 1)).toBe("19:45");
    expect(stepTime("19:30", -1)).toBe("19:15");
  });
  it("snaps an odd time to the next quarter in the direction pressed", () => {
    expect(stepTime("19:40", 1)).toBe("19:45");
    expect(stepTime("19:40", -1)).toBe("19:30");
  });
  it("wraps past midnight both ways", () => {
    expect(stepTime("23:45", 1)).toBe("00:00");
    expect(stepTime("00:00", -1)).toBe("23:45");
  });
  it("starts from a sensible evening time when blank", () => {
    expect(stepTime("", 1)).toBe("19:45");
  });
});
