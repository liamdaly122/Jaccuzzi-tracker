// =============================================================================
//  lib/data.ts
//  Server-only data-access helpers shared by pages and API routes. All reads go
//  through here so there is one place that knows the table shapes.
// =============================================================================

import "server-only";
import { getSupabase } from "./supabase";
// Pure row conversions live in ./rows so pure code can use them too.
export { toSpaConfig, toTaskLike } from "./rows";
import type {
  SpaSettings,
  MaintenanceTaskRow,
  TestReadingRow,
  DosingLogRow,
  NotificationLogRow,
  UsageLogRow,
  ProbeReadingRow,
} from "./types";

// Fetch the single settings row (id = 1). Throws with a friendly message if the
// schema has not been created yet.
export async function getSettings(): Promise<SpaSettings> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("spa_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    throw new Error(
      `Could not load settings: ${error.message}. Have you run supabase/schema.sql yet? (See README.md.)`,
    );
  }
  return data as SpaSettings;
}

export async function getTasks(): Promise<MaintenanceTaskRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("maintenance_tasks")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return (data ?? []) as MaintenanceTaskRow[];
}

/**
 * Tick off a task by its key (e.g. "test_water") when something elsewhere
 * proves it was done — saving a test, logging a shock dose. Best-effort: the
 * thing that triggered it has already been saved and must not fail because of
 * this.
 */
export async function completeTaskByKey(taskKey: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("maintenance_tasks")
      .select("id")
      .eq("task_key", taskKey)
      .maybeSingle();
    if (data?.id != null) {
      await supabase.rpc("complete_task", { p_task_id: data.id, p_note: null });
    }
  } catch (err) {
    console.error(`Could not tick off ${taskKey}:`, err);
  }
}

export async function getRecentReadings(limit = 20): Promise<TestReadingRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("test_readings")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load readings: ${error.message}`);
  return (data ?? []) as TestReadingRow[];
}

export async function getLatestReading(): Promise<TestReadingRow | null> {
  const readings = await getRecentReadings(1);
  return readings[0] ?? null;
}

export async function getReadingById(id: number): Promise<TestReadingRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("test_readings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load reading: ${error.message}`);
  return (data as TestReadingRow) ?? null;
}

export async function getRecentDosing(limit = 30): Promise<DosingLogRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dosing_log")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load dosing log: ${error.message}`);
  return (data ?? []) as DosingLogRow[];
}

export async function getRecentUsage(limit = 30): Promise<UsageLogRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("usage_log")
    .select("*")
    .order("used_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load usage log: ${error.message}`);
  return (data ?? []) as UsageLogRow[];
}

// Sum of bathers logged since a given time (used to measure water freshness
// since the last drain). Returns 0 if nothing since then.
export async function getBathersSince(sinceIso: string | null): Promise<number> {
  const supabase = getSupabase();
  let query = supabase.from("usage_log").select("bathers");
  if (sinceIso) query = query.gte("used_at", sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(`Could not sum usage: ${error.message}`);
  return (data ?? []).reduce(
    (sum, row: { bathers: number }) => sum + Number(row.bathers),
    0,
  );
}

// The most recent daily-check row, so the dashboard can show "last checked"
// (cheap observability, since Vercel Hobby doesn't alert on cron failures).
export async function getLastNotification(): Promise<NotificationLogRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notification_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null; // non-critical; don't break the dashboard
  return (data as NotificationLogRow) ?? null;
}

// =============================================================================
//  Probe history (iopool). Kept in its own table because the probe can't measure
//  alkalinity and test_readings requires it — see supabase/schema.sql.
// =============================================================================

// Keep six months. Plenty for the 90-day water cycle and the drift analysis,
// and it caps the table permanently instead of letting it creep upward.
export const PROBE_RETENTION_DAYS = 180;

// Best-effort: a logging failure must never break a page render or the cron.
// The unique index on measured_at makes repeat captures silent no-ops.
export async function captureProbeReading(measure: {
  measuredAt: string | null;
  ph: number | null;
  orpMv: number | null;
  temperatureC: number | null;
  isValid: boolean;
}): Promise<boolean> {
  if (!measure.measuredAt) return false;
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("probe_readings")
      .upsert(
        {
          measured_at: measure.measuredAt,
          ph: measure.ph,
          orp_mv: measure.orpMv,
          temperature_c: measure.temperatureC,
          is_valid: measure.isValid,
        },
        { onConflict: "measured_at", ignoreDuplicates: true },
      );
    return !error;
  } catch {
    return false;
  }
}

export async function getRecentProbeReadings(limit = 500): Promise<ProbeReadingRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("probe_readings")
    .select("*")
    .order("measured_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load probe history: ${error.message}`);
  return (data ?? []) as ProbeReadingRow[];
}

export async function getProbeReadingsSince(
  sinceIso: string | null,
  limit = 1000,
): Promise<ProbeReadingRow[]> {
  const supabase = getSupabase();
  let query = supabase.from("probe_readings").select("*");
  if (sinceIso) query = query.gte("measured_at", sinceIso);
  const { data, error } = await query
    .order("measured_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load probe history: ${error.message}`);
  return (data ?? []) as ProbeReadingRow[];
}

// Called once a day by the cron so storage stays bounded rather than growing.
export async function pruneProbeReadings(
  retentionDays = PROBE_RETENTION_DAYS,
): Promise<number> {
  try {
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("probe_readings")
      .delete()
      .lt("measured_at", cutoff)
      .select("id");
    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

// Map a MaintenanceTaskRow into the camelCase shape the pure task helpers use.
