// =============================================================================
//  lib/data.ts
//  Server-only data-access helpers shared by pages and API routes. All reads go
//  through here so there is one place that knows the table shapes.
// =============================================================================

import "server-only";
import { getSupabase } from "./supabase";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "./chemistry";
import type {
  SpaSettings,
  MaintenanceTaskRow,
  TestReadingRow,
  DosingLogRow,
  NotificationLogRow,
  UsageLogRow,
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

// Turn the stored settings row into the pure-calculator's SpaConfig shape,
// backfilling any missing keys with defaults so old rows keep working.
export function toSpaConfig(settings: SpaSettings): SpaConfig {
  return {
    volumeLitres: Number(settings.volume_litres),
    sanitizerType: settings.sanitizer_type,
    targetRanges: { ...DEFAULT_TARGET_RANGES, ...(settings.target_ranges ?? {}) },
    dosingConstants: {
      ...DEFAULT_DOSING_CONSTANTS,
      ...(settings.dosing_constants ?? {}),
    },
  };
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

// Map a MaintenanceTaskRow into the camelCase shape the pure task helpers use.
export function toTaskLike(row: MaintenanceTaskRow) {
  return {
    taskKey: row.task_key,
    name: row.name,
    taskType: row.task_type,
    frequencyDays: row.frequency_days,
    lastCompletedAt: row.last_completed_at,
  };
}
