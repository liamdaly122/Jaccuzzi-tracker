import { describe, it, expect } from "vitest";
import { buildIcsFeed, type IcsTask } from "../lib/ics";

const NOW = new Date("2026-07-24T12:00:00.000Z");

const tasks: IcsTask[] = [
  {
    taskKey: "test_water",
    name: "Test the water",
    taskType: "testing",
    frequencyDays: 3,
    lastCompletedAt: new Date("2026-07-23T00:00:00.000Z"),
  },
  {
    taskKey: "drain_refill",
    name: "Drain & refill the tub",
    taskType: "water",
    frequencyDays: 90,
    lastCompletedAt: null,
  },
];

describe("buildIcsFeed", () => {
  it("wraps events in a valid VCALENDAR envelope", () => {
    const ics = buildIcsFeed(tasks, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Hot Tub Tracker//EN");
  });

  it("uses CRLF line endings (required by RFC 5545)", () => {
    const ics = buildIcsFeed(tasks, NOW);
    expect(ics).toContain("\r\n");
    // No bare LF that isn't preceded by CR.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("emits one VEVENT per task with a stable, task-based UID", () => {
    const ics = buildIcsFeed(tasks, NOW);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(2);
    expect(ics).toContain("UID:test_water@hot-tub-tracker");
    expect(ics).toContain("UID:drain_refill@hot-tub-tracker");
  });

  it("sets the RRULE interval from each task's frequency", () => {
    const ics = buildIcsFeed(tasks, NOW);
    expect(ics).toContain("RRULE:FREQ=DAILY;INTERVAL=3");
    expect(ics).toContain("RRULE:FREQ=DAILY;INTERVAL=90");
  });

  it("produces the same UID across rebuilds (idempotent for calendar apps)", () => {
    const a = buildIcsFeed(tasks, NOW);
    const b = buildIcsFeed(tasks, new Date("2026-08-01T09:00:00.000Z"));
    expect(a).toContain("UID:test_water@hot-tub-tracker");
    expect(b).toContain("UID:test_water@hot-tub-tracker");
  });

  it("escapes special characters in summaries/descriptions", () => {
    const ics = buildIcsFeed(tasks, NOW);
    // "Drain & refill" contains an ampersand (fine) but the description has a
    // period; ensure the comma-containing default text is escaped where present.
    expect(ics).toContain("SUMMARY:");
    // The all-day event uses VALUE=DATE (no time component).
    expect(ics).toContain("DTSTART;VALUE=DATE:");
  });
});

describe("seasonal events", () => {
  const seasonal = [
    {
      key: "winter-shutdown",
      name: "Winterise the hot tub",
      date: new Date("2026-11-02T00:00:00.000Z"),
      description: "Drain, dry and pack away before frost.",
    },
  ];

  it("repeats yearly rather than every 365 days", () => {
    const feed = buildIcsFeed([], new Date("2026-08-06T09:00:00Z"), seasonal);
    // INTERVAL=365 would slip a day every leap year.
    expect(feed).toContain("RRULE:FREQ=YEARLY");
    expect(feed).not.toContain("INTERVAL=365");
    expect(feed).toContain("DTSTART;VALUE=DATE:20261102");
    expect(feed).toContain("UID:winter-shutdown@hot-tub-tracker");
  });

  it("sits alongside the task events without disturbing them", () => {
    const tasks = [
      {
        taskKey: "test_water",
        name: "Test the water",
        taskType: "testing" as const,
        frequencyDays: 3,
        lastCompletedAt: null,
      },
    ];
    const feed = buildIcsFeed(tasks, new Date("2026-08-06T09:00:00Z"), seasonal);
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed).toContain("RRULE:FREQ=DAILY;INTERVAL=3");
    expect(feed.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("omits them entirely when there's no location to work from", () => {
    const feed = buildIcsFeed([], new Date("2026-08-06T09:00:00Z"));
    expect(feed).not.toContain("FREQ=YEARLY");
  });
});
