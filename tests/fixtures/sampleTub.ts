// A sample tub: 1,180 L, 25-day-old water, a month of hourly probe history
// with a daily heat-up, a soak most evenings and October weather.
import { DEFAULT_DOSING_CONSTANTS, DEFAULT_TARGET_RANGES } from "../../lib/chemistry";
import type { TubInputs } from "../../lib/tubDerive";
import type { SpaSettings, MaintenanceTaskRow, TestReadingRow, ProbeReadingRow, UsageLogRow, DosingLogRow } from "../../lib/types";

export function sampleInputs(
  opts: { hibernating?: boolean; noProbe?: boolean; strategy?: string; now?: Date } = {},
): TubInputs {
  const now = opts.now ?? new Date("2026-10-04T13:10:00.000Z");
  const H = 3600_000, D = 24 * H;
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const settings = {
    id: 1, sanitizer_type: "chlorine", sanitizer_unit: "orp", volume_litres: 1180, avg_daily_bathers: 2,
    target_ranges: { ...DEFAULT_TARGET_RANGES, tempTarget: 40 }, dosing_constants: DEFAULT_DOSING_CONSTANTS,
    heating_schedule: { enabled: true, weekdays: [0, 1, 2, 3, 4, 5, 6], time: "19:30" }, heat_loss_w_per_k: null,
    winterised_at: opts.hibernating ? ago(10 * D) : null, winter_strategy: opts.hibernating ? (opts.strategy ?? "pack_down") : null,
    latitude: 53.7, longitude: -1.24, location_name: "Knottingley", updated_at: ago(D),
  } as SpaSettings;
  const task = (id: number, key: string, name: string, type: string, every: number, lastDays: number | null): MaintenanceTaskRow =>
    ({ id, task_key: key, name, task_type: type, frequency_days: every, last_completed_at: lastDays === null ? null : ago(lastDays * D), created_at: ago(200 * D) }) as MaintenanceTaskRow;
  const tasks = [
    task(1, "test_water", "Test the water", "testing", 3, 4),
    task(2, "shock", "Shock treatment", "sanitizing", 7, 2),
    task(3, "rinse_filter", "Rinse the filter cartridge", "filter", 7, 7),
    task(4, "deep_clean_filter", "Deep-clean filter (chemical soak)", "filter", 14, 9),
    task(5, "replace_filter", "Replace the filter cartridge", "filter", 90, 25),
    task(6, "drain_refill", "Drain & refill the tub", "water", 90, 25),
    task(7, "cover_cabinet_check", "Check / clean cover & cabinet", "cleaning", 30, 26),
  ];
  const readings: TestReadingRow[] = [0, 4, 8, 12, 16, 20, 24].map((d, i) => ({
    id: 100 - i, recorded_at: ago((d + 2) * D + 3 * H), ph: [7.5, 7.6, 7.4, 7.5, 7.7, 7.5, 7.3][i], free_chlorine_ppm: [3, 4, 3.5, 4, 3, 5, 2][i], bromine_ppm: null,
    total_alkalinity_ppm: [80, 90, 90, 100, 100, 110, 70][i], calcium_hardness_ppm: i % 2 ? null : 150, cyanuric_acid_ppm: i === 0 ? 40 : null, orp_mv: null,
    is_fresh_fill: i === 6, notes: i === 1 ? "Bit cloudy after the weekend" : null, created_at: ago((d + 2) * D),
  }));
  const probeRows: ProbeReadingRow[] = [];
  for (let h = 24 * 25; h >= 1; h--) {
    const t = new Date(now.getTime() - h * H);
    const hr = t.getUTCHours();
    // Holds ~37.6, heats from 16:30 to 40 by 19:30, then cools 0.1/h.
    const temp = hr >= 16 && hr < 19 ? 37.6 + (hr - 16 + 1) * 0.8 : hr >= 19 ? 40 - (hr - 19) * 0.1 : 39.5 - (hr + 5) * 0.1;
    probeRows.push({ id: h, measured_at: t.toISOString(), ph: 7.45 + Math.sin(h / 9) * 0.06, orp_mv: Math.round(700 - (600 - h) / 20 + Math.sin(h / 5) * 8), temperature_c: Math.round(temp * 10) / 10, is_valid: true, created_at: t.toISOString() });
  }
  const usageRows: UsageLogRow[] = Array.from({ length: 24 }, (_, i) => ({ id: i, used_at: ago((i + 1) * D - 1 * H), bathers: i % 3 ? 2 : 1, note: null, created_at: ago((i + 1) * D) }));
  const dosing: DosingLogRow[] = [
    { id: 1, reading_id: 100, chemical: "dichlor", amount_grams: 5, note: null, logged_at: ago(2 * D) },
    { id: 2, reading_id: null, chemical: "mps_shock", amount_grams: 20, note: null, logged_at: ago(2 * D) },
  ];
  const day = (i: number) => { const d = new Date(now.getTime() + i * D); return d.toISOString().slice(0, 10); };
  const weather = { locationName: "Knottingley", days: Array.from({ length: 14 }, (_, i) => ({ date: day(i), tempMax: [14, 13, 11, 12, 10, 9, 8, 9, 10, 7, 6, 5, 6, 7][i], tempMin: [7, 6, 3, 4, 2, 1, 0, 1, 3, -1, -2, -1, 0, 1][i], uvMax: 2, precipMm: i === 2 ? 14 : 1 })) };
  return {
    now, settings, tasks, latest: readings[0], recentReadings: readings, lastNotification: { id: 1, notify_date: day(0), kind: "daily", summary: null, created_at: ago(5 * H) },
    cumulativeBathers: 40, dosing, probeRows, usageRows,
    probe: opts.noProbe ? null : { id: "p", title: "Hot tub", mode: "STANDARD", hasActionRequired: false, filtrationHours: 6,
      measure: { ph: 7.5, orpMv: 640, temperatureC: 37.4, measuredAt: ago(20 * 60_000), isValid: true, ageMinutes: 20 } },
    weather,
  };
}
