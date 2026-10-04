// =============================================================================
//  lib/tubState.ts
//  Everything the four tabs need to know about the tub, loaded and worked out
//  in one place. Today, Water, Heat and Care each used to repeat a slice of
//  this; now they read from the same answers, so two screens can never
//  disagree about the same fact.
// =============================================================================

import "server-only";
import {
  getSettings,
  toSpaConfig,
  getTasks,
  getLatestReading,
  getRecentReadings,
  getLastNotification,
  getBathersSince,
  getRecentDosing,
  getRecentUsage,
  captureProbeReading,
  getProbeReadingsSince,
  toTaskLike,
} from "./data";
import { computeTaskLife, type TaskLife } from "./tasks";
import { calculateRecommendations, type CalculationResult } from "./chemistry";
import {
  computeWaterChangeIntervalDays,
  daysSince,
  usageWaterStatus,
  sanitiserDemandTrend,
  waterChangeVerdict,
  estimateRefillCost,
  DEFAULT_ELECTRICITY_PRICE_PER_KWH,
} from "./water";
import { buildForecasts } from "./predict";
import { lsiSnapshot } from "./balance";
import {
  compareWinterCosts,
  hibernationState,
  winterCountdown,
  winterLengthDays,
  winterWindow,
} from "./winter";
import {
  effectiveHeaterWatts,
  keepWarmVsReheat,
  observedCoolingRate,
  observedHeatingRate,
  parseHeatingSchedule,
  resolveHeatLoss,
  resolveReadyAt,
  soakPattern,
  soaksPerWeek,
} from "./heating";
import { runningCostSummary, seasonalComparison } from "./costs";
import { getForecast, weatherAdvice, type WeatherForecast } from "./weather";
import { getIopoolReading, isIopoolConfigured } from "./iopool";
import { orpDrift } from "./probe";
import type { IopoolPool } from "./iopool-parse";
import type { MaintenanceTaskRow } from "./types";

export type TubState = Awaited<ReturnType<typeof computeTubState>>;

export async function loadTubState(): Promise<
  { ok: true; state: TubState } | { ok: false; error: string }
