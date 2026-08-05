import Link from "next/link";
import SetupNeeded from "@/components/SetupNeeded";
import CompleteButton from "@/components/CompleteButton";
import ApplyIntervalButton from "@/components/ApplyIntervalButton";
import LogSoakButton from "@/components/LogSoakButton";
import { Badge, Card, LinkButton } from "@/components/ui";
import Icon from "@/components/Icon";
import ProbeCard from "@/components/ProbeCard";
import QuickLinks from "@/components/QuickLinks";
import HeaterProtectionCard from "@/components/HeaterProtectionCard";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  getRecentReadings,
  getLastNotification,
  getBathersSince,
  getRecentDosing,
  captureProbeReading,
  getProbeReadingsSince,
  toTaskLike,
} from "@/lib/data";
import { computeNextDue } from "@/lib/tasks";
import { calculateRecommendations } from "@/lib/chemistry";
import {
  computeWaterChangeIntervalDays,
  daysSince,
  usageWaterStatus,
  sanitiserDemandTrend,
  waterChangeVerdict,
  estimateRefillCost,
} from "@/lib/water";
import { buildForecasts } from "@/lib/predict";
import { lsiSnapshot } from "@/lib/balance";
import { getForecast, weatherAdvice, type WeatherForecast } from "@/lib/weather";
import { getIopoolReading, isIopoolConfigured } from "@/lib/iopool";
import { orpDrift } from "@/lib/probe";
import type { IopoolPool } from "@/lib/iopool-parse";
import {
  dueStatusLabel,
  dueStatusTone,
  taskTypeIcons,
  formatDateTime,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let settings, tasks, latest, recentReadings, lastNotification;
  try {
    [settings, tasks, latest, recentReadings, lastNotification] = await Promise.all([
      getSettings(),
      getTasks(),
      getLatestReading(),
      getRecentReadings(30),
      getLastNotification(),
    ]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  const now = new Date();
  const config = toSpaConfig(settings);

  // Latest reading's safety status for the top banner.
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
        cyanuricAcidPpm:
          latest.cyanuric_acid_ppm === null
            ? null
            : Number(latest.cyanuric_acid_ppm),
        orpMv: latest.orp_mv === null ? null : Number(latest.orp_mv),
        isFreshFill: latest.is_fresh_fill,
      },
      config,
    );
  }

  // Predictive early-warnings from the reading history.
  const forecasts = buildForecasts(recentReadings, config);

  const dueTasks = tasks
    .map((t) => ({ row: t, info: computeNextDue(toTaskLike(t), now) }))
    .filter((t) => t.info.status !== "ok")
    .sort((a, b) => a.info.daysUntilDue - b.info.daysUntilDue);

  const hasDanger = calc?.safetyFlags.some((f) => f.severity === "danger");

  // Smart water-change: time-based estimate from tub size + typical use.
  const drainTask = tasks.find((t) => t.task_key === "drain_refill");
  const bathers = Number(settings.avg_daily_bathers ?? 1.5);
  const waterChange = computeWaterChangeIntervalDays(config.volumeLitres, bathers);
  const waterAgeDays = drainTask
    ? daysSince(drainTask.last_completed_at, now)
    : null;
  const scheduleMatches = drainTask?.frequency_days === waterChange.intervalDays;

  // Usage-based water freshness (only if the usage table has been set up).
  let cumulativeBathers: number | null = null;
  try {
    cumulativeBathers = await getBathersSince(drainTask?.last_completed_at ?? null);
  } catch {
    cumulativeBathers = null;
  }
  const usageAvailable = cumulativeBathers !== null;
  const usageStatus = usageAvailable
    ? usageWaterStatus(config.volumeLitres, cumulativeBathers as number)
    : null;

  // Chemical-demand trend: is the water making us work harder than it was?
  let demand = null;
  try {
    demand = sanitiserDemandTrend(await getRecentDosing(60), now);
  } catch {
    demand = null;
  }

  // Sanitiser losing its power. A single low reading is weak evidence, so
  // prefer the probe's own history: a sustained ORP decline while pH behaves is
  // the stabiliser-buildup signature. Fall back to the spot reading when there
  // isn't enough history yet.
  let probeRows: Awaited<ReturnType<typeof getProbeReadingsSince>> = [];
  try {
    probeRows = await getProbeReadingsSince(drainTask?.last_completed_at ?? null);
  } catch {
    probeRows = [];
  }
  const drift = probeRows.length > 0 ? orpDrift(probeRows, config) : null;
  const sanitiserIneffective =
    drift?.likelyStabiliserBuildup ||
    Boolean(
      calc?.safetyFlags.some((f) => f.code === "sanitizer_ineffective") &&
        latest &&
        Number(latest.ph) <= config.targetRanges.phIdealMax,
    );

  const refillCost = estimateRefillCost(config.volumeLitres);

  // Live probe reading (hidden entirely when no key is configured, and the
  // card just disappears if iopool is unreachable).
  let probe: IopoolPool | null = null;
  if (isIopoolConfigured()) {
    const r = await getIopoolReading();
    if (r.ok) {
      probe = r.pool;
      // Opportunistic history: every visit banks the current measurement.
      await captureProbeReading(r.pool.measure);
    }
  }

  // Heater protection. The live probe reading is newer than anything in the
  // history table, so it goes in front of it as the temperature source.
  const tempRows = [
    ...(probe?.measure.measuredAt
      ? [
          {
            measured_at: probe.measure.measuredAt,
            temperature_c: probe.measure.temperatureC,
          },
        ]
      : []),
    ...probeRows,
  ];
  const balance = lsiSnapshot(
    recentReadings,
    tempRows,
    drainTask?.last_completed_at ?? null,
    now,
  );

  // Built after the balance snapshot so a measured stabiliser reading can
  // outrank the ORP-drift inference.
  const verdict = waterChangeVerdict({
    ageDays: waterAgeDays,
    intervalDays: waterChange.intervalDays,
    usage: usageStatus,
    demand,
    sanitiserIneffective,
    cyaPpm: balance.cya?.valuePpm ?? null,
    cyaDrainAbove: config.targetRanges.cyaDrainAbove,
  });

  // Weather (only when a location is set; fetch failures just hide the card).
  let weather: WeatherForecast | null = null;
  if (settings.latitude != null && settings.longitude != null) {
    weather = await getForecast(
      Number(settings.latitude),
      Number(settings.longitude),
      settings.location_name ?? undefined,
    );
  }
  const advisories = weather
    ? weatherAdvice(weather, config.sanitizerType)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Today</h1>
        <p className="text-sm text-slate-500">Your hot tub at a glance.</p>
      </div>

      {hasDanger ? (
        <div className="rounded-2xl border-2 border-red-400 bg-red-100 p-4">
          <p className="flex items-center gap-2 font-bold text-red-800">
            <Icon name="alert-triangle" size={20} />
            Do not use the spa yet
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-800">
            {calc!.safetyFlags.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Fresh water setup — hero when the tub has no readings yet */}
      {!latest ? (
        <Link href="/setup">
          <Card className="border-2 border-brand-300 bg-gradient-to-br from-brand-50 to-white">
            <div className="flex items-center gap-3">
              <Icon name="shower" size={36} className="text-brand-600" />
              <div className="flex-1">
                <p className="font-bold text-slate-800">
                  Start here: fresh water setup
                </p>
                <p className="text-sm text-slate-600">
                  New tub or fresh fill? I&apos;ll walk you through getting the
                  water balanced and safe, step by step.
                </p>
              </div>
              <span className="text-brand-600">→</span>
            </div>
          </Card>
        </Link>
      ) : null}

      {probe ? <ProbeCard pool={probe} ranges={config.targetRanges} /> : null}

      {/* Sanitiser drift, explained in plain terms */}
      {drift?.message ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <Icon name="trend-up" size={17} className="mt-0.5 shrink-0" />
            <span>{drift.message}</span>
          </p>
        </Card>
      ) : null}

      {/* Predictive heads-up */}
      {forecasts.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <Icon name="trend-up" size={18} />
            Heads-up
          </h2>
          <ul className="space-y-2">
            {forecasts.map((f) => (
              <li key={f.key} className="text-sm text-amber-900">
                <span className="mr-1">
                  {f.severity === "warning" ? (
                    <Icon name="alert-triangle" size={14} className="inline align-[-2px]" />
                  ) : (
                    "•"
                  )}
                </span>
                {f.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Water status */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">
            {probe ? "Last saved test" : "Water"}
          </h2>
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
              {config.sanitizerUnit === "orp" && latest.orp_mv !== null ? (
                <Metric label="ORP (mV)" value={latest.orp_mv} />
              ) : (
                <Metric
                  label={
                    config.sanitizerType === "chlorine" ? "Chlorine" : "Bromine"
                  }
                  value={
                    config.sanitizerType === "chlorine"
                      ? latest.free_chlorine_ppm
                      : latest.bromine_ppm
                  }
                />
              )}
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
            <Icon name="flask" size={18} className="mr-2" />
            Test the water now
          </LinkButton>
          <Link
            href="/trends"
            className="block text-center text-sm font-medium text-brand-600"
          >
            <Icon name="chart-line" size={16} className="mr-1.5 inline align-[-3px]" />
            View trends
          </Link>
        </div>
      </Card>

      {/* Heater protection — the four numbers judged together, not one by one */}
      <HeaterProtectionCard snapshot={balance} />

      {/* Water freshness (smart drain & refill) */}
      <Card>
        <h2 className="mb-2 font-semibold text-slate-800">Water freshness</h2>

        {/* The headline verdict, weighing every signal we have. */}
        <div
          className={`mb-3 rounded-xl p-3 ${
            verdict.status === "change_now"
              ? "bg-red-50 text-red-800"
              : verdict.status === "change_soon"
                ? "bg-amber-50 text-amber-900"
                : verdict.status === "watch"
                  ? "bg-slate-50 text-slate-700"
                  : "bg-emerald-50 text-emerald-800"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold">
            <Icon
              name={
                verdict.status === "change_now" ||
                verdict.status === "change_soon"
                  ? "alert-triangle"
                  : "check-circle"
              }
              size={17}
            />
            {verdict.headline}
          </p>
          <p className="mt-1 text-sm">{verdict.detail}</p>
        </div>

        {usageStatus ? (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-sm text-slate-600">
              <span>
                {usageStatus.used} of ~{usageStatus.capacity} person-soaks used
              </span>
              <span>{Math.round(usageStatus.fractionUsed * 100)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  usageStatus.changeDue ? "bg-red-500" : "bg-brand-500"
                }`}
                style={{ width: `${Math.round(usageStatus.fractionUsed * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {usageStatus.changeDue
                ? "Based on how much it's been used, it's time to drain & refill."
                : `About ${usageStatus.remaining} more person-soaks before a change is due.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {waterAgeDays === null
              ? "Log a drain & refill to start tracking how fresh your water is."
              : `Your water is about ${waterAgeDays} day${waterAgeDays === 1 ? "" : "s"} old.`}
          </p>
        )}

        <p className="mt-1 text-sm text-slate-600">
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

        {usageAvailable ? (
          <div className="mt-3">
            <LogSoakButton />
          </div>
        ) : null}

        {verdict.status === "fresh" || verdict.status === "ok" ? (
          <p className="mt-2 text-xs text-slate-500">
            A full refill is about {refillCost.kwh} kWh of heating plus the
            water itself (roughly £{refillCost.totalCost.toFixed(2)}), so it&apos;s
            worth changing on the numbers rather than out of habit.
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
            Nothing due right now. You&apos;re all caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {dueTasks.map(({ row, info }) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div className="flex items-center gap-3">
                  <Icon name={taskTypeIcons[row.task_type]} size={22} className="text-brand-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{row.name}</p>
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

      {/* Weather */}
      {weather && weather.days.length > 0 ? (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Weather</h2>
            {weather.locationName ? (
              <span className="text-xs text-slate-400">
                <Icon name="pin" size={12} className="mr-1 inline align-[-1px]" />
                {weather.locationName}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {weather.days.slice(0, 3).map((d) => (
              <div key={d.date} className="rounded-xl bg-slate-50 py-2">
                <div className="text-xs text-slate-500">
                  {new Date(d.date).toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  {Math.round(d.tempMax)}°
                </div>
                <div className="text-xs text-slate-400">
                  {Math.round(d.tempMin)}°
                </div>
              </div>
            ))}
          </div>
          {advisories.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {advisories.map((a) => (
                <li
                  key={a.code}
                  className={`rounded-xl p-2.5 text-sm ${
                    a.severity === "warning"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {a.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Nothing weather-related to worry about right now.
            </p>
          )}
        </Card>
      ) : null}

      <QuickLinks />

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
