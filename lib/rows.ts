// =============================================================================
//  lib/rows.ts
//  Turning stored rows into the shapes the pure calculators take. Kept apart
//  from lib/data.ts (which talks to the database) so pure code can use them.
// =============================================================================

import { DEFAULT_TARGET_RANGES, DEFAULT_DOSING_CONSTANTS, type SpaConfig } from "./chemistry";
import type { MaintenanceTaskRow, SpaSettings } from "./types";

// The stored settings row as the calculator's SpaConfig, backfilling any
// missing keys with defaults so old rows keep working.
export function toSpaConfig(settings: SpaSettings): SpaConfig {
  return {
    volumeLitres: Number(settings.volume_litres),
    sanitizerType: settings.sanitizer_type,
    sanitizerUnit: settings.sanitizer_unit ?? "ppm",
    targetRanges: { ...DEFAULT_TARGET_RANGES, ...(settings.target_ranges ?? {}) },
    dosingConstants: {
      ...DEFAULT_DOSING_CONSTANTS,
      ...(settings.dosing_constants ?? {}),
    },
  };
}

export function toTaskLike(row: MaintenanceTaskRow) {
  return {
    taskKey: row.task_key,
    name: row.name,
    taskType: row.task_type,
    frequencyDays: row.frequency_days,
    lastCompletedAt: row.last_completed_at,
  };
}