> {
  try {
    return { ok: true, state: await computeTubState() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Optional data: a missing table or an unreachable service just means less to show. */
async function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

async function computeTubState() {
  const [settings, tasks, latest, recentReadings, lastNotification] = await Promise.all([
    getSettings(),
    getTasks(),
    getLatestReading(),
    getRecentReadings(30),
    getLastNotification(),
  ]);

  const now = new Date();
  const config = toSpaConfig(settings);
  const soakTargetC = config.targetRanges.tempTarget ?? 38;
  const latitude = settings.latitude === null ? null : Number(settings.latitude);
  const window = winterWindow(latitude, now);
  const hibernation = hibernationState(
    settings.winterised_at ?? null,
    settings.winter_strategy ?? null,
    window,
  );

  const drainTask = tasks.find((t) => t.task_key === "drain_refill") ?? null;
  const fillStart = drainTask?.last_completed_at ?? null;

  const [cumulativeBathers, dosing, probeRows, usageRows] = await Promise.all([
    soft<number | null>(getBathersSince(fillStart), null),
    soft(getRecentDosing(60), []),
    soft(getProbeReadingsSince(fillStart), []),
    soft(getRecentUsage(60), []),
  ]);

  // Live probe reading; every visit banks it into the history.
  let probe: IopoolPool | null = null;
  if (isIopoolConfigured()) {
    const r = await getIopoolReading();
    if (r.ok) {
      probe = r.pool;
      await captureProbeReading(r.pool.measure);
    }
  }

  // --- Water chemistry ---------------------------------------------------------
  const calc: CalculationResult | null = latest
    ? calculateRecommendations(
        {
          ph: Number(latest.ph),
          freeChlorinePpm:
            latest.free_chlorine_ppm === null ? null : Number(latest.free_chlorine_ppm),
          brominePpm: latest.bromine_ppm === null ? null : Number(latest.bromine_ppm),
          totalAlkalinityPpm: Number(latest.total_alkalinity_ppm),
          calciumHardnessPpm:
            latest.calcium_hardness_ppm === null ? null : Number(latest.calcium_hardness_ppm),
          cyanuricAcidPpm:
            latest.cyanuric_acid_ppm === null ? null : Number(latest.cyanuric_acid_ppm),
          orpMv: latest.orp_mv === null ? null : Number(latest.orp_mv),
          isFreshFill: latest.is_fresh_fill,
        },
        config,
      )
    : null;

  const forecasts = buildForecasts(recentReadings, config);
  const drift = probeRows.length > 0 ? orpDrift(probeRows, config) : null;

  // --- Jobs ----------------------------------------------------------------------
  const jobs: { row: MaintenanceTaskRow; life: TaskLife }[] = tasks
    .map((row) => ({ row, life: computeTaskLife(toTaskLike(row), now) }))
    .sort((a, b) => a.life.daysUntilDue - b.life.daysUntilDue);

  // --- Water age -----------------------------------------------------------------
  const bathers = Number(settings.avg_daily_bathers ?? 1.5);
  const waterChange = computeWaterChangeIntervalDays(config.volumeLitres, bathers);
  const waterAgeDays = drainTask ? daysSince(drainTask.last_completed_at, now) : null;
  const usageStatus =
    cumulativeBathers === null ? null : usageWaterStatus(config.volumeLitres, cumulativeBathers);
  const demand = sanitiserDemandTrend(dosing, now);
  const sanitiserIneffective =
    Boolean(drift?.likelyStabiliserBuildup) ||
    Boolean(
      calc?.safetyFlags.some((f) => f.code === "sanitizer_ineffective") &&
        latest &&
        Number(latest.ph) <= config.targetRanges.phIdealMax,
    );

  const tempRows = [
    ...(probe?.measure.measuredAt
      ? [{ measured_at: probe.measure.measuredAt, temperature_c: probe.measure.temperatureC }]
      : []),
    ...probeRows,
  ];
  const balance = lsiSnapshot(recentReadings, tempRows, fillStart, now, soakTargetC);
  const verdict = waterChangeVerdict({
    ageDays: waterAgeDays,
    intervalDays: waterChange.intervalDays,
    usage: usageStatus,
    demand,
    sanitiserIneffective,
    cyaPpm: balance.cya?.valuePpm ?? null,
    cyaDrainAbove: config.targetRanges.cyaDrainAbove,
  });
  const refillCost = estimateRefillCost(config.volumeLitres);

  // --- Heating -------------------------------------------------------------------
  const waterC = probe?.measure.temperatureC ?? null;
  const rate = observedHeatingRate(probeRows);
  const pattern = soakPattern(usageRows);
  const schedule = parseHeatingSchedule(settings.heating_schedule);
  const { readyAt, source: readySource } = resolveReadyAt({ schedule, pattern, now });

  let weather: WeatherForecast | null = null;
  if (settings.latitude != null && settings.longitude != null) {
    weather = await getForecast(
      Number(settings.latitude),
      Number(settings.longitude),
      settings.location_name ?? undefined,
    );
  }
  const advisories = weather ? weatherAdvice(weather, config.sanitizerType) : [];
  const today = weather?.days[0];
  const ambientC =
    today && Number.isFinite(today.tempMax) && Number.isFinite(today.tempMin)
      ? (today.tempMax + today.tempMin) / 2
      : 12;

  const heatLoss = resolveHeatLoss({
    cooling: observedCoolingRate(probeRows),
    ambientC,
    savedWPerK:
      settings.heat_loss_w_per_k == null ? null : Number(settings.heat_loss_w_per_k),
    volumeLitres: config.volumeLitres,
  });
  const heater = effectiveHeaterWatts(rate, ambientC, config.volumeLitres, heatLoss.uaWPerK);
  const perWeek = soaksPerWeek(usageRows, now);
  const keepWarm =
    perWeek > 0
      ? keepWarmVsReheat({
          soaksPerWeek: perWeek,
          targetC: soakTargetC,
          ambientC,
          watts: heater.watts,
          volumeLitres: config.volumeLitres,
          uaWPerK: heatLoss.uaWPerK,
        })
      : null;
  const costInput = {
    uaWPerK: heatLoss.uaWPerK,
    targetC: soakTargetC,
    ambientC,
    volumeLitres: config.volumeLitres,
    pricePerKwh: DEFAULT_ELECTRICITY_PRICE_PER_KWH,
    soakHoursPerDay: perWeek > 0 ? Math.min(2, perWeek / 7) : 0,
    lidOffLossCPerH: 1.25,
    filterHoursPerDay: probe?.filtrationHours ?? undefined,
    soaksPerWeek: perWeek,
  };
  const costs = runningCostSummary(costInput);
  const seasonal = seasonalComparison(costInput, 7);

  // --- Winter --------------------------------------------------------------------
  const forecastDays = weather?.days.map((d) => ({ date: d.date, tempMin: d.tempMin })) ?? [];
  const countdown = winterCountdown(window, now, forecastDays);
  const winterCosts = window
    ? compareWinterCosts(winterLengthDays(window), {
        refillCost: refillCost.totalCost,
        uaWPerK: heatLoss.uaWPerK,
      })
    : null;

  return {
    now,
    settings,
    config,
    soakTargetC,
    tasks,
    jobs,
    latest,
    recentReadings,
    lastNotification,
    hibernation,
    window,
    countdown,
    winterCosts,
    calc,
    forecasts,
    drift,
    dosing,
    usageRows,
    probe,
    probeRows,
    drainTask,
    waterChange,
    waterAgeDays,
    usageStatus,
    balance,
    verdict,
    refillCost,
    waterC,
    pattern,
    schedule,
    readyAt,
    readySource,
    weather,
    advisories,
    ambientC,
    heatLoss,
    heater,
    perWeek,
    keepWarm,
    costs,
    seasonal,
    pricePerKwh: DEFAULT_ELECTRICITY_PRICE_PER_KWH,
  };
}
