import SetupNeeded from "@/components/SetupNeeded";
import CompleteButton from "@/components/CompleteButton";
import FrequencyEditor from "@/components/FrequencyEditor";
import { Badge, Card } from "@/components/ui";
import { getTasks, toTaskLike } from "@/lib/data";
import { computeTaskLife } from "@/lib/tasks";
import {
  dueStatusLabel,
  dueStatusTone,
  lifeBarHex,
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
  const withLife = tasks
    .map((t) => ({ row: t, life: computeTaskLife(toTaskLike(t), now) }))
    .sort((a, b) => a.life.daysUntilDue - b.life.daysUntilDue);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Upkeep</h1>
        <p className="text-sm text-slate-500">
          Each bar shows how much “life” is left before a job is due. Tap Done to
          refill it — the next date updates automatically.
        </p>
      </div>

      <div className="space-y-3">
        {withLife.map(({ row, life }) => {
          const pct = Math.round(life.fractionRemaining * 100);
          const color = lifeBarHex(life.status, life.fractionRemaining);
          return (
            <Card key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{taskTypeIcons[row.task_type]}</span>
                  <div>
                    <p className="font-semibold text-slate-800">{row.name}</p>
                    <span className="text-xs text-slate-400">
                      next {formatDate(life.nextDueAt)}
                    </span>
                  </div>
                </div>
                <CompleteButton taskId={row.id} label="Done" />
              </div>

              {/* Life bar */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    {pct}% life left
                  </span>
                  <Badge tone={dueStatusTone(life.status)}>
                    {dueStatusLabel(life.status, life.daysUntilDue)}
                  </Badge>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>

              <div className="mt-2">
                <FrequencyEditor
                  taskId={row.id}
                  frequencyDays={row.frequency_days}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
