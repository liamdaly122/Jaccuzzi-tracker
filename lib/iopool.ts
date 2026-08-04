// =============================================================================
//  lib/iopool.ts
//  Server-ONLY client for the iopool public API (the EcO probe).
//    GET https://api.iopool.com/v1/pools     header: x-api-key: <key>
//
//  The probe reports pH, ORP (mV) and water temperature continuously, which is
//  far better data than a paper strip. It does NOT measure total alkalinity or
//  calcium, so we surface what it gives and leave the rest to a strip — we
//  never invent the missing numbers.
//
//  Impure: network I/O with a timeout. Never throws; returns a friendly
//  { ok:false, error } so the UI degrades to manual entry.
// =============================================================================

import "server-only";
import { pickPool, type IopoolPool } from "./iopool-parse";

const ENDPOINT = "https://api.iopool.com/v1/pools";
const TIMEOUT_MS = 10000;

export type IopoolResult =
  | { ok: true; pool: IopoolPool }
  | { ok: false; error: string };

/** True when the integration is configured; the UI hides the button otherwise. */
export function isIopoolConfigured(): boolean {
  return Boolean(process.env.IOPOOL_API_KEY);
}

export async function getIopoolReading(
  opts: { fresh?: boolean } = {},
): Promise<IopoolResult> {
  const key = process.env.IOPOOL_API_KEY;
  if (!key) {
    return { ok: false, error: "Your iopool probe isn't connected yet." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "x-api-key": key },
      signal: controller.signal,
      // The probe uploads every few minutes, so a short cache keeps the
      // dashboard snappy. The refresh button bypasses it for a live read.
      ...(opts.fresh
        ? { cache: "no-store" as const }
        : { next: { revalidate: 120 } }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[iopool] ${res.status}: ${body.slice(0, 300)}`);
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error:
            "iopool rejected the API key. Check it was copied in full from the iopool app's settings screen.",
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          error: "iopool is rate-limiting us — try again in a minute.",
        };
      }
      return {
        ok: false,
        error: `Couldn't reach your iopool probe (${res.status}).`,
      };
    }

    const data = await res.json();
    const pool = pickPool(data, process.env.IOPOOL_POOL_ID ?? null);
    if (!pool) {
      return {
        ok: false,
        error:
          "iopool didn't return any pools for that key — is the probe set up in the app?",
      };
    }
    return { ok: true, pool };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach your iopool probe — check your connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}
