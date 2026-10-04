// =============================================================================
//  lib/tubDerive.ts
//  Everything the four tabs need to know about the tub, worked out from the
//  raw rows in one place, so two screens can never disagree about the same
//  fact. Pure: lib/tubState.ts fetches the inputs, this does the thinking.
// =============================================================================

import { toSpaConfig, toTaskLike } from "./rows";
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
import { weatherAdvice, type WeatherForecast } from "./weather";
import { orpDrift } from "./probe";
import type { IopoolPool } from "./iopool-parse";
import type {
  DosingLogRow,
  MaintenanceTaskRow,
  NotificationLogRow,
  ProbeReadingRow,
  SpaSettings,
  TestReadingRow,
  UsageLogRow,
} from "./types";

/** The raw rows and live readings everything is worked out from. */
export interface TubInputs {
  now: Date;
  settings: SpaSettings;
  tasks: MaintenanceTaskRow[];
  latest: TestReadingRow | null;
  recentReadings: TestReadingRow[];
  lastNotification: NotificationLogRow | null;
  /** People-soaks since the last refill; null when usage isn't tracked. */
  cumulativeBathers: number | null;
  dosing: DosingLogRow[];
  /** Probe history since the last refill, oldest first. */
  probeRows: ProbeReadingRow[];
  usageRows: UsageLogRow[];
  /** The live probe reading, when there is one. */
  probe: IopoolPool | null;
  weather: WeatherForecast | null;
}

export type TubState = ReturnType<typeof deriveTubState>;

export function deriveTubState(input: TubInputs) {
  const {
    now,
    settings,
    tasks,
    latest,
    recentReadings,
    lastNotification,
    cumulativeBathers,
    dosing,
    probeRows,
    usageRows,
    probe,
    weather,
  } = input;
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
