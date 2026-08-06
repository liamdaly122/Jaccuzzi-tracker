"use client";

import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addDays,
  format,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { generateOccurrences, type Occurrence } from "@/lib/tasks";
import { taskTypeHex, taskTypeIcons } from "@/lib/display";
import { Badge, Card } from "./ui";
import CompleteButton from "./CompleteButton";
import Icon from "./Icon";

// Serializable task shape passed from the server page.
export interface CalendarTask {
  id: number;
  taskKey: string;
  name: string;
  taskType: keyof typeof taskTypeHex;
  frequencyDays: number;
  lastCompletedAt: string | null;
}

const UPCOMING_WINDOW_DAYS = 90;
const UPCOMING_COUNT = 10;

// Seasonal one-a-year markers (winter shutdown, spring reopen). They aren't
// maintenance tasks — they have no completion cadence — so they arrive
// separately and get folded into the same day map.
export interface SeasonalMarker {
  key: string;
  name: string;
  date: string;
}

export default function CalendarView({
  tasks,
  seasonal = [],
}: {
  tasks: CalendarTask[];
  seasonal?: SeasonalMarker[];
}) {
  const now = useMemo(() => new Date(), []);
  const today = startOfDay(now);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(now));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(now));

  const taskByKey = useMemo(() => {
    const m = new Map<string, CalendarTask>();
    for (const t of tasks) m.set(t.taskKey, t);
    return m;
  }, [tasks]);

  // Grid bounds (Monday-start weeks covering the visible month).
  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Compute occurrences across a range wide enough for both the grid and the
  // upcoming list, then derive everything from one pass.
  const rangeStart = gridStart < today ? gridStart : today;
  const rangeEnd =
    gridEnd > addDays(today, UPCOMING_WINDOW_DAYS)
      ? gridEnd
      : addDays(today, UPCOMING_WINDOW_DAYS);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const t of tasks) {
      const occ = generateOccurrences(t, rangeStart, rangeEnd, now);
      for (const o of occ) {
        const key = format(o.date, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push(o);
        map.set(key, list);
      }
    }
    // Winterising is a water job, so it shares that colour on the grid.
    for (const m of seasonal) {
      const date = new Date(m.date);
      if (!Number.isFinite(date.getTime())) continue;
      if (date < rangeStart || date > rangeEnd) continue;
      const key = format(date, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push({ taskKey: m.key, name: m.name, taskType: "water", date });
      map.set(key, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, seasonal, rangeStart.getTime(), rangeEnd.getTime()]);

  const selectedKey = format(selectedDate, "yyyy-MM-dd");
  const selectedOccurrences = byDay.get(selectedKey) ?? [];

  const upcoming = useMemo(() => {
    const all: Occurrence[] = [];
    for (const list of byDay.values()) all.push(...list);
    return all
      .filter((o) => o.date.getTime() >= today.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, UPCOMING_COUNT);
  }, [byDay, today]);

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const selectedIsPastOrToday =
    startOfDay(selectedDate).getTime() <= today.getTime();

  function jumpTo(date: Date) {
    setSelectedDate(startOfDay(date));
    setViewMonth(startOfMonth(date));
  }

  return (
    <div className="space-y-4">
      <Card>
        {/* Month navigation */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setViewMonth(subMonths(monthStart, 1))}
            aria-label="Previous month"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            ← Prev
          </button>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-800">
              {format(monthStart, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => {
                setViewMonth(startOfMonth(now));
                setSelectedDate(startOfDay(now));
              }}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => setViewMonth(addMonths(monthStart, 1))}
            aria-label="Next month"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            Next →
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div
              key={w}
              className="pb-1 text-center text-xs font-medium text-slate-400"
            >
              {w}
            </div>
          ))}
          {gridDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const occ = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, now);
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(startOfDay(day))}
                className={`min-h-[52px] rounded-lg border p-1 text-left transition ${
                  isSelected
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300"
                    : inMonth
                      ? "border-slate-100 bg-white hover:bg-slate-50"
                      : "border-transparent bg-slate-50"
                }`}
              >
                <div
                  className={`text-right text-xs ${
                    isToday
                      ? "font-bold text-brand-600"
                      : inMonth
                        ? "text-slate-500"
                        : "text-slate-300"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {occ.map((o, i) => (
                    <span
                      key={`${o.taskKey}-${i}`}
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: taskTypeHex[o.taskType] }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected-day detail */}
      <Card>
        <h3 className="mb-2 font-semibold text-slate-800">
          {isSameDay(selectedDate, now)
            ? "Today"
            : format(selectedDate, "EEEE d MMMM")}
        </h3>
        {selectedOccurrences.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing scheduled this day. 🌿</p>
        ) : (
          <ul className="space-y-2">
            {selectedOccurrences.map((o, i) => {
              const task = taskByKey.get(o.taskKey);
              return (
                <li
                  key={`${o.taskKey}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon name={taskTypeIcons[o.taskType]} size={22} className="text-brand-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {o.name}
                      </p>
                      <Badge tone="slate">every {task?.frequencyDays}d</Badge>
                    </div>
                  </div>
                  {task && selectedIsPastOrToday ? (
                    <CompleteButton taskId={task.id} label="Done" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Upcoming */}
      <Card>
        <h3 className="mb-2 font-semibold text-slate-800">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing coming up. You&apos;re clear!</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((o, i) => (
              <li key={`${o.taskKey}-${i}`}>
                <button
                  onClick={() => jumpTo(o.date)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: taskTypeHex[o.taskType] }}
                    />
                    <span className="text-sm text-slate-700">{o.name}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {isSameDay(o.date, now)
                      ? "today"
                      : format(o.date, "EEE d MMM")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Legend */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          What&apos;s what
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(taskTypeIcons).map(([type, icon]) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: taskTypeHex[type as keyof typeof taskTypeHex],
                }}
              />
              <span className="flex items-center gap-1.5 text-slate-600">
                <Icon name={icon} size={16} />
                {type}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Want these in your phone&apos;s calendar app? See the calendar
        subscription link in Settings.
      </p>
    </div>
  );
}
