// =============================================================================
//  lib/weather.ts
//  Weather-aware intelligence via Open-Meteo (free, no API key, no signup).
//  `weatherAdvice` is PURE and unit-tested; geocode/getForecast do network I/O
//  and fail gracefully (the UI just hides the weather card).
// =============================================================================

import type { SanitizerType } from "./chemistry";

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  uvMax: number | null;
  precipMm: number | null;
}

export interface WeatherForecast {
  locationName?: string;
  days: DailyForecast[];
}

export interface WeatherAdvisory {
  code: string;
  severity: "info" | "warning";
  message: string;
}

// Thresholds (°C / UV index / mm) — tuned for a garden hot tub.
export const FROST_C = 2;
// The forecast now runs 14 days so the winter-shutdown countdown can see a cold
// snap coming. Day-to-day advice ("keep the cover on") stays on the near horizon
// though — warning about frost a fortnight out is just noise.
export const ADVICE_HORIZON_DAYS = 3;
export const HEAT_C = 28;
export const HIGH_UV = 7;
export const HEAVY_RAIN_MM = 10;

// -----------------------------------------------------------------------------
// Pure: turn a forecast into plain-English advisories for a hot tub.
// -----------------------------------------------------------------------------
export function weatherAdvice(
  forecast: WeatherForecast,
  sanitizerType: SanitizerType,
): WeatherAdvisory[] {
  const advisories: WeatherAdvisory[] = [];
  const days = forecast.days
    .filter((d) => Number.isFinite(d.tempMax))
    .slice(0, ADVICE_HORIZON_DAYS);
  if (days.length === 0) return advisories;

  const sanitizer = sanitizerType === "chlorine" ? "chlorine" : "bromine";

  // Frost — the coldest night.
  const coldest = Math.min(...days.map((d) => d.tempMin));
  if (coldest <= FROST_C) {
    advisories.push({
      code: "frost",
      severity: "warning",
      message:
        `❄️ Cold snap coming (down to about ${Math.round(coldest)}°C). ` +
        "Keep the cover on and the heater running so the pump and pipes don't freeze.",
    });
  }

  // Heat / strong sun — sanitizer burns off faster.
  const hottest = Math.max(...days.map((d) => d.tempMax));
  const uvValues = days.map((d) => d.uvMax).filter((u): u is number => u !== null);
  const peakUv = uvValues.length ? Math.max(...uvValues) : 0;
  if (hottest >= HEAT_C || peakUv >= HIGH_UV) {
    advisories.push({
      code: "heat",
      severity: "info",
      message:
        `☀️ Warm, sunny spell (up to about ${Math.round(hottest)}°C). ` +
        `Your ${sanitizer} will burn off faster — test more often this week and keep it topped up.`,
    });
  }

  // Heavy rain — dilution / debris.
  const precips = days
    .map((d) => d.precipMm)
    .filter((p): p is number => p !== null);
  const wettest = precips.length ? Math.max(...precips) : 0;
  if (wettest >= HEAVY_RAIN_MM) {
    advisories.push({
      code: "rain",
      severity: "info",
      message:
        `🌧️ Heavy rain expected (around ${Math.round(wettest)}mm). ` +
        "It can dilute your water and wash in debris — check your levels and cover afterwards.",
    });
  }

  return advisories;
}

// Short helper so callers can time out an external fetch.
async function fetchJson(url: string, revalidateSeconds?: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      signal: controller.signal,
    };
    if (revalidateSeconds) init.next = { revalidate: revalidateSeconds };
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------------------------------------------------------
// Impure: resolve a town/postcode to coordinates (Open-Meteo geocoding, no key).
// -----------------------------------------------------------------------------
export async function geocode(
  query: string,
): Promise<{ lat: number; lon: number; name: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
    encodeURIComponent(q);
  const data = (await fetchJson(url)) as
    | { results?: Array<{ latitude: number; longitude: number; name: string; country?: string; admin1?: string }> }
    | null;
  const hit = data?.results?.[0];
  if (!hit) return null;
  const parts = [hit.name, hit.admin1, hit.country].filter(Boolean);
  return { lat: hit.latitude, lon: hit.longitude, name: parts.join(", ") };
}

// -----------------------------------------------------------------------------
// Impure: 3-day daily forecast (Open-Meteo, no key). Cached ~1h via Next fetch.
// -----------------------------------------------------------------------------
export async function getForecast(
  lat: number,
  lon: number,
  locationName?: string,
): Promise<WeatherForecast | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_sum" +
    "&forecast_days=14&timezone=auto";
  const data = (await fetchJson(url, 3600)) as
    | {
        daily?: {
          time?: string[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          uv_index_max?: (number | null)[];
          precipitation_sum?: (number | null)[];
        };
      }
    | null;
  const d = data?.daily;
  if (!d?.time?.length) return null;

  const days: DailyForecast[] = d.time.map((date, i) => ({
    date,
    tempMax: d.temperature_2m_max?.[i] ?? NaN,
    tempMin: d.temperature_2m_min?.[i] ?? NaN,
    uvMax: d.uv_index_max?.[i] ?? null,
    precipMm: d.precipitation_sum?.[i] ?? null,
  }));
  return { locationName, days };
}
