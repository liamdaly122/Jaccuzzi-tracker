import SetupNeeded from "@/components/SetupNeeded";
import Icon from "@/components/Icon";
import CompleteButton from "@/components/CompleteButton";
import FrequencyEditor from "@/components/FrequencyEditor";
import { Badge, Card } from "@/components/ui";
import WinterCard from "@/components/WinterCard";
import { getTasks, toTaskLike, getSettings, toSpaConfig } from "@/lib/data";
import { computeTaskLife } from "@/lib/tasks";
import { getForecast } from "@/lib/weather";
import { estimateRefillCost } from "@/lib/water";
import {
  compareWinterCosts,
  hibernationState,
  winterCountdown,
  winterLengthDays,
  winterWindow,
} from "@/lib/winter";
import {
  dueStatusLabel,
  dueStatusTone,
  lifeBarHex,
  taskTypeIcons,
  formatDate,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let tasks, settings;
  try {
    [tasks, settings] = await Promise.all([getTasks(), getSettings()]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const now = new Date();
  const withLife = tasks
    .map((t) => ({ row: t, life: computeTaskLife(toTaskLike(t), now) }))
    .sort((a, b) => a.life.daysUntilDue - b.life.daysUntilDue);

  // --- Winter shutdown -------------------------------------------------------
  const config = toSpaConfig(settings);
  const latitude = settings.latitude === null ? null : Number(settings.latitude);
  const window = winterWindow(latitude, now);
  const hibernation = hibernationState(
    settings.winterised_at ?? null,
    settings.winter_strategy ?? null,
    window,
  );

  // Only fetch a forecast when it could actually change the advice — no point
  // calling out in June, or once the tub is already packed away.
  let forecastDays: { date: string; tempMin: number }[] = [];
  if (
    !hibernation.hibernating &&
    window &&
    settings.latitude != null &&
    settings.longitude != null
  ) {
    const weather = await getForecast(
      Number(settings.latitude),
      Number(settings.longitude),
      settings.location_name ?? undefined,
    );
    forecastDays = weather?.days.map((d) => ({ date: d.date, tempMin: d.tempMin })) ?? [];
  }

  const countdown = winterCountdown(window, now, forecastDays);
  const costs = window
    ? compareWinterCosts(config.volumeLitres, winterLengthDays(window), {
        refillCost: estimateRefillCost(config.volumeLitres).totalCost,
      })
    : null;

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
                  <Icon name={taskTypeIcons[row.task_type]} size={24} className="text-brand-600" />
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

      {/* Below the tasks: it's a tall card and it's only relevant for a few
          months a year, whereas the life bars are what this page is opened for. */}
      <WinterCard
        window={window}
        countdown={countdown}
        costs={costs}
        hibernation={hibernation}
      />
    </div>
  );
}
