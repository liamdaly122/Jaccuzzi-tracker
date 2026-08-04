// =============================================================================
//  lib/types.ts
//  Shared TypeScript shapes for database rows and settings. Kept dependency-free
//  so both server and client code can import it.
// =============================================================================

import type {
  SanitizerType,
  SanitizerUnit,
  TargetRanges,
  DosingConstants,
} from "./chemistry";
import type { TaskType } from "./tasks";

export type { SanitizerType, SanitizerUnit, TargetRanges, DosingConstants, TaskType };

export interface SpaSettings {
  id: number;
  sanitizer_type: SanitizerType;
  sanitizer_unit: SanitizerUnit;
  volume_litres: number;
  target_ranges: TargetRanges;
  dosing_constants: DosingConstants;
  avg_daily_bathers: number;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  updated_at: string;
}

export interface TestReadingRow {
  id: number;
  recorded_at: string;
  ph: number;
  free_chlorine_ppm: number | null;
  bromine_ppm: number | null;
  total_alkalinity_ppm: number;
  calcium_hardness_ppm: number | null;
  orp_mv: number | null;
  is_fresh_fill: boolean;
  notes: string | null;
  created_at: string;
}

export type ChemicalKey =
  | "ta_increaser"
  | "ta_decreaser"
  | "ph_increaser"
  | "ph_decreaser"
  | "dichlor"
  | "bromine_granules"
  | "sodium_bromide"
  | "mps_shock"
  | "other";

export interface DosingLogRow {
  id: number;
  reading_id: number | null;
  chemical: ChemicalKey;
  amount_grams: number;
  note: string | null;
  logged_at: string;
}

export interface MaintenanceTaskRow {
  id: number;
  task_key: string;
  name: string;
  task_type: TaskType;
  frequency_days: number;
  last_completed_at: string | null;
  created_at: string;
}

export interface NotificationLogRow {
  id: number;
  notify_date: string;
  kind: string;
  summary: string | null;
  created_at: string;
}

export interface ProbeReadingRow {
  id: number;
  measured_at: string;
  ph: number | null;
  orp_mv: number | null;
  temperature_c: number | null;
  is_valid: boolean;
  created_at: string;
}

export interface UsageLogRow {
  id: number;
  used_at: string;
  bathers: number;
  note: string | null;
  created_at: string;
}

// Human-readable labels for chemical keys (used in the UI and logs).
export const CHEMICAL_LABELS: Record<ChemicalKey, string> = {
  ta_increaser: "Alkalinity increaser",
  ta_decreaser: "Alkalinity / pH decreaser",
  ph_increaser: "pH increaser",
  ph_decreaser: "pH decreaser",
  dichlor: "Chlorine granules (dichlor)",
  bromine_granules: "Bromine granules",
  sodium_bromide: "Sodium bromide",
  mps_shock: "Non-chlorine shock (MPS)",
  other: "Other",
};
