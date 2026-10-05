// =============================================================================
//  lib/todo.ts
//  Today's one list. Jobs due, chemicals to add, forecast warnings, the water
//  change and the winter deadline used to live in six separate cards; this
//  turns them into a single ranked list of short, tickable lines, each with
//  its longer explanation kept for a "Why?" tap.
//
//  Pure: everything arrives as data, so the ranking and the rules about what
//  shows are unit-tested (tests/todo.test.ts).
//
//  Freshness rule for the water itself: pH and sanitiser come from whichever
//  is newer, the live probe or the last strip test. A stale strip result must
//  not raise a warning the probe has since cleared, nor hide one it has since
//  found. Alkalinity, calcium and stabiliser only ever come from strips.
// =============================================================================

import {
  calculateRecommendations,
  type CalculationResult,
  type Recommendation,
  type SafetyFlag,
  type SpaConfig,
} from "./chemistry";
import type { DueStatus, TaskLife } from "./tasks";
import type { Forecast } from "./predict";
import type { WaterVerdict } from "./water";
import type { WinterCountdown } from "./winter";
import type { IconName } from "./icons";
import { shortDay, type Tone } from "./display";

/** Lower comes first. Ties keep the order they were added in. */
export const RANK = {
  dose: 10,
  heater: 20,
  waterChange: 25,
  overdue: 30,
  dueToday: 40,
  headsUp: 50,
} as const;

export type TodoAction =
  | { kind: "task"; taskId: number; name: string }
  /** A job that's done by logging a test; the item also gets a "Log test" button. */
  | { kind: "test"; taskId: number; name: string }
  | { kind: "dose"; chemical: string; grams: number | null }
  | { kind: "heater" }
  | { kind: "link"; href: string; label: string }
  | { kind: "info" };

export interface TodoItem {
  id: string;
  rank: number;
  icon: IconName;
  title: string;
  sub: string;
  chip: { label: string; tone: Tone } | null;
  why: { title: string; paragraphs: string[] } | null;
  action: TodoAction;
}

export interface LaterItem {
  id: string;
  icon: IconName;
  title: string;
  when: string;
  /** Present when it can be ticked off early. */
  taskId?: number;
  href?: string;
}

export interface TodoJob {
  row: { id: number; task_key: string; name: string; task_type: string; frequency_days: number };
  life: TaskLife;
}

export interface TodoInput {
  now: Date;
  config: SpaConfig;
  /** The last strip test, already run through the calculator. */
  strip: { calc: CalculationResult; recordedAt: string; alkalinityPpm: number } | null;
  /** The live probe's latest valid reading. */
  probe: { ph: number | null; orpMv: number | null; measuredAt: string } | null;
  dosing: { chemical: string; logged_at: string }[];
  jobs: TodoJob[];
  forecasts: Forecast[];
  drift: { likelyStabiliserBuildup: boolean; message: string | null } | null;
  verdict: WaterVerdict | null;
  winter: { countdown: WinterCountdown | null; deadline: Date | null; decided: boolean };
}

export interface TodoResult {
  /** Danger and warning flags for the banner that can't be dismissed. */
  safety: SafetyFlag[];
  items: TodoItem[];
  later: LaterItem[];
}

const LATER_DAYS = 30;

// The water-quality sources this list reads pH and sanitiser from.
const PH_OR_SANITISER = new Set(["ph_out_of_range", "sanitizer_too_high", "sanitizer_ineffective"]);

