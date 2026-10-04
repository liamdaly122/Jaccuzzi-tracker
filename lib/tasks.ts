// =============================================================================
//  lib/tasks.ts
//  Pure recurring-task scheduling. NO database, NO network, NO side effects.
//
//  "Next due" is NEVER stored — it is always derived from frequency_days and
//  last_completed_at at read time. That means ticking a task off instantly and
//  correctly reshapes every future occurrence, with no background job.
// =============================================================================

import { addDays } from "date-fns";

export type TaskType =
  | "testing"
  | "sanitizing"
  | "filter"
  | "water"
  | "cleaning";

export type DueStatus = "ok" | "due_soon" | "overdue";

export interface TaskLike {
  frequencyDays: number;
  lastCompletedAt: string | Date | null;
}

export interface NextDueInfo {
  nextDueAt: Date;
  daysUntilDue: number; // negative = overdue
  status: DueStatus;
}

// Whole-day difference from `now` to `target` (target - now), rounded so that
// day-granularity comparisons are stable regardless of the time of day.
function wholeDaysUntil(target: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - now.getTime()) / msPerDay);
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

// -----------------------------------------------------------------------------
// computeNextDue: when is this task next due, and is it ok / due soon / overdue?
//
//   anchor      = lastCompletedAt if set, otherwise `now`
//                 (a never-completed task is due immediately — a fresh install
//                  shows everything as "do this once to start the cycle").
//   nextDueAt   = anchor + frequencyDays
// -----------------------------------------------------------------------------
export function computeNextDue(
  task: TaskLike,
  now: Date = new Date(),
  dueSoonWindowDays = 1,
): NextDueInfo {
  if (!Number.isFinite(task.frequencyDays) || task.frequencyDays <= 0) {
    throw new Error(
      `computeNextDue: frequencyDays must be a positive number, got ${task.frequencyDays}`,
    );
  }

  const last = toDate(task.lastCompletedAt);

  // Never completed → due right now.
  if (last === null) {
    return { nextDueAt: new Date(now), daysUntilDue: 0, status: "overdue" };
  }

  const nextDueAt = addDays(last, task.frequencyDays);
  const daysUntilDue = wholeDaysUntil(nextDueAt, now);

  let status: DueStatus;
  if (daysUntilDue < 0) {
    status = "overdue";
  } else if (daysUntilDue <= dueSoonWindowDays) {
    status = "due_soon";
  } else {
    status = "ok";
  }

  return { nextDueAt, daysUntilDue, status };
}

export interface TaskLife {
  fractionRemaining: number; // 1 = just done, 0 = due now / overdue
  daysUntilDue: number; // negative = overdue
  status: DueStatus;
  nextDueAt: Date;
}

// "Life remaining" for a recurring task, like a robot-vacuum consumable bar:
// full right after it's done, emptying smoothly to 0 by its due date. Used to
// draw a countdown progress bar per maintenance item.
export function computeTaskLife(
  task: TaskLike,
  now: Date = new Date(),
): TaskLife {
  const { nextDueAt, daysUntilDue, status } = computeNextDue(task, now);
  const cycleMs = task.frequencyDays * 24 * 60 * 60 * 1000;
  const remainingMs = nextDueAt.getTime() - now.getTime();
  const fractionRemaining = Math.max(0, Math.min(1, remainingMs / cycleMs));
  return { fractionRemaining, daysUntilDue, status, nextDueAt };
}

export interface OccurrenceTemplate {
  taskKey: string;
  name: string;
  taskType: TaskType;
  frequencyDays: number;
  lastCompletedAt: string | Date | null;
}

export interface Occurrence {
  taskKey: string;
  name: string;
  taskType: TaskType;
  date: Date;
}

// Safety cap so a bad frequency can never produce an unbounded loop.
const MAX_OCCURRENCES = 1000;

// -----------------------------------------------------------------------------
// generateOccurrences: every due-date for a task that falls within
// [rangeStart, rangeEnd], walking nextDueAt, +freq, +2*freq, ...
// Used by the in-app calendar month grid.
// -----------------------------------------------------------------------------
export function generateOccurrences(
  task: OccurrenceTemplate,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date = new Date(),
): Occurrence[] {
  if (!Number.isFinite(task.frequencyDays) || task.frequencyDays <= 0) {
    throw new Error(
      `generateOccurrences: frequencyDays must be a positive number, got ${task.frequencyDays}`,
    );
  }

  const occurrences: Occurrence[] = [];
  const { nextDueAt } = computeNextDue(
    { frequencyDays: task.frequencyDays, lastCompletedAt: task.lastCompletedAt },
    now,
  );

  let cursor = nextDueAt;
  let guard = 0;

  // Fast-forward to the start of the window without emitting.
  while (cursor.getTime() < rangeStart.getTime() && guard < MAX_OCCURRENCES) {
    cursor = addDays(cursor, task.frequencyDays);
    guard++;
  }

  // Emit every occurrence inside the window.
  while (cursor.getTime() <= rangeEnd.getTime() && guard < MAX_OCCURRENCES) {
    occurrences.push({
      taskKey: task.taskKey,
      name: task.name,
      taskType: task.taskType,
      date: new Date(cursor),
    });
    cursor = addDays(cursor, task.frequencyDays);
    guard++;
  }

  return occurrences;
}

// -----------------------------------------------------------------------------
// planUndo — taking back a mis-tapped "Done". Only the newest completion can
// be undone, and only for a short while, so an Undo button can never quietly
// rewrite older history. The task's "last done" falls back to the completion
// before it, or to never.
// -----------------------------------------------------------------------------
export const UNDO_WINDOW_MINUTES = 15;

export interface CompletionLike {
  id: number;
  completed_at: string;
}

export function planUndo(
  completionsNewestFirst: CompletionLike[],
  now: Date = new Date(),
): { deleteId: number; restoreTo: string | null } | null {
  const [newest, previous] = completionsNewestFirst;
  if (!newest) return null;
  const age = now.getTime() - new Date(newest.completed_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > UNDO_WINDOW_MINUTES * 60_000) {
    return null;
  }
  return { deleteId: newest.id, restoreTo: previous?.completed_at ?? null };
}
