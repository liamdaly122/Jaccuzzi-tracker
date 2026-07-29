import SetupNeeded from "@/components/SetupNeeded";
import CalendarView, { type CalendarTask } from "@/components/CalendarView";
import { getTasks } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let tasks;
  try {
    tasks = await getTasks();
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
      <CalendarView tasks={calendarTasks} />
    </div>
  );
}