/** pH and sanitiser recommendations come from the fresher source. */
function waterAdvice(input: TodoInput): {
  recs: { rec: Recommendation; at: string }[];
  safety: SafetyFlag[];
} {
  const { strip, probe, config } = input;
  const probeIsFresher =
    probe !== null &&
    (probe.ph !== null || probe.orpMv !== null) &&
    (strip === null || new Date(probe.measuredAt).getTime() > new Date(strip.recordedAt).getTime());

  if (!probeIsFresher || !probe) {
    return {
      recs: (strip?.calc.recommendations ?? []).map((rec) => ({ rec, at: strip!.recordedAt })),
      safety: strip?.calc.safetyFlags ?? [],
    };
  }

  // The probe measures pH and ORP. Alkalinity comes from the last strip (or a
  // neutral mid-range value if there isn't one) only so the calculator can run;
  // its alkalinity advice is ignored and the strip's own is used instead.
  const ta = strip?.alkalinityPpm ?? (config.targetRanges.taMin + config.targetRanges.taMax) / 2;
  const probeCalc = calculateRecommendations(
    {
      ph: probe.ph ?? (config.targetRanges.phIdealMin + config.targetRanges.phIdealMax) / 2,
      totalAlkalinityPpm: ta,
      orpMv: probe.orpMv,
      freeChlorinePpm: null,
      brominePpm: null,
    },
    { ...config, sanitizerUnit: "orp" },
  );
  const fromProbe = probeCalc.recommendations
    .filter((r) => r.order === 2 || r.order === 3)
    .filter((r) => r.order !== 2 || probe.ph !== null)
    .map((rec) => ({ rec, at: probe.measuredAt }));
  const fromStrip = (strip?.calc.recommendations ?? [])
    .filter((r) => r.order !== 2 && r.order !== 3)
    .map((rec) => ({ rec, at: strip!.recordedAt }));

  return {
    recs: [...fromStrip, ...fromProbe].sort((a, b) => a.rec.order - b.rec.order),
    safety: [
      ...probeCalc.safetyFlags,
      ...(strip?.calc.safetyFlags.filter((f) => !PH_OR_SANITISER.has(f.code)) ?? []),
    ],
  };
}

const DOSE_ICON: Record<string, IconName> = {
  ta_increaser: "balance",
  ta_decreaser: "balance",
  ph_increaser: "flask",
  ph_decreaser: "flask",
  dichlor: "droplet",
  bromine_granules: "bromine",
  sodium_bromide: "bromine",
  mps_shock: "sparkle",
};

const DOSE_NAME: Record<string, string> = {
  ta_increaser: "alkalinity increaser",
  ta_decreaser: "pH/alkalinity decreaser",
  ph_increaser: "pH increaser",
  ph_decreaser: "pH decreaser",
  dichlor: "dichlor",
  bromine_granules: "bromine granules",
  sodium_bromide: "sodium bromide",
  mps_shock: "shock",
};

