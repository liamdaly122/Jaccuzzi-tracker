// =============================================================================
//  lib/validation.ts
//  Zod schemas for validating API request bodies. Numbers coming from a form
//  may be null/undefined for optional fields.
// =============================================================================

import { z } from "zod";

const optionalNumber = z
  .union([z.number(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const readingSchema = z.object({
  ph: z.number().min(0).max(14),
  freeChlorinePpm: optionalNumber,
  brominePpm: optionalNumber,
  totalAlkalinityPpm: z.number().min(0).max(1000),
  calciumHardnessPpm: optionalNumber,
  isFreshFill: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().nullable(),
  recordedAt: z.string().datetime().optional(),
});
export type ReadingInput = z.infer<typeof readingSchema>;

export const dosingSchema = z.object({
  readingId: z.number().int().positive().nullable().optional(),
  chemical: z.enum([
    "ta_increaser",
    "ta_decreaser",
    "ph_increaser",
    "ph_decreaser",
    "dichlor",
    "bromine_granules",
    "sodium_bromide",
    "mps_shock",
    "other",
  ]),
  amountGrams: z.number().min(0).max(100000),
  note: z.string().max(2000).optional().nullable(),
});
export type DosingInput = z.infer<typeof dosingSchema>;

const targetRangesSchema = z.object({
  phIdealMin: z.number(),
  phIdealMax: z.number(),
  phAcceptableMin: z.number(),
  phAcceptableMax: z.number(),
  taMin: z.number(),
  taMax: z.number(),
  fcMin: z.number(),
  fcMax: z.number(),
  brMin: z.number(),
  brMax: z.number(),
  chMin: z.number(),
  chMax: z.number(),
});

const dosingConstantsSchema = z.object({
  taIncreaserGPer1000LPer10Ppm: z.number().positive(),
  phIncreaserDoseSmallG: z.number().positive(),
  phIncreaserDoseMediumG: z.number().positive(),
  phIncreaserDoseLargeG: z.number().positive(),
  phDecreaserDoseSmallG: z.number().positive(),
  phDecreaserDoseMediumG: z.number().positive(),
  phDecreaserDoseLargeG: z.number().positive(),
  dichlorAvailableChlorineFraction: z.number().positive().max(1),
  bromineTopUpGPer1000L: z.number().positive(),
  bromineInitialChargeGPer1000L: z.number().positive(),
  sodiumBromideGPer1000L: z.number().positive(),
  mpsShockGPer1000L: z.number().positive(),
});

export const settingsSchema = z.object({
  sanitizerType: z.enum(["chlorine", "bromine"]),
  volumeLitres: z.number().positive().max(100000),
  avgDailyBathers: z.number().min(0).max(100),
  targetRanges: targetRangesSchema,
  dosingConstants: dosingConstantsSchema,
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const usageSchema = z.object({
  bathers: z.number().int().positive().max(50),
  usedAt: z.string().datetime().optional(),
  note: z.string().max(2000).optional().nullable(),
});
export type UsageInput = z.infer<typeof usageSchema>;

export const taskUpdateSchema = z.object({
  frequencyDays: z.number().int().positive().max(3650),
});

export const completeTaskSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
});
