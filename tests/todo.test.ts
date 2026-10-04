import { describe, it, expect } from "vitest";
import { buildTodos, heaterTodo, waterPills, withHeater, RANK, type TodoInput } from "../lib/todo";
import {
  calculateRecommendations,
  DEFAULT_DOSING_CONSTANTS,
  DEFAULT_TARGET_RANGES,
  type SpaConfig,
} from "../lib/chemistry";
import { computeTaskLife } from "../lib/tasks";

const NOW = new Date("2026-10-04T13:10:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

const config: SpaConfig = {
  volumeLitres: 1180,
  sanitizerType: "chlorine",
  sanitizerUnit: "orp",
  targetRanges: DEFAULT_TARGET_RANGES,
  dosingConstants: DEFAULT_DOSING_CONSTANTS,
};

function strip(reading: Partial<Parameters<typeof calculateRecommendations>[0]>, at: string) {
  const r = { ph: 7.5, totalAlkalinityPpm: 100, freeChlorinePpm: 4, ...reading };
  return {
    calc: calculateRecommendations(r, { ...config, sanitizerUnit: "ppm" }),
    recordedAt: at,
    alkalinityPpm: r.totalAlkalinityPpm,
  };
}

function job(id: number, key: string, every: number, lastDaysAgo: number | null) {
  const row = { id, task_key: key, name: key, task_type: "filter", frequency_days: every };
  return {
    row,
    life: computeTaskLife({ frequencyDays: every, lastCompletedAt: lastDaysAgo === null ? null : daysAgo(lastDaysAgo) }, NOW),
  };
}

const base: TodoInput = {
  now: NOW,
  config,
  strip: null,
  probe: null,
  dosing: [],
  jobs: [],
  forecasts: [],
  drift: null,
  verdict: null,
  winter: { countdown: null, deadline: null, decided: false },
};

describe("buildTodos — chemicals", () => {
  it("turns a strip test's dose into one short line, with the detail behind Why", () => {
    const r = buildTodos({ ...base, strip: strip({ totalAlkalinityPpm: 70 }, hoursAgo(1)) });
    const ta = r.items.find((i) => i.id === "dose:ta_increaser")!;
    expect(ta.title).toBe("Add 85 g alkalinity increaser");
    expect(ta.sub).toMatch(/Alkalinity is low/);
    expect(ta.why?.paragraphs[0]).toMatch(/General guidance/);
    expect(ta.action).toEqual({ kind: "dose", chemical: "ta_increaser", grams: 85 });
  });

  it("drops a dose once a matching one is logged after the reading", () => {
    const input = { ...base, strip: strip({ totalAlkalinityPpm: 70 }, hoursAgo(3)) };
    expect(buildTodos({ ...input, dosing: [{ chemical: "ta_increaser", logged_at: hoursAgo(1) }] }).items).toHaveLength(0);
    // A dose from before the test doesn't count.
    expect(buildTodos({ ...input, dosing: [{ chemical: "ta_increaser", logged_at: hoursAgo(5) }] }).items).toHaveLength(1);
  });

  it("reads pH and chlorine from the probe when it's newer than the strip", () => {
    // Two-day-old strip: pH high. Probe now: pH fine, ORP low.
    const r = buildTodos({
      ...base,
      strip: strip({ ph: 7.9 }, daysAgo(2)),
      probe: { ph: 7.5, orpMv: 640, measuredAt: hoursAgo(0.2) },
    });
    expect(r.items.some((i) => i.id === "dose:ph_decreaser")).toBe(false);
    const cl = r.items.find((i) => i.id === "dose:dichlor")!;
    expect(cl.title).toBe("Add a little dichlor");
    // One short line; the consequence is behind Why.
    expect(cl.sub).not.toMatch(/, so /);
    expect(cl.why?.paragraphs[0]).toMatch(/, so /);
  });

  it("lets a newer strip overrule an older probe reading", () => {
    const r = buildTodos({
      ...base,
      strip: strip({ ph: 7.9 }, hoursAgo(1)),
      probe: { ph: 7.5, orpMv: 700, measuredAt: hoursAgo(5) },
    });
    expect(r.items.some((i) => i.id === "dose:ph_decreaser")).toBe(true);
  });

  it("doesn't let a stale strip warning outlive the probe's newer reading", () => {
    // Strip two days ago: chlorine dangerously high. Probe now: ORP in range.
    const r = buildTodos({
      ...base,
      strip: strip({ freeChlorinePpm: 9 }, daysAgo(2)),
      probe: { ph: 7.5, orpMv: 700, measuredAt: hoursAgo(0.2) },
    });
    expect(r.safety.some((f) => f.severity === "danger")).toBe(false);
  });

  it("leaves 'do not use' to the banner instead of repeating it in the list", () => {
    const r = buildTodos({ ...base, strip: strip({ freeChlorinePpm: 12 }, hoursAgo(1)) });
    expect(r.safety.some((f) => f.code === "sanitizer_too_high")).toBe(true);
    expect(r.items.some((i) => /do not use/i.test(i.title))).toBe(false);
  });

  it("raises a warning the stale strip couldn't see", () => {
    const r = buildTodos({
      ...base,
      strip: strip({}, daysAgo(2)),
      probe: { ph: 7.5, orpMv: 520, measuredAt: hoursAgo(0.2) },
    });
    expect(r.safety.some((f) => f.severity === "danger")).toBe(true);
  });
});

describe("buildTodos — jobs", () => {
  it("lists overdue and due-today jobs, overdue first", () => {
    const r = buildTodos({
      ...base,
      jobs: [job(1, "rinse_filter", 7, 7), job(2, "test_water", 3, 4), job(3, "shock", 7, 2)],
    });
    expect(r.items.map((i) => i.id)).toEqual(["task:2", "task:1"]);
    expect(r.items[0].chip).toEqual({ label: "Overdue", tone: "bad" });
    expect(r.items[0].sub).toMatch(/^Due yesterday/);
    expect(r.items[0].action.kind).toBe("test");
    expect(r.items[1].chip).toEqual({ label: "Today", tone: "warn" });
    // The chip already says "Today"; the line underneath doesn't repeat it.
    expect(r.items[1].sub).toBe("Every 7 days");
  });

  it("puts the next month's jobs in 'later', and nothing further out", () => {
    const r = buildTodos({ ...base, jobs: [job(3, "shock", 7, 2), job(4, "replace_filter", 90, 4)] });
    expect(r.later.map((l) => l.id)).toEqual(["task:3"]);
    expect(r.later[0].taskId).toBe(3);
  });

  it("ranks chemicals above the heater above overdue jobs", () => {
    const r = buildTodos({
      ...base,
      strip: strip({ totalAlkalinityPpm: 70 }, hoursAgo(1)),
      jobs: [job(2, "test_water", 3, 4)],
    });
    const heater = heaterTodo({
      switchOnAt: new Date(NOW.getTime() + 30 * 60_000),
      readyAt: new Date(NOW.getTime() + 3 * 3600_000),
      targetC: 40,
      alreadyWarm: false,
      unreachable: false,
      tooLate: false,
      now: NOW,
    });
    const list = withHeater(r.items, heater);
    expect(list.map((i) => i.rank)).toEqual([RANK.dose, RANK.heater, RANK.overdue]);
  });
});

describe("buildTodos — winter and water", () => {
  it("asks for a winter decision only when it's close, and only if undecided", () => {
    const due = { fractionRemaining: 0.05, daysUntil: 4, status: "due_soon" as const, decidedBy: "calendar" as const, forecastLowC: null };
    const deadline = new Date("2026-11-02T12:00:00.000Z");
    expect(buildTodos({ ...base, winter: { countdown: due, deadline, decided: false } }).items[0].id).toBe("winter");
    expect(buildTodos({ ...base, winter: { countdown: due, deadline, decided: true } }).items).toHaveLength(0);
    const ok = { ...due, status: "ok" as const, daysUntil: 29 };
    const r = buildTodos({ ...base, winter: { countdown: ok, deadline, decided: false } });
    expect(r.items).toHaveLength(0);
    expect(r.later[0].id).toBe("winter");
  });

  it("puts 'change the water' on the list when the verdict says now", () => {
    const r = buildTodos({
      ...base,
      verdict: { status: "change_now", headline: "Time to change the water", detail: "It's been 95 days. That's long enough.", decidedBy: "age" },
    });
    expect(r.items[0].title).toBe("Time to change the water");
    expect(r.items[0].sub).toBe("It's been 95 days");
  });
});

describe("heaterTodo", () => {
  const common = { targetC: 40, alreadyWarm: false, unreachable: false, tooLate: false, now: NOW };
  it("shows the switch-on time", () => {
    const on = new Date(NOW);
    on.setHours(on.getHours() + 1, 29, 0, 0);
    const item = heaterTodo({ ...common, switchOnAt: on, readyAt: new Date(on.getTime() + 2 * 3600_000) })!;
    expect(item.chip?.label).toMatch(/^\d\d:29$/);
  });

  it("says nothing when the water is already warm", () => {
    expect(heaterTodo({ ...common, alreadyWarm: true, switchOnAt: null, readyAt: NOW })).toBeNull();
  });

  it("says 'now' when it's already late", () => {
    const item = heaterTodo({ ...common, tooLate: true, switchOnAt: null, readyAt: new Date(NOW.getTime() + 3600_000) })!;
    expect(item.chip?.label).toBe("Now");
  });

  it("ignores a soak that isn't today", () => {
    const tomorrow = new Date(NOW.getTime() + 30 * 3600_000);
    expect(heaterTodo({ ...common, switchOnAt: tomorrow, readyAt: tomorrow })).toBeNull();
  });
});

describe("waterPills", () => {
  const strip = { ph: 7.9, sanitiserPpm: 4, orpMv: null, recordedAt: daysAgo(2) };
  it("reads pH and chlorine from the probe when it's newer", () => {
    const pills = waterPills({ config, waterC: 37.42, strip, probe: { ph: 7.5, orpMv: 640, measuredAt: hoursAgo(1) } });
    expect(pills).toEqual([
      { label: "Water", value: "37.4°" },
      { label: "pH", value: "7.5", tone: "good" },
      { label: "Chlorine", value: "Low", tone: "warn" },
    ]);
  });

  it("falls back to the last test without a newer probe reading", () => {
    const pills = waterPills({ config, waterC: null, strip, probe: { ph: 7.5, orpMv: 640, measuredAt: daysAgo(3) } });
    expect(pills).toEqual([
      { label: "pH", value: "7.9", tone: "warn" },
      { label: "Chlorine", value: "OK", tone: "good" },
    ]);
  });

  it("shows a reading behind the red banner in red", () => {
    const high = { ...strip, sanitiserPpm: 12, recordedAt: hoursAgo(1) };
    const flags = [{ code: "sanitizer_too_high", message: "", severity: "danger" as const }];
    expect(waterPills({ config, waterC: null, strip: high, probe: null, safety: flags })[1]).toEqual({
      label: "Chlorine",
      value: "High",
      tone: "bad",
    });
  });

  it("shows nothing it doesn't know", () => {
    expect(waterPills({ config, waterC: null, strip: null, probe: null })).toEqual([]);
  });
});