/** "Alkalinity increaser", "Dichlor": what's on the tub, for a heading. */
export function chemicalName(chemical: string | null): string | null {
  const name = chemical ? DOSE_NAME[chemical] : undefined;
  if (!name) return null;
  return name.startsWith("pH") ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

function doseTitle(rec: Recommendation): string {
  const name = rec.chemical ? DOSE_NAME[rec.chemical] : null;
  if (!name) return rec.label;
  if (rec.chemical === "ta_decreaser") return "Lower the alkalinity a little";
  // A non-breaking space keeps the number and its "g" on the same line.
  if (rec.amountGrams !== null) return `Add ${fmtGrams(rec.amountGrams)}\u00a0g ${name}`;
  return `Add a little ${name}`;
}

function fmtGrams(g: number): string {
  return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

// The first sentence of the calculator's advice says what's wrong; that's the
// short line, cut before any "so…" consequence. The whole of it goes behind "Why?".
function firstSentence(text: string): string {
  const m = text.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : text).replace(/\.$/, "").replace(/,\s+(so|which|because)\s.*$/, "");
}

const JOB_TITLE: Record<string, string> = {
  test_water: "Test with a strip",
  rinse_filter: "Rinse the filter",
  deep_clean_filter: "Deep-clean the filter",
  replace_filter: "Replace the filter",
  shock: "Shock the water",
  drain_refill: "Drain & refill",
  cover_cabinet_check: "Check the cover & cabinet",
};

const JOB_WHY: Record<string, string[]> = {
  test_water: [
    "A probe measures pH, ORP and temperature. It can't measure alkalinity, calcium or stabiliser, and those drift between water changes.",
    "Alkalinity is what holds your pH steady, so a strip every few days keeps everything else easy.",
  ],
  rinse_filter: [
    "A clogged filter stops trapping the fine particles that make water cloudy, and makes the pump work harder.",
    "Hose the cartridge from top to bottom until the water runs clear, then put it back.",
  ],
  deep_clean_filter: [
    "Rinsing doesn't shift body oils and scale. An overnight soak in filter cleaner does, and the cartridge lasts longer for it.",
  ],
  shock: [
    "Shock burns off the oils, sweat and other waste that use up your chlorine, so the chlorine you add can get on with sanitising.",
  ],
  cover_cabinet_check: [
    "A quick look for splits, damp and wear. A cover that's started to fail costs heat every hour of every day.",
  ],
};

function jobTone(status: DueStatus, days: number): [string, Tone] {
  if (status === "overdue" && days < 0) return ["Overdue", "bad"];
  return ["Today", "warn"];
}

function jobSub(job: TodoJob): string {
  const { life, row } = job;
  const every = `every ${row.frequency_days} day${row.frequency_days === 1 ? "" : "s"}`;
  if (life.status === "overdue" && life.daysUntilDue < 0) {
    const late = Math.abs(life.daysUntilDue);
    // Short enough to leave room for "· Why?" on the same line.
    return late === 1 ? "Due yesterday" : `${late} days overdue`;
  }
  return every.charAt(0).toUpperCase() + every.slice(1);
}

export function buildTodos(input: TodoInput): TodoResult {
  const items: TodoItem[] = [];
  const later: LaterItem[] = [];
  const { recs, safety } = waterAdvice(input);
  const t = (iso: string) => new Date(iso).getTime();

  // --- Chemicals to add ----------------------------------------------------------
  for (const { rec, at } of recs) {
    // Already dealt with: a matching dose logged since the reading it came from.
    const handled =
      rec.chemical !== null &&
      input.dosing.some((d) => d.chemical === rec.chemical && t(d.logged_at) > t(at));
    if (handled) continue;
    // Advice with nothing to add: the minor stuff waits for the test results
    // screen, "do not use" is the banner's job, and "change the water" has
    // its own line below.
    if (rec.chemical === null) {
      if (rec.severity !== "medium" && rec.severity !== "high") continue;
      if (input.verdict?.status === "change_now" && /change the water/i.test(rec.label)) continue;
    }
    items.push({
      id: `dose:${rec.chemical ?? rec.label}`,
      rank: RANK.dose,
      icon: (rec.chemical && DOSE_ICON[rec.chemical]) || "droplet",
      title: doseTitle(rec),
      sub: firstSentence(rec.instructions),
      chip: { label: "Water", tone: rec.severity === "high" || rec.severity === "safety" ? "bad" : "warn" },
      why: { title: rec.label, paragraphs: [rec.instructions] },
      action: rec.chemical ? { kind: "dose", chemical: rec.chemical, grams: rec.amountGrams } : { kind: "info" },
    });
  }

  // --- Changing the water ------------------------------------------------------------
  if (input.verdict?.status === "change_now") {
    items.push({
      id: "water-change",
      rank: RANK.waterChange,
      icon: "drain",
      title: "Time to change the water",
      sub: firstSentence(input.verdict.detail),
      chip: { label: "Water", tone: "bad" },
      why: { title: input.verdict.headline, paragraphs: [input.verdict.detail] },
      action: { kind: "link", href: "/guides/drain-and-refill-day", label: "How to" },
    });
  } else if (input.verdict?.status === "change_soon") {
    later.push({ id: "water-change", icon: "drain", title: "Change the water soon", when: "Soon", href: "/water" });
  }

  // --- Jobs ----------------------------------------------------------------------------
  for (const job of input.jobs) {
    const { life, row } = job;
    const dueNow = life.status === "overdue" || life.daysUntilDue <= 0;
    if (dueNow) {
      const [label, tone] = jobTone(life.status, life.daysUntilDue);
      const title = JOB_TITLE[row.task_key] ?? row.name;
      const why = JOB_WHY[row.task_key];
      items.push({
        id: `task:${row.id}`,
        rank: life.status === "overdue" && life.daysUntilDue < 0 ? RANK.overdue : RANK.dueToday,
        icon: row.task_key === "test_water" ? "flask" : row.task_key.includes("filter") ? "filter" : row.task_key === "shock" ? "sparkle" : row.task_key === "drain_refill" ? "drain" : "sponge",
        title,
        sub: jobSub(job),
        chip: { label, tone },
        why: why ? { title: `Why ${title.charAt(0).toLowerCase()}${title.slice(1)}?`, paragraphs: why } : null,
        action:
          row.task_key === "test_water"
            ? { kind: "test", taskId: row.id, name: row.name }
            : { kind: "task", taskId: row.id, name: row.name },
      });
    } else if (life.daysUntilDue <= LATER_DAYS) {
      later.push({
        id: `task:${row.id}`,
        icon: "check-circle",
        title: JOB_TITLE[row.task_key] ?? row.name,
        when: life.daysUntilDue === 1 ? "Tomorrow" : shortDay(life.nextDueAt),
        taskId: row.id,
      });
    }
  }

  // --- Heads-ups -------------------------------------------------------------------------
  for (const f of input.forecasts) {
    const item: TodoItem = {
      id: `forecast:${f.key}`,
      rank: RANK.headsUp,
      icon: "trend-up",
      title: `${f.metric} ${f.direction === "falling" ? "dropping" : "rising"}`,
      sub: `Likely ${f.direction === "falling" ? "below" : "above"} ${f.threshold} in about ${f.daysUntil} day${f.daysUntil === 1 ? "" : "s"}`,
      chip: { label: "Heads-up", tone: "neutral" },
      why: { title: `${f.metric} is ${f.direction}`, paragraphs: [f.message] },
      action: { kind: "info" },
    };
    if (f.severity === "warning") items.push(item);
    else later.push({ id: item.id, icon: "trend-up", title: item.title, when: `~${f.daysUntil} days`, href: "/water" });
  }
  if (input.drift?.message && input.verdict?.status !== "change_now") {
    items.push({
      id: "drift",
      rank: RANK.headsUp,
      icon: "trend-up",
      title: "Chlorine is losing strength",
      sub: input.drift.likelyStabiliserBuildup ? "Probably stabiliser building up" : "Check your pH first",
      chip: { label: "Heads-up", tone: "neutral" },
      why: { title: "Why is it losing strength?", paragraphs: [input.drift.message] },
      action: { kind: "info" },
    });
  }

  // --- Winter ------------------------------------------------------------------------------
  const cd = input.winter.countdown;
  if (cd && !input.winter.decided && cd.status !== "not_yet") {
    const by = input.winter.deadline ? `By ${shortDay(input.winter.deadline)}` : "Soon";
    if (cd.status === "overdue" || cd.status === "due_soon") {
      items.push({
        id: "winter",
        rank: cd.status === "overdue" ? RANK.overdue : RANK.dueToday,
        icon: "snowflake",
        title: "Decide your winter plan",
        sub: cd.decidedBy === "forecast" ? `Frost forecast · ${by.charAt(0).toLowerCase()}${by.slice(1)}` : by,
        chip: { label: cd.status === "overdue" ? "Overdue" : `${Math.max(0, cd.daysUntil)} days`, tone: cd.status === "overdue" ? "bad" : "warn" },
        why: null,
        action: { kind: "link", href: "/care", label: "Look" },
      });
    } else {
      later.push({ id: "winter", icon: "snowflake", title: "Decide your winter plan", when: by, href: "/care" });
    }
  }

  // Stable sort by rank; later by the order things fall due.
  const ranked = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.rank - b.it.rank || a.i - b.i).map((x) => x.it);
  return { safety, items: ranked, later };
}

