import { describe, it, expect } from "vitest";
import {
  compareWinterCosts,
  FREEZE_SHIELD_ON_C,
  heatLossAreaM2,
  hibernationState,
  LEAD_IN_DAYS,
  STRATEGIES,
  strategy,
  winterCountdown,
  winterLengthDays,
  winterWindow,
} from "../lib/winter";

const AUG = new Date("2026-08-06T12:00:00.000Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LEEDS = 53.8;

describe("winterWindow", () => {
  it("puts a UK shutdown at the end of October, reopening in spring", () => {
    const w = winterWindow(LEEDS, AUG)!;
    expect(iso(w.deadline)).toBe("2026-11-02");
    expect(iso(w.opens)).toBe("2026-10-12"); // three weeks of slack
    expect(iso(w.reopen)).toBe("2027-04-22");
  });

  it("freezes earlier the further north you are", () => {
    const inverness = winterWindow(57.5, AUG)!;
    const london = winterWindow(51.5, AUG)!;
    expect(inverness.deadline.getTime()).toBeLessThan(london.deadline.getTime());
    // And stays shut for longer.
    expect(winterLengthDays(inverness)).toBeGreaterThan(winterLengthDays(london));
  });

  it("flips to the southern hemisphere's winter", () => {
    const sydney = winterWindow(-33.9, AUG)!;
    // Southern winter: shut down around June, reopen in spring (September).
    expect(sydney.deadline.getUTCMonth()).toBe(5);
    expect(sydney.reopen.getUTCMonth()).toBe(8);
  });

  it("has nothing to say where there's no freezing season", () => {
    expect(winterWindow(1.3, AUG)).toBeNull(); // Singapore
    expect(winterWindow(-5, AUG)).toBeNull();
  });

  it("returns null rather than guessing without a location", () => {
    expect(winterWindow(null, AUG)).toBeNull();
    expect(winterWindow(Number.NaN, AUG)).toBeNull();
  });

  it("rolls on to next year once this year's deadline has passed", () => {
    const december = new Date("2026-12-20T12:00:00.000Z");
    const w = winterWindow(LEEDS, december)!;
    expect(w.deadline.getUTCFullYear()).toBe(2027);
    // Reopening always follows the deadline it belongs to.
    expect(w.reopen.getTime()).toBeGreaterThan(w.deadline.getTime());
  });

  it("always reopens after it shuts down", () => {
    for (const lat of [30, 45, 53.8, 65, -35, -50]) {
      for (const month of [0, 3, 6, 9]) {
        const w = winterWindow(lat, new Date(Date.UTC(2026, month, 15)))!;
        expect(w.reopen.getTime()).toBeGreaterThan(w.deadline.getTime());
        expect(w.opens.getTime()).toBeLessThan(w.deadline.getTime());
      }
    }
  });
});

describe("winterCountdown", () => {
  const w = winterWindow(LEEDS, AUG)!; // deadline 2026-11-02
  const at = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);

  it("stays out of the way in midsummer", () => {
    const c = winterCountdown(w, at("2026-06-01"))!;
    expect(c.status).toBe("not_yet");
    expect(c.fractionRemaining).toBe(1);
  });

  it("counts down through the lead-in", () => {
    const early = winterCountdown(w, at("2026-09-01"))!;
    const later = winterCountdown(w, at("2026-10-15"))!;
    expect(early.status).toBe("ok");
    expect(later.fractionRemaining).toBeLessThan(early.fractionRemaining);
    expect(later.daysUntil).toBeLessThan(early.daysUntil);
  });

  it("turns urgent a fortnight out, and empties the bar at the deadline", () => {
    expect(winterCountdown(w, at("2026-10-25"))!.status).toBe("due_soon");
    const onTheDay = winterCountdown(w, at("2026-11-02"))!;
    expect(onTheDay.status).toBe("overdue");
    expect(onTheDay.fractionRemaining).toBe(0);
  });

  it("lets a cold forecast overrule the calendar", () => {
    // Six weeks early, but frost is coming this week.
    const c = winterCountdown(w, at("2026-09-20"), [
      { date: "2026-09-22", tempMin: 9 },
      { date: "2026-09-23", tempMin: 3 },
    ])!;
    expect(c.status).toBe("due_soon");
    expect(c.decidedBy).toBe("forecast");
    expect(c.forecastLowC).toBe(3);
  });

  it("ignores a forecast that's merely autumnal", () => {
    const c = winterCountdown(w, at("2026-09-20"), [
      { date: "2026-09-22", tempMin: FREEZE_SHIELD_ON_C + 3 },
    ])!;
    expect(c.status).toBe("ok");
    expect(c.decidedBy).toBe("calendar");
    expect(c.forecastLowC).toBeNull();
  });

  it("never lets a mild forecast downgrade a passed deadline", () => {
    const c = winterCountdown(w, at("2026-11-20"), [
      { date: "2026-11-21", tempMin: 14 },
    ])!;
    expect(c.status).toBe("overdue");
  });

  it("has nothing to count without a window", () => {
    expect(winterCountdown(null, AUG)).toBeNull();
  });

  it("uses the same lead-in the card keys off", () => {
    const c = winterCountdown(w, new Date(w.deadline.getTime() - LEAD_IN_DAYS * 86400000))!;
    expect(c.fractionRemaining).toBeCloseTo(1, 5);
    expect(c.status).toBe("ok");
  });
});

