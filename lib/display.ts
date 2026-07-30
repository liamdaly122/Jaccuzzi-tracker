// Shared display helpers (labels, colours, icons). Safe for client & server.
import type { DueStatus, TaskType } from "./tasks";
import type { IconName } from "./icons";

export const taskTypeIcons: Record<TaskType, IconName> = {
  testing: "flask",
  sanitizing: "droplet",
  filter: "filter",
  water: "shower",
  cleaning: "sponge",
};

// Hex colours (not Tailwind classes) so the dots always render — Tailwind only
// scans app/ and components/, so colour classes defined here would get purged.
// Five clearly-distinct, easy-to-spot hues.
export const taskTypeHex: Record<TaskType, string> = {
  testing: "#2563eb", // blue
  sanitizing: "#16a34a", // green
  filter: "#9333ea", // purple
  water: "#dc2626", // red
  cleaning: "#f97316", // orange
};

// Colour for a task's "life remaining" bar (inline hex, purge-proof):
// green when there's plenty of life, amber as it runs low, red when overdue.
export function lifeBarHex(status: DueStatus, fractionRemaining: number): string {
  if (status === "overdue") return "#dc2626"; // red
  if (status === "due_soon" || fractionRemaining <= 0.25) return "#f59e0b"; // amber
  return "#16a34a"; // green
}

export function dueStatusLabel(status: DueStatus, daysUntilDue: number): string {
  if (status === "overdue") {
    const late = Math.abs(daysUntilDue);
    if (daysUntilDue === 0) return "Due today";
    return `${late} day${late === 1 ? "" : "s"} overdue`;
  }
  if (status === "due_soon") {
    if (daysUntilDue === 0) return "Due today";
    return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  }
  return `Due in ${daysUntilDue} days`;
}

export function dueStatusTone(status: DueStatus): "red" | "amber" | "green" {
  if (status === "overdue") return "red";
  if (status === "due_soon") return "amber";
  return "green";
}

// e.g. "24 Jul 2026" — stable, locale-independent.
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