/**
 * The heater line, worked out on the phone because clock times must be in its
 * own timezone. Null when there's nothing to switch on today.
 */
export function heaterTodo(opts: {
  switchOnAt: Date | null;
  readyAt: Date;
  targetC: number;
  alreadyWarm: boolean;
  unreachable: boolean;
  tooLate: boolean;
  now: Date;
}): TodoItem | null {
  const { switchOnAt, readyAt, targetC, now } = opts;
  if (opts.alreadyWarm || opts.unreachable) return null;
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  // Only today's soak; tomorrow's switch-on belongs to tomorrow's list.
  if (!sameDay(readyAt, now) && !(switchOnAt && sameDay(switchOnAt, now))) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    id: "heater",
    rank: RANK.heater,
    icon: "flame",
    title: "Switch the heater on",
    sub: opts.tooLate ? `Now, to be as close to ${targetC}° as it can by ${clock(readyAt)}` : `For ${clock(readyAt)} at ${targetC}°`,
    chip: { label: opts.tooLate || !switchOnAt ? "Now" : clock(switchOnAt), tone: "heat" },
    why: null,
    action: { kind: "heater" },
  };
}

/** Insert the heater line into a ranked list at its rank. */
export function withHeater(items: TodoItem[], heater: TodoItem | null): TodoItem[] {
  if (!heater) return items;
  const at = items.findIndex((it) => it.rank > heater.rank);
  return at === -1 ? [...items, heater] : [...items.slice(0, at), heater, ...items.slice(at)];
}

