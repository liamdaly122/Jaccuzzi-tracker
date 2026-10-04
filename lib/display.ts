// Shared display helpers (labels, colours, icons). Safe for client & server.
import type { DueStatus, TaskType } from "./tasks";
import type { IconName } from "./icons";
import { APP_TIME_ZONE } from "./clock";

export const taskTypeIcons: Record<TaskType, IconName> = {
  testing: "flask",
  sanitizing: "droplet",
  filter: "filter",
  water: "shower",
  cleaning: "sponge",
};

// e.g. "24 Jul 2026" — stable, locale-independent.
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Tones ---------------------------------------------------------------------
// The semantic colour of a thing, which components/ui.tsx turns into token
// classes. Kept here so lib/ code can choose a tone without importing React.
export type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "heat";

/** A job's life bar: plenty of life is good, running low warns, late is bad. */
export function lifeTone(status: DueStatus, fractionRemaining: number): Tone {
  if (status === "overdue") return "bad";
  if (status === "due_soon" || fractionRemaining <= 0.25) return "warn";
  return "good";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 6 Oct" — fixed format, so it never varies with the browser's locale data. */
export function shortDay(d: Date): string {
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

/** The chip beside a job: when it's due, in words, and how worried to be. */
export function dueChip(status: DueStatus, daysUntilDue: number, nextDueAt: Date): [string, Tone] {
  if (status === "overdue" && daysUntilDue < 0) {
    const late = Math.abs(daysUntilDue);
    return [`${late} day${late === 1 ? "" : "s"} overdue`, "bad"];
  }
  if (daysUntilDue <= 0) return ["Due today", "warn"];
  if (daysUntilDue === 1) return ["Tomorrow", "warn"];
  if (daysUntilDue <= 7) return [shortDay(nextDueAt), "neutral"];
  return [`In ${daysUntilDue} days`, "neutral"];
}
