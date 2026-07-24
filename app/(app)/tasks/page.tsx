import SetupNeeded from "@/components/SetupNeeded";
import CompleteButton from "@/components/CompleteButton";
import FrequencyEditor from "@/components/FrequencyEditor";
import { Badge, Card } from "@/components/ui";
import { getTasks, toTaskLike } from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import {
  dueStatusLabel,
  dueStatusTone,
  taskTypeIcons,
  formatDate,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let tasks;
  try {
    tasks = await getTasks();
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const now = new Date();
  const withInfo = tasks
    .map((t) => ({ row: t, info: computeNextDue(toTaskLike(t), now) }))
    .sort((a, b) => a.info.daysUntilDue - b.info.daysUntilDue);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Tasks</h1>
        <p className="text-sm text-slate-500">
          Your recurring maintenance. Tick things off and the next date updates
          automatically.
        </p>
      </div>

      <div className="space-y-3">
        {withInfo.map(({ row, info }) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{taskTypeIcons[row.task_type]}</span>
                <div>
                  <p className="font-semibold text-slate-800">{row.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={dueStatusTone(info.status)}>
                      {dueStatusLabel(info.status, info.daysUntilDue)}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      next {formatDate(info.nextDueAt)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <FrequencyEditor
                      taskId={row.id}
                      frequencyDays={row.frequency_days}
                    />
                  </div>
                </div>
              </div>
              <CompleteButton taskId={row.id} label="Done" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