export interface WaterPill {
  label: string;
  value: string;
  /** Omitted for a plain figure with no right or wrong, like the temperature. */
  tone?: Tone;
}

/**
 * Today's three numbers: temperature, pH and sanitiser. Same freshness rule as
 * the list: pH and sanitiser from the probe when it's newer than the last test.
 * Sanitiser is a word (Low / OK / High) because the raw figure means little
 * without the range beside it.
 */
export function waterPills(input: {
  config: SpaConfig;
  /** Today's banner flags: a reading behind a "don't get in" shows red, not amber. */
  safety?: SafetyFlag[];
  waterC: number | null;
  probe: { ph: number | null; orpMv: number | null; measuredAt: string } | null;
  strip: { ph: number; sanitiserPpm: number | null; orpMv: number | null; recordedAt: string } | null;
}): WaterPill[] {
  const { config, waterC, probe, strip } = input;
  const r = config.targetRanges;
  const danger = (codes: string[]) =>
    (input.safety ?? []).some((f) => f.severity === "danger" && codes.includes(f.code));
  const band = (v: number, lo: number, hi: number): [string, Tone] =>
    v < lo ? ["Low", "warn"] : v > hi ? ["High", "warn"] : ["OK", "good"];
  const probeNewer =
    probe !== null && (strip === null || new Date(probe.measuredAt).getTime() > new Date(strip.recordedAt).getTime());

  const pills: WaterPill[] = [];
  if (waterC !== null) pills.push({ label: "Water", value: `${waterC.toFixed(1)}°` });

  const ph = probeNewer && probe!.ph !== null ? probe!.ph : (strip?.ph ?? null);
  if (ph !== null) {
    const tone = band(ph, r.phIdealMin, r.phIdealMax)[1];
    pills.push({ label: "pH", value: ph.toFixed(1), tone: tone !== "good" && danger(["ph_out_of_range"]) ? "bad" : tone });
  }

  const chlorine = config.sanitizerType === "chlorine";
  const label = chlorine ? "Chlorine" : "Bromine";
  let word: [string, Tone] | null = null;
  if (probeNewer && probe!.orpMv !== null) word = band(probe!.orpMv, r.orpMin, r.orpMax);
  else if (strip?.sanitiserPpm != null)
    word = band(strip.sanitiserPpm, chlorine ? r.fcMin : r.brMin, chlorine ? r.fcMax : r.brMax);
  else if (strip?.orpMv != null) word = band(strip.orpMv, r.orpMin, r.orpMax);
  if (word) {
    const bad = word[1] !== "good" && danger(["sanitizer_too_high", "sanitizer_ineffective"]);
    pills.push({ label, value: word[0], tone: bad ? "bad" : word[1] });
  }

  return pills;
}