describe("compareWinterCosts", () => {
  it("derives heat-loss area from the tub's own volume", () => {
    // 1180 L at typical fill depth is roughly a 1.5 m square: ~7.5 m2 of
    // top, walls and base.
    expect(heatLossAreaM2(1180)).toBeCloseTo(7.5, 1);
    expect(heatLossAreaM2(2000)).toBeGreaterThan(heatLossAreaM2(1180));
  });

  it("shows packing down saving real money over a UK winter", () => {
    const w = winterWindow(LEEDS, AUG)!;
    const c = compareWinterCosts(1180, winterLengthDays(w), { refillCost: 12.4 });
    expect(c.days).toBeGreaterThan(150);
    // A range, not false precision — the cold-snap end costs far more.
    expect(c.freezeShield.high).toBeGreaterThan(c.freezeShield.low * 2);
    expect(c.freezeShield.low).toBeGreaterThan(c.shutdown);
    expect(c.saving.low).toBeGreaterThan(0);
    expect(c.saving.high).toBeGreaterThan(c.saving.low);
  });

  it("scales with the length of the winter and the price of power", () => {
    const short = compareWinterCosts(1180, 90, { refillCost: 12 });
    const long = compareWinterCosts(1180, 180, { refillCost: 12 });
    expect(long.freezeShield.low).toBeCloseTo(short.freezeShield.low * 2, 0);

    const pricey = compareWinterCosts(1180, 90, { refillCost: 12, pricePerKwh: 0.54 });
    expect(pricey.freezeShield.low).toBeCloseTo(short.freezeShield.low * 2, 0);
  });

  it("never reports a negative saving", () => {
    // A tiny tub in a short, mild winter can cost less to run than to refill.
    const c = compareWinterCosts(200, 20, { refillCost: 500 });
    expect(c.saving.low).toBe(0);
    expect(c.saving.high).toBeGreaterThanOrEqual(0);
  });
});

describe("strategies", () => {
  it("recommends exactly one, and it's packing down", () => {
    const recommended = STRATEGIES.filter((s) => s.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].key).toBe("pack_down");
  });

  it("admits a downside for every option, including the recommended one", () => {
    for (const s of STRATEGIES) {
      expect(s.catch.length).toBeGreaterThan(20);
      expect(s.summary.length).toBeGreaterThan(20);
    }
  });

  it("tells you the pump comes indoors even if the tub doesn't", () => {
    // The detail that actually prevents a cracked pump.
    expect(strategy("drained_in_place").catch).toMatch(/pump/i);
  });

  it("falls back to the recommended option for an unknown key", () => {
    expect(strategy("nonsense" as never).key).toBe("pack_down");
  });
});

describe("hibernationState", () => {
  const w = winterWindow(LEEDS, AUG)!;

  it("is awake until a shutdown is recorded", () => {
    const h = hibernationState(null, null, w);
    expect(h.hibernating).toBe(false);
    expect(h.stillOutdoors).toBe(false);
  });

  it("goes quiet once the tub is packed away", () => {
    const h = hibernationState("2026-11-01T10:00:00.000Z", "pack_down", w);
    expect(h.hibernating).toBe(true);
    expect(h.strategy).toBe("pack_down");
    // Indoors and empty — nothing left to warn about.
    expect(h.stillOutdoors).toBe(false);
    expect(h.reopen).toEqual(w.reopen);
  });

  it("keeps watching the weather when the tub is still in the garden", () => {
    for (const key of ["drained_in_place", "freeze_shield"]) {
      const h = hibernationState("2026-11-01T10:00:00.000Z", key, w);
      expect(h.hibernating).toBe(true);
      expect(h.stillOutdoors).toBe(true);
    }
  });

  it("shrugs off a junk timestamp or an unknown strategy", () => {
    expect(hibernationState("not-a-date", "pack_down", w).hibernating).toBe(false);
    expect(hibernationState("2026-11-01T10:00:00.000Z", "banana", w).strategy).toBeNull();
  });
});
