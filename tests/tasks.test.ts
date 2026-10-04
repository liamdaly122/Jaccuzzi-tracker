import { describe, it, expect } from "vitest";
import {
  computeNextDue,
  computeTaskLife,
  generateOccurrences,
  type OccurrenceTemplate,
  planUndo,
  UNDO_WINDOW_MINUTES,
} from "../lib/tasks";

const NOW = new Date("2026-07-24T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

describe("computeNextDue", () => {
  it("treats a never-completed task as overdue right now", () => {
    const info = computeNextDue({ frequencyDays: 3, lastCompletedAt: null }, NOW);
    expect(info.status).toBe("overdue");
    expect(info.daysUntilDue).toBe(0);
    expect(info.nextDueAt.getTime()).toBe(NOW.getTime());
  });

  it("is 'ok' when recently completed and well within the interval", () => {
    const info = computeNextDue(
      { frequencyDays: 7, lastCompletedAt: NOW },
      NOW,
    );
    expect(info.status).toBe("ok");
    expect(info.daysUntilDue).toBe(7);
  });

  it("is 'due_soon' exactly on the due date (boundary)", () => {
    const info = computeNextDue(
      { frequencyDays: 3, lastCompletedAt: daysAgo(3) },
      NOW,
    );
    expect(info.daysUntilDue).toBe(0);
    expect(info.status).toBe("due_soon");
  });

  it("is 'due_soon' one day before due (inside the window)", () => {
    const info = computeNextDue(
      { frequencyDays: 3, lastCompletedAt: daysAgo(2) },
      NOW,
    );
    expect(info.daysUntilDue).toBe(1);
    expect(info.status).toBe("due_soon");
  });

  it("is 'ok' just outside the due-soon window", () => {
    const info = computeNextDue(
      { frequencyDays: 3, lastCompletedAt: daysAgo(1) },
      NOW,
    );
    expect(info.daysUntilDue).toBe(2);
    expect(info.status).toBe("ok");
  });

  it("is 'overdue' with a negative day count when past due", () => {
    const info = computeNextDue(
      { frequencyDays: 3, lastCompletedAt: daysAgo(5) },
      NOW,
    );
    expect(info.daysUntilDue).toBe(-2);
    expect(info.status).toBe("overdue");
  });

  it("accepts an ISO string for lastCompletedAt", () => {
    const info = computeNextDue(
      { frequencyDays: 3, lastCompletedAt: daysAgo(5).toISOString() },
      NOW,
    );
    expect(info.status).toBe("overdue");
  });

  it("throws on a non-positive frequency (guards bad data)", () => {
    expect(() =>
      computeNextDue({ frequencyDays: 0, lastCompletedAt: NOW }, NOW),
    ).toThrow();
    expect(() =>
      computeNextDue({ frequencyDays: -5, lastCompletedAt: NOW }, NOW),
    ).toThrow();
  });
});

describe("computeTaskLife", () => {
  it("is full right after completion", () => {
    const life = computeTaskLife({ frequencyDays: 10, lastCompletedAt: NOW }, NOW);
    expect(life.fractionRemaining).toBeCloseTo(1, 5);
    expect(life.status).toBe("ok");
  });

  it("is half at the midpoint of the cycle", () => {
    const life = computeTaskLife(
      { frequencyDays: 10, lastCompletedAt: daysAgo(5) },
      NOW,
    );
    expect(life.fractionRemaining).toBeCloseTo(0.5, 5);
  });

  it("is empty exactly on the due date", () => {
    const life = computeTaskLife(
      { frequencyDays: 10, lastCompletedAt: daysAgo(10) },
      NOW,
    );
    expect(life.fractionRemaining).toBe(0);
  });

  it("clamps to zero when overdue", () => {
    const life = computeTaskLife(
      { frequencyDays: 10, lastCompletedAt: daysAgo(15) },
      NOW,
    );
    expect(life.fractionRemaining).toBe(0);
    expect(life.status).toBe("overdue");
    expect(life.daysUntilDue).toBe(-5);
  });

  it("is empty and overdue when never completed", () => {
    const life = computeTaskLife(
      { frequencyDays: 10, lastCompletedAt: null },
      NOW,
    );
    expect(life.fractionRemaining).toBe(0);
    expect(life.status).toBe("overdue");
  });
});

describe("generateOccurrences", () => {
  const task: OccurrenceTemplate = {
    taskKey: "rinse_filter",
    name: "Rinse the filter cartridge",
    taskType: "filter",
    frequencyDays: 7,
    lastCompletedAt: new Date("2026-07-01T12:00:00.000Z"),
  };

  it("emits the correct count and spacing within a window", () => {
    const start = new Date("2026-07-01T00:00:00.000Z");
    const end = new Date("2026-07-31T23:59:59.000Z");
    const occ = generateOccurrences(task, start, end, NOW);

    // Next due = Jul 8, then 15, 22, 29 -> 4 occurrences.
    expect(occ).toHaveLength(4);

    // Every consecutive gap is exactly frequencyDays.
    for (let i = 1; i < occ.length; i++) {
      expect(occ[i].date.getTime() - occ[i - 1].date.getTime()).toBe(7 * DAY);
    }
    // First occurrence carries the template metadata through.
    expect(occ[0].taskKey).toBe("rinse_filter");
    expect(occ[0].taskType).toBe("filter");
  });

  it("returns nothing when the window is entirely before the next due date", () => {
    const start = new Date("2026-06-01T00:00:00.000Z");
    const end = new Date("2026-06-30T00:00:00.000Z");
    // Next due is Jul 8, so a June window is empty.
    expect(generateOccurrences(task, start, end, NOW)).toHaveLength(0);
  });

  it("throws on a non-positive frequency (infinite-loop guard)", () => {
    const bad = { ...task, frequencyDays: 0 };
    expect(() =>
      generateOccurrences(bad, new Date("2026-07-01"), new Date("2026-07-31"), NOW),
    ).toThrow();
  });
});

describe("planUndo", () => {
  const now = new Date("2026-10-04T14:10:00.000Z");
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  it("takes back a tick made a moment ago, restoring the one before", () => {
    const plan = planUndo(
      [
        { id: 9, completed_at: minsAgo(1) },
        { id: 4, completed_at: "2026-09-27T10:00:00.000Z" },
      ],
      now,
    );
    expect(plan).toEqual({ deleteId: 9, restoreTo: "2026-09-27T10:00:00.000Z" });
  });

  it("goes back to never-done when it was the first completion", () => {
    expect(planUndo([{ id: 1, completed_at: minsAgo(2) }], now)).toEqual({
      deleteId: 1,
      restoreTo: null,
    });
  });

  it("refuses to rewrite older history", () => {
    expect(
      planUndo([{ id: 3, completed_at: minsAgo(UNDO_WINDOW_MINUTES + 1) }], now),
    ).toBeNull();
    expect(planUndo([], now)).toBeNull();
  });
});
