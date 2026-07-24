import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  parse,
} from "date-fns";
import SetupNeeded from "@/components/SetupNeeded";
import { Card } from "@/components/ui";
import { getTasks, toTaskLike } from "@/lib/data";
import { generateOccurrences, type Occurrence } from "@/lib/tasks";
import { taskTypeColors, taskTypeIcons } from "@/lib/display";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string }>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  let tasks;
  try {
    tasks = await getTasks();
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const { month } = await searchParams;
  const now = new Date();
  const anchor = month
    ? parse(month, "yyyy-MM", new Date())
    : startOfMonth(now);

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Collect every occurrence within the visible grid, bucketed by day-key.
  const byDay = new Map<string, Occurrence[]>();
  for (const t of tasks) {
    const occ = generateOccurrences(toTaskLike(t), gridStart, gridEnd, now);
    for (const o of occ) {
      const key = format(o.date, "yyyy-MM-dd");
      const list = byDay.get(key) ?? [];
      list.push(o);
      byDay.set(key, list);
    }
  }

  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Link
            href={`/calendar?month=${prevMonth}`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            ← Prev
          </Link>
          <h2 className="font-semibold text-slate-800">
            {format(monthStart, "MMMM yyyy")}
          </h2>
          <Link
            href={`/calendar?month=${nextMonth}`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            Next →
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div
              key={w}
              className="pb-1 text-center text-xs font-medium text-slate-400"
            >
              {w}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const occ = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, now);
            return (
              <div
                key={key}
                className={`min-h-[64px] rounded-lg border p-1 ${
                  inMonth
                    ? "border-slate-100 bg-white"
                    : "border-transparent bg-slate-50"
                } ${isToday ? "ring-2 ring-brand-400" : ""}`}
              >
                <div
                  className={`text-right text-xs ${
                    inMonth ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {occ.map((o, i) => (
                    <span
                      key={`${o.taskKey}-${i}`}
                      title={o.name}
                      className={`h-2 w-2 rounded-full ${taskTypeColors[o.taskType]}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Legend */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">What&apos;s what</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(taskTypeIcons).map(([type, icon]) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  taskTypeColors[type as keyof typeof taskTypeColors]
                }`}
              />
              <span className="text-slate-600">
                {icon} {type}
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
