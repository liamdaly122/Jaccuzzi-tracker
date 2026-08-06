import SetupNeeded from "@/components/SetupNeeded";
import CalendarView, {
  type CalendarTask,
  type SeasonalMarker,
} from "@/components/CalendarView";
import { getTasks, getSettings } from "@/lib/data";
import { winterWindow } from "@/lib/winter";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let tasks, settings;
  try {
    [tasks, settings] = await Promise.all([getTasks(), getSettings()]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const calendarTasks: CalendarTask[] = tasks.map((t) => ({
    id: t.id,
    taskKey: t.task_key,
    name: t.name,
    taskType: t.task_type,
    frequencyDays: t.frequency_days,
    lastCompletedAt: t.last_completed_at,
  }));

  // Seasonal markers, once we know roughly where the tub lives.
  const seasonal: SeasonalMarker[] = [];
  const w = winterWindow(
    settings.latitude === null ? null : Number(settings.latitude),
    new Date(),
  );
  if (w) {
    seasonal.push({
      key: "winter-shutdown",
      name: "Winterise the hot tub",
      date: w.deadline.toISOString(),
    });
    seasonal.push({
      key: "spring-reopen",
      name: "Get the hot tub back out",
      date: w.reopen.toISOString(),
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
      <CalendarView tasks={calendarTasks} seasonal={seasonal} />
    </div>
  );
}
