// =============================================================================
//  lib/gemini.ts
//  Server-ONLY. Reads a hot-tub test strip from a photo using Google Gemini's
//  free tier (the user's chosen provider). We call Google's REST API directly
//  with a plain fetch — no SDK, no npm dependency — and ask for structured JSON
//  back. Impure: network I/O with a timeout, and it never throws (returns a
//  friendly { ok:false } instead) so the reading form always stays usable.
//
//  The numbers this returns are an AI guess. They are only ever used to PRE-FILL
//  the reading form; the user confirms/edits every value before saving. The pure
//  `normalizeScan` (lib/scan.ts) clamps whatever the model says into believable
//  ranges first.
// =============================================================================

import "server-only";
import type { SanitizerType } from "./chemistry";
import type { RawScan } from "./scan";

// The model is read from an env var so it can be changed in Vercel WITHOUT a
// code change — Google keeps shifting which models have free-tier quota. As of
// 2026 the current Flash generation still has a free tier WITH image input
// (older `gemini-2.0-flash` now returns 429 "limit 0" — no free quota).
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 20000;

export type ReadStripResult =
  | { ok: true; values: RawScan }
  | { ok: false; error: string };

// True when the feature is configured. The UI hides the scan button otherwise.
export function isScanConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// The JSON shape we ask Gemini to return (Gemini uses uppercase type names).
function responseSchema(sanitizerType: SanitizerType) {
  const properties: Record<string, unknown> = {
    ph: { type: "NUMBER", nullable: true },
    totalAlkalinityPpm: { type: "NUMBER", nullable: true },
    calciumHardnessPpm: { type: "NUMBER", nullable: true },
  };
  if (sanitizerType === "chlorine") {
    properties.freeChlorinePpm = { type: "NUMBER", nullable: true };
  } else {
    properties.brominePpm = { type: "NUMBER", nullable: true };
  }
  return { type: "OBJECT", properties };
}

function buildPrompt(sanitizerType: SanitizerType): string {
  const sanitizerLine =
    sanitizerType === "chlorine"
      ? "- freeChlorinePpm: the free chlorine pad, in ppm (typical strip values 0, 1, 3, 5, 10)."
      : "- brominePpm: the bromine (total bromine) pad, in ppm (typical strip values 0, 2, 4, 6, 10, 20).";
  return [
    "You are reading a hot-tub / spa water test strip from a photo.",
    "The strip has several coloured pads; match each pad's colour to its scale and report the value.",
    "Report these fields as numbers (use null for any pad you cannot read confidently — do NOT guess):",
    "- ph: the pH pad (typical strip values 6.2 to 8.4).",
    "- totalAlkalinityPpm: the total alkalinity pad, in ppm (typical values 0, 40, 80, 120, 180, 240).",
    sanitizerLine,
    "- calciumHardnessPpm: the calcium / total hardness pad, in ppm, if the strip has one; otherwise null.",
    "Only report a value if you can actually see the matching pad. Accuracy matters more than completeness.",
  ].join("\n");
}

export async function readTestStrip(
  imageBase64: string,
  mimeType: string,
  sanitizerType: SanitizerType,
): Promise<ReadStripResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, error: "Photo scanning isn't set up on this app yet." };
  }

  const body = {
    contents: [
      {
        parts: [
          { text: buildPrompt(sanitizerType) },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: responseSchema(sanitizerType),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Read Google's actual error so we're not guessing. Log the full detail to
      // the server (visible in Vercel logs) and surface an honest message.
      const rawBody = await res.text().catch(() => "");
      let googleMessage = "";
      try {
        googleMessage = JSON.parse(rawBody)?.error?.message ?? "";
      } catch {
        googleMessage = rawBody.slice(0, 300);
      }
      console.error(
        `[gemini] ${res.status} for model "${MODEL}": ${googleMessage || rawBody.slice(0, 300)}`,
      );

      // A 429 that says the limit is 0 (or mentions the free tier) isn't "you
      // used it all up" — it means this model has no free quota. Point the user
      // at the model switch, NOT at enabling billing (that needs a card).
      const looksLikeNoFreeQuota =
        res.status === 429 &&
        /limit[^0-9]*0|free[_ ]?tier|quota/i.test(googleMessage);

      if (looksLikeNoFreeQuota) {
        return {
          ok: false,
          error:
            `Google's free "${MODEL}" model has no free quota right now. ` +
            "This usually means the free model changed — tell whoever set this up " +
            "to switch the GEMINI_MODEL, or just type the values in.",
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          error:
            "Too many photo scans in a short time — wait a minute and try again, or type the values in.",
        };
      }
      return {
        ok: false,
        error:
          `The photo reader is unavailable right now (${res.status})` +
          (googleMessage ? `: ${googleMessage.slice(0, 140)}` : "") +
          ". Please type the values in.",
      };
    }

    const data = await res.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        ok: false,
        error: "Couldn't read the strip from that photo — try again or type it in.",
      };
    }

    let parsed: RawScan;
    try {
      parsed = JSON.parse(text) as RawScan;
    } catch {
      return {
        ok: false,
        error: "Couldn't understand the strip reading — please type the values in.",
      };
    }
    return { ok: true, values: parsed };
  } catch {
    return {
      ok: false,
      error: "The photo reader timed out — please type the values in.",
    };
  } finally {
    clearTimeout(timer);
  }
}
