import Link from "next/link";
import SetupNeeded from "@/components/SetupNeeded";
import CompleteButton from "@/components/CompleteButton";
import ApplyIntervalButton from "@/components/ApplyIntervalButton";
import { Badge, Card, LinkButton } from "@/components/ui";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  getLastNotification,
  toTaskLike,
} from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import { calculateRecommendations } from "@/lib/chemistry";
import { computeWaterChangeIntervalDays, daysSince } from "@/lib/water";
import {
  dueStatusLabel,
  dueStatusTone,
  taskTypeIcons,
  formatDateTime,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let settings, tasks, latest, lastNotification;
  try {
    [settings, tasks, latest, lastNotification] = await Promise.all([
      getSettings(),
      getTasks(),
      getLatestReading(),
      getLastNotification(),
    ]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const now = new Date();
  const config = toSpaConfig(settings);

  // Compute the latest reading's status for the top banner.
  let calc = null;
  if (latest) {
    calc = calculateRecommendations(
      {
        ph: Number(latest.ph),
        freeChlorinePpm:
          latest.free_chlorine_ppm === null ? null : Number(latest.free_chlorine_ppm),
        brominePpm: latest.bromine_ppm === null ? null : Number(latest.bromine_ppm),
        totalAlkalinityPpm: Number(latest.total_alkalinity_ppm),
        calciumHardnessPpm:
          latest.calcium_hardness_ppm === null
            ? null
            : Number(latest.calcium_hardness_ppm),
        isFreshFill: latest.is_fresh_fill,
      },
      config,
    );
  }

  const dueTasks = tasks
    .map((t) => ({ row: t, info: computeNextDue(toTaskLike(t), now) }))
    .filter((t) => t.info.status !== "ok")
    .sort((a, b) => a.info.daysUntilDue - b.info.daysUntilDue);

  const hasDanger = calc?.safetyFlags.some((f) => f.severity === "danger");

  // Smart water-change: recommend a drain interval from tub size + typical use.
  const drainTask = tasks.find((t) => t.task_key === "drain_refill");
  const bathers = Number(settings.avg_daily_bathers ?? 1.5);
  const waterChange = computeWaterChangeIntervalDays(config.volumeLitres, bathers);
  const waterAgeDays = drainTask
    ? daysSince(drainTask.last_completed_at, now)
    : null;
  const scheduleMatches =
    drainTask?.frequency_days === waterChange.intervalDays;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Today</h1>
        <p className="text-sm text-slate-500">
          Your hot tub at a glance.
        </p>
      </div>

      {hasDanger ? (
        <div className="rounded-2xl border-2 border-red-400 bg-red-100 p-4">
          <p className="font-bold text-red-800">⚠️ Do not use the spa yet</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-800">
            {calc!.safetyFlags.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Water status */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Water</h2>
          <Badge tone={config.sanitizerType === "chlorine" ? "blue" : "green"}>
            {config.sanitizerType === "chlorine" ? "Chlorine" : "Bromine"}
          </Badge>
        </div>
        {latest && calc ? (
          <div>
            <p className="text-sm text-slate-600">{calc.summary}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Metric label="pH" value={latest.ph} />
              <Metric label="Alkalinity" value={latest.total_alkalinity_ppm} />
              <Metric
                label={config.sanitizerType === "chlorine" ? "Chlorine" : "Bromine"}
                value={
                  config.sanitizerType === "chlorine"
                    ? latest.free_chlorine_ppm
                    : latest.bromine_ppm
                }
              />
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Last tested {formatDateTime(latest.recorded_at)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No readings yet. Test your water to get started.
          </p>
        )}
        <div className="mt-4 space-y-2">
          <LinkButton href="/readings/new" className="w-full">
            🧪 Test the water now
          </LinkButton>
          <Link
            href="/trends"
            className="block text-center text-sm font-medium text-brand-600"
          >
            📈 View trends
          </Link>
        </div>
      </Card>

      {/* Water freshness (smart drain & refill) */}
      <Card>
        <h2 className="mb-1 font-semibold text-slate-800">Water freshness</h2>
        <p className="text-sm text-slate-600">
          {waterAgeDays === null
            ? "Log a drain & refill to start tracking how fresh your water is."
            : `Your water is about ${waterAgeDays} day${waterAgeDays === 1 ? "" : "s"} old.`}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Based on ~{bathers} {bathers === 1 ? "person" : "people"} a day, aim to
          drain &amp; refill roughly every{" "}
          <strong>{waterChange.intervalDays} days</strong>
          {waterChange.cappedByMax ? " (light use — quarterly is plenty)" : ""}.
        </p>
        {drainTask && !scheduleMatches ? (
          <ApplyIntervalButton
            taskId={drainTask.id}
            intervalDays={waterChange.intervalDays}
          />
        ) : drainTask && scheduleMatches ? (
          <p className="mt-2 text-xs text-emerald-700">
            ✓ Your drain &amp; refill schedule matches this.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-400">
          Change how many people use it in Settings.
        </p>
      </Card>

      {/* Coming up */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Coming up</h2>
          <Link href="/tasks" className="text-sm font-medium text-brand-600">
            All tasks →
          </Link>
        </div>
        {dueTasks.length === 0 ? (
          <p className="text-sm text-slate-500">
            🎉 Nothing due right now. You&apos;re all caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {dueTasks.map(({ row, info }) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{taskTypeIcons[row.task_type]}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {row.name}
                    </p>
                    <Badge tone={dueStatusTone(info.status)}>
                      {dueStatusLabel(info.status, info.daysUntilDue)}
                    </Badge>
                  </div>
                </div>
                <CompleteButton taskId={row.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400">
        {lastNotification
          ? `Last automated check: ${formatDateTime(lastNotification.created_at)}`
          : "Automated daily checks will appear here once the scheduler has run."}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="text-lg font-bold text-slate-800">
        {value === null || value === undefined ? "—" : value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
