// =============================================================================
//  lib/ics.ts
//  Pure builder for an iCalendar (.ics) feed. NO I/O — takes tasks + a clock
//  and returns the feed text, so it can be unit-tested.
//
//  Design: ONE all-day VEVENT per task, repeating with RRULE:FREQ=DAILY;
//  INTERVAL=<frequencyDays>. Using a stable, task-based UID means a calendar
//  app updates the same event on each poll instead of piling up duplicates.
// =============================================================================

import { computeNextDue, type TaskType } from "./tasks";

export interface IcsTask {
  taskKey: string;
  name: string;
  taskType: TaskType;
  frequencyDays: number;
  lastCompletedAt: string | Date | null;
}

// Format a Date as an all-day value: YYYYMMDD (UTC).
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Format a Date as a UTC timestamp: YYYYMMDDTHHMMSSZ.
function formatStamp(d: Date): string {
  return (
    formatDate(d) +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const CRLF = "\r\n";

export function buildIcsFeed(
  tasks: IcsTask[],
  now: Date = new Date(),
): string {
  const stamp = formatStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hot Tub Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hot Tub Maintenance",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const task of tasks) {
    const { nextDueAt } = computeNextDue(
      { frequencyDays: task.frequencyDays, lastCompletedAt: task.lastCompletedAt },
      now,
    );
    const start = new Date(
      Date.UTC(
        nextDueAt.getUTCFullYear(),
        nextDueAt.getUTCMonth(),
        nextDueAt.getUTCDate(),
      ),
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.taskKey}@hot-tub-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatDate(start)}`,
      `DTEND;VALUE=DATE:${formatDate(end)}`,
      `RRULE:FREQ=DAILY;INTERVAL=${task.frequencyDays}`,
      `SUMMARY:${escapeText("🛁 " + task.name)}`,
      `DESCRIPTION:${escapeText(
        `Hot tub maintenance: ${task.name}. Every ${task.frequencyDays} day(s).`,
      )}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}
