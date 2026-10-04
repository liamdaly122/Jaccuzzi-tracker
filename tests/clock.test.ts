import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { ukClock } from "../lib/clock";

describe("ukClock", () => {
  it("shows British Summer Time in summer", () => {
    expect(format(ukClock("2026-07-01T23:30:00.000Z"), "yyyy-MM-dd HH:mm")).toBe("2026-07-02 00:30");
  });
  it("shows GMT in winter", () => {
    expect(format(ukClock("2026-12-01T23:30:00.000Z"), "yyyy-MM-dd HH:mm")).toBe("2026-12-01 23:30");
  });
});
