"use client";

// =============================================================================
//  components/CalendarView.tsx
//  The month at a glance: a dot for each job due that day, tap a day to see
//  what's on it. One colour for every dot — the list below names them, so
//  there's no legend to learn.
// =============================================================================

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { generateOccurrences, type Occurrence } from "@/lib/tasks";
import { taskTypeIcons } from "@/lib/display";
import type { TaskType } from "@/lib/types";
import CompleteButton from "./CompleteButton";
import Icon from "./Icon";
import { Card, Row, Section } from "./ui";

export interface CalendarTask {
  id: number;
  taskKey: string;
  name: string;
  taskType: TaskType;
  frequencyDays: number;
  lastCompletedAt: string | null;
}

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
  const [selected, setSelected] = useState(() => today);

  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const t of tasks) {
      for (const o of generateOccurrences(t, gridStart, gridEnd, now)) {
        const k = format(o.date, "yyyy-MM-dd");
        map.set(k, [...(map.get(k) ?? []), o]);
      }
    }
    for (const m of seasonal) {
      const date = new Date(m.date);
      if (!Number.isFinite(date.getTime()) || date < gridStart || date > gridEnd) continue;
      const k = format(date, "yyyy-MM-dd");
      map.set(k, [...(map.get(k) ?? []), { taskKey: m.key, name: m.name, taskType: "water", date }]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, seasonal, gridStart.getTime(), gridEnd.getTime()]);

  const taskByKey = new Map(tasks.map((t) => [t.taskKey, t]));
  const onDay = byDay.get(format(selected, "yyyy-MM-dd")) ?? [];
  const canTick = selected.getTime() <= today.getTime();
  const navBtn =
    "grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink-2";

  return (
    <>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" className={navBtn} aria-label="Previous month" onClick={() => setViewMonth(subMonths(monthStart, 1))}>
            <Icon name="chevron" size={20} className="rotate-90" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-lg font-extrabold">{format(monthStart, "MMMM yyyy")}</h3>
            {!isSameMonth(monthStart, now) ? (
              <button
                type="button"
                className="min-h-9 rounded-full bg-surface-2 px-3 text-[13px] font-bold text-ink-2"
                onClick={() => {
                  setViewMonth(startOfMonth(now));
                  setSelected(today);
                }}
              >
                Today
              </button>
            ) : null}
          </div>
          <button type="button" className={navBtn} aria-label="Next month" onClick={() => setViewMonth(addMonths(monthStart, 1))}>
            <Icon name="chevron" size={20} className="-rotate-90" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="py-1 text-xs font-extrabold text-ink-3">
              {d}
            </span>
          ))}
          {gridDays.map((day) => {
            const occ = byDay.get(format(day, "yyyy-MM-dd")) ?? [];
            const inMonth = isSameMonth(day, monthStart);
            const isSel = isSameDay(day, selected);
            const isToday = isSameDay(day, now);
            return (
              <button
                key={day.toISOString()}
                type="button"
                aria-pressed={isSel}
                aria-label={`${format(day, "EEEE d MMMM")}${occ.length ? `, ${occ.length} job${occ.length > 1 ? "s" : ""}` : ""}`}
                onClick={() => setSelected(startOfDay(day))}
                className={`grid min-h-[46px] content-center justify-items-center gap-1 rounded-ctl text-[14.5px] font-semibold ${
                  isSel ? "bg-accent text-on-accent" : inMonth ? "text-ink" : "text-ink-3/60"
                } ${isToday && !isSel ? "ring-[1.5px] ring-inset ring-accent-ink" : ""}`}
              >
                <span>{format(day, "d")}</span>
                <span className="flex h-[5px] gap-0.5">
                  {occ.slice(0, 3).map((o, i) => (
                    <i key={i} className={`h-[5px] w-[5px] rounded-full ${isSel ? "bg-on-accent" : "bg-accent"}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Section title={isSameDay(selected, now) ? "Today" : format(selected, "EEEE d MMMM")}>
        <Card flush>
          {onDay.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-2">Nothing due that day.</p>
          ) : (
            onDay.map((o, i) => {
              const task = taskByKey.get(o.taskKey);
              return (
                <Row
                  key={`${o.taskKey}-${i}`}
                  icon={taskTypeIcons[o.taskType]}
                  title={o.name}
                  sub={task ? `Every ${task.frequencyDays} days` : "Once a year"}
                  right={task && canTick ? <CompleteButton taskId={task.id} name={task.name} /> : undefined}
                />
              );
            })
          )}
        </Card>
        <p className="px-0.5 text-[13.5px] text-ink-2">
          Add these to your phone&apos;s calendar from Settings.
        </p>
      </Section>
    </>
  );
}
