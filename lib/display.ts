// Shared display helpers (labels, colours, icons). Safe for client & server.
import type { DueStatus, TaskType } from "./tasks";

export const taskTypeIcons: Record<TaskType, string> = {
  testing: "🧪",
  sanitizing: "💧",
  filter: "🧽",
  water: "🚿",
  cleaning: "🧼",
};

export const taskTypeColors: Record<TaskType, string> = {
  testing: "bg-brand-500",
  sanitizing: "bg-emerald-500",
  filter: "bg-violet-500",
  water: "bg-sky-500",
  cleaning: "bg-amber-500",
};

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
