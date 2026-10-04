// =============================================================================
//  lib/tubState.ts
//  Loads everything the four tabs need about the tub: the rows from the
//  database, the live probe reading and the forecast. lib/tubDerive.ts then
//  works out the answers, so Today, Water, Heat and Care always agree.
// =============================================================================

import "server-only";
import {
  getSettings,
  getTasks,
  getLatestReading,
  getRecentReadings,
  getLastNotification,
  getBathersSince,
  getRecentDosing,
  getRecentUsage,
  captureProbeReading,
  getProbeReadingsSince,
} from "./data";
import { getForecast, type WeatherForecast } from "./weather";
import { getIopoolReading, isIopoolConfigured } from "./iopool";
import type { IopoolPool } from "./iopool-parse";
import { deriveTubState, type TubInputs, type TubState } from "./tubDerive";

export type { TubState };

export async function loadTubState(): Promise<
  { ok: true; state: TubState } | { ok: false; error: string }
> {
  try {
    return { ok: true, state: deriveTubState(await fetchTubInputs()) };
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

async function fetchTubInputs(): Promise<TubInputs> {
  const [settings, tasks, latest, recentReadings, lastNotification] = await Promise.all([
    getSettings(),
    getTasks(),
    getLatestReading(),
    getRecentReadings(30),
    getLastNotification(),
  ]);

  const fillStart = tasks.find((t) => t.task_key === "drain_refill")?.last_completed_at ?? null;
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

  let weather: WeatherForecast | null = null;
  if (settings.latitude != null && settings.longitude != null) {
    weather = await getForecast(
      Number(settings.latitude),
      Number(settings.longitude),
      settings.location_name ?? undefined,
    );
  }

  return {
    now: new Date(),
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
  };
}
