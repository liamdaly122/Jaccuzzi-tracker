"use client";

// =============================================================================
//  components/HeatingPlanCard.tsx
//  "When do I switch the heater on?" — answered from the live water
//  temperature, the forecast, and what this tub has actually been seen to do.
//
//  Client-side because lib/heating.ts is pure: changing the "ready by" time
//  recomputes instantly with no round trip to the server.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Card } from "./ui";
import Icon from "./Icon";
import {
  heatingPlan,
  keepWarmVsReheat,
  nextOccurrenceOf,
  nextScheduledSoak,
  reachableByC,
  type HeatingSchedule,
  type KeepWarmComparison,
} from "@/lib/heating";
import { TEMP_MAX_C, TEMP_MIN_C } from "@/lib/chemistry";

const TRACK = "#e2e8f0";
const HEATING = "#fab219";
const READY = "#0ca30c";
const MUTED = "#94a3b8";

const HOUR_MS = 60 * 60 * 1000;

// Sunday-first, matching Date.getDay().
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function describeDays(weekdays: number[]): string {
  if (weekdays.length === 7) return "every day";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) {
    return "weekdays";
  }
  if (weekdays.length === 2 && weekdays.includes(0) && weekdays.includes(6)) {
    return "weekends";
  }
  return weekdays.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
}

// A "HH:MM" value for a time input, in the browser's own timezone.
function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function clockTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dayWord(d: Date, now: Date): string {
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) /
      (24 * HOUR_MS),
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

function hoursWord(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) return `${totalMinutes} minutes`;
  // Round to minutes FIRST, so 1.999 h reads "2 hours" rather than "1h 60m".
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

/** now -> switch on -> ready, so the wait is a shape rather than a number. */
function Timeline({
  now,
  switchOnAt,
  readyAt,
}: {
  now: Date;
  switchOnAt: Date;
  readyAt: Date;
}) {
  const W = 300;
  const H = 30;
  const padX = 6;
  const plotW = W - padX * 2;

  const start = Math.min(now.getTime(), switchOnAt.getTime());
  const span = Math.max(1, readyAt.getTime() - start);
  const x = (t: number) =>
    padX + Math.min(1, Math.max(0, (t - start) / span)) * plotW;

  const onX = x(switchOnAt.getTime());

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Switch on at ${clockTime(switchOnAt)}, ready at ${clockTime(readyAt)}.`}
    >
      <rect x={padX} y={11} width={plotW} height={5} rx={2.5} fill={TRACK} />
      {/* The heating stretch */}
      <rect
        x={onX}
        y={11}
        width={Math.max(2, padX + plotW - onX)}
        height={5}
        rx={2.5}
        fill={HEATING}
      />
      <circle cx={onX} cy={13.5} r={5} fill={HEATING} stroke="#fff" strokeWidth={2} />
      <circle
        cx={padX + plotW}
        cy={13.5}
        r={5}
        fill={READY}
        stroke="#fff"
        strokeWidth={2}
      />
      <text x={padX} y={H - 1} fontSize={9} fill={MUTED}>
        {clockTime(now)} now
      </text>
      <text x={padX + plotW} y={H - 1} fontSize={9} fill={MUTED} textAnchor="end">
        {clockTime(readyAt)} ready
      </text>
    </svg>
  );
}

export interface HeatingPlanCardProps {
  currentC: number | null;
  targetC: number;
  ambientC: number;
  watts: number;
  measured: boolean;
  samples: number;
  volumeLitres: number;
  pricePerKwh: number;
  defaultReadyAtIso: string;
  nowIso: string;
  /** Pre-computed on the server; independent of the chosen time. */
  keepWarm: KeepWarmComparison | null;
  patternNote: string | null;
  /** The saved schedule, when there is one. */
  schedule: HeatingSchedule | null;
}

export default function HeatingPlanCard({
  currentC,
  targetC,
  ambientC,
  watts,
  measured,
  samples,
  volumeLitres,
  pricePerKwh,
  defaultReadyAtIso,
  nowIso,
  keepWarm,
  patternNote,
  schedule,
}: HeatingPlanCardProps) {
  // Seed straight from the saved schedule when there is one. Deriving it from
  // the resolved date instead would let a second's rounding make a freshly
  // loaded, unmodified schedule look edited.
  const [readyTime, setReadyTime] = useState(
    () => schedule?.time ?? toTimeInput(new Date(defaultReadyAtIso)),
  );
  const [target, setTarget] = useState(targetC);
  const [savingTarget, setSavingTarget] = useState(false);
  const [saved, setSaved] = useState<HeatingSchedule | null>(schedule);
  const [days, setDays] = useState<number[]>(
    () => schedule?.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  // Start from the server's clock so the first client render matches, then
  // correct to the real one — the same hydration-safe trick GuideRunner uses.
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => setNow(new Date()), []);

  // A saved schedule decides the day as well as the time; without one, the next
  // time that clock time comes round is the best we can do.
  const readyAt = useMemo(() => {
    if (saved) {
      const next = nextScheduledSoak({ ...saved, time: readyTime }, now);
      if (next) return next;
    }
    return nextOccurrenceOf(readyTime, now) ?? new Date(defaultReadyAtIso);
  }, [saved, readyTime, now, defaultReadyAtIso]);

  const dirty =
    saved === null ||
    saved.time !== readyTime ||
    saved.weekdays.join() !== [...days].sort((a, b) => a - b).join();

  async function saveSchedule(next: HeatingSchedule | null) {
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/heating-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      if (res.ok) setSaved(next);
    } catch {
      // Leave it unsaved rather than pretending; the button stays available.
    } finally {
      setSavingSchedule(false);
    }
  }

  // Persist immediately: this is a standing preference, not a one-off, and it
  // has to reach the morning push too. Optimistic — the number on screen moves
  // as soon as it's tapped and the save catches up.
  async function saveTarget(next: number) {
    const clamped = Math.min(TEMP_MAX_C, Math.max(TEMP_MIN_C, next));
    setTarget(clamped);
    setSavingTarget(true);
    try {
      await fetch("/api/soak-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempTarget: clamped }),
      });
    } catch {
      // The figure on screen is still right for this session.
    } finally {
      setSavingTarget(false);
    }
  }

  const plan = useMemo(
    () =>
      heatingPlan({
        currentC,
        targetC: target,
        readyAt,
        ambientC,
        watts,
        volumeLitres,
        pricePerKwh,
        now,
      }),
    [currentC, target, readyAt, ambientC, watts, volumeLitres, pricePerKwh, now],
  );

  // Nothing useful to say without a live water temperature.
  if (currentC === null || !plan) return null;

  const hoursAvailable = Math.max(
    0,
    (readyAt.getTime() - now.getTime()) / HOUR_MS,
  );

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
        <Icon name="flame" size={18} className="text-brand-600" />
        Heating plan
      </h2>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ready by
          </span>
          <input
            type="time"
            value={readyTime}
            onChange={(e) => setReadyTime(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-400">
            {dayWord(readyAt, now)}
          </span>
        </label>

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            At
          </span>
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              aria-label="Cooler"
              disabled={savingTarget || target <= TEMP_MIN_C}
              onClick={() => saveTarget(target - 0.5)}
              className="h-9 w-9 rounded-xl border border-slate-300 text-lg font-medium text-slate-600 disabled:opacity-40"
            >
              −
            </button>
            <span className="num-tabular w-16 text-center text-lg font-bold text-slate-900">
              {target}&nbsp;°C
            </span>
            <button
              type="button"
              aria-label="Warmer"
              disabled={savingTarget || target >= TEMP_MAX_C}
              onClick={() => saveTarget(target + 0.5)}
              className="h-9 w-9 rounded-xl border border-slate-300 text-lg font-medium text-slate-600 disabled:opacity-40"
            >
              +
            </button>
          </div>
          {target >= TEMP_MAX_C ? (
            <span className="mt-1 block text-right text-xs text-slate-400">
              tub&apos;s maximum
            </span>
          ) : null}
        </div>
      </div>
      {/* Which days this applies to — the half that makes it a schedule
          rather than a one-off. */}
      <div className="mt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          On these days
        </span>
        <div className="mt-1.5 flex gap-1">
          {DAY_LABELS.map((label, day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[day]}
                onClick={() =>
                  setDays((prev) =>
                    prev.includes(day)
                      ? prev.filter((d) => d !== day)
                      : [...prev, day].sort((a, b) => a - b),
                  )
                }
                className={`h-9 flex-1 rounded-lg border text-sm font-medium transition ${
                  on
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-slate-300 bg-white text-slate-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {saved && !dirty ? (
          <>
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Icon name="check-circle" size={14} />
              Saved — {describeDays(saved.weekdays)} at {saved.time}
            </p>
            <button
              type="button"
              onClick={() => saveSchedule(null)}
              disabled={savingSchedule}
              className="text-xs font-medium text-slate-400 underline underline-offset-2 hover:text-slate-600"
            >
              Forget it
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              {saved ? "Unsaved changes." : patternNote}
            </p>
            <button
              type="button"
              disabled={savingSchedule || days.length === 0}
              onClick={() =>
                saveSchedule({ enabled: true, weekdays: days, time: readyTime })
              }
              className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
            >
              {savingSchedule ? "Saving…" : "Save this schedule"}
            </button>
          </>
        )}
      </div>

      {/* The answer */}
      <div className="mt-3">
        {plan.alreadyWarmEnough ? (
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="flex items-center gap-2 font-semibold text-emerald-800">
              <Icon name="check-circle" size={17} />
              Already up to temperature
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              The water is {currentC}&nbsp;°C — nothing to do but get in.
            </p>
          </div>
        ) : plan.unreachable ? (
          <div className="rounded-xl bg-red-50 p-3">
            <p className="flex items-center gap-2 font-semibold text-red-800">
              <Icon name="alert-triangle" size={17} />
              Can&apos;t reach {target}&nbsp;°C in this weather
            </p>
            <p className="mt-1 text-sm text-red-800">
              At {Math.round(ambientC)}&nbsp;°C outside, the heater loses as much
              as it puts in before it gets there. Keep the cover on and aim a
              little lower.
            </p>
          </div>
        ) : plan.tooLate ? (
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <Icon name="alert-triangle" size={17} />
              Too late for {clockTime(readyAt)}
            </p>
            <p className="mt-1 text-sm text-amber-900">
              From {currentC}&nbsp;°C this needs {hoursWord(plan.hours)}, so it
              would have wanted switching on {hoursWord(plan.shortfallHours)} ago.
              Switch on now and you&apos;d be at about{" "}
              <strong>
                {reachableByC(currentC, hoursAvailable, ambientC, watts, volumeLitres)}
                &nbsp;°C
              </strong>{" "}
              by then.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
              Switch on
            </p>
            <p className="num-tabular text-3xl font-bold text-slate-900">
              {clockTime(plan.switchOnAt!)}
            </p>
            <p className="text-sm text-slate-600">
              {dayWord(plan.switchOnAt!, now)} — {hoursWord(plan.hours)} from{" "}
              {currentC}&nbsp;°C to {target}&nbsp;°C, about {plan.kwh}&nbsp;kWh
              (£{plan.cost.toFixed(2)}).
            </p>
          </div>
        )}
      </div>

      {plan.switchOnAt && !plan.alreadyWarmEnough && !plan.tooLate ? (
        <div className="mt-3">
          <Timeline now={now} switchOnAt={plan.switchOnAt} readyAt={readyAt} />
        </div>
      ) : null}

      {/* Hold it hot, or let it go cold? */}
      {keepWarm ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            You soak about {keepWarm.soaksPerWeek}&times; a week
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Leave it hot</dt>
              <dd className="num-tabular font-semibold text-slate-800">
                £{keepWarm.keepWarmWeekly.toFixed(2)}/wk
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Let it cool, reheat each time</dt>
              <dd className="num-tabular font-semibold text-slate-800">
                £{keepWarm.reheatWeekly.toFixed(2)}/wk
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-sm font-medium text-slate-800">
            {keepWarm.cheaper === "keep_warm"
              ? `At that rate it's cheaper to leave it at temperature — about £${keepWarm.savingWeekly.toFixed(2)} a week better than reheating from cold.`
              : `At that rate it's cheaper to let it cool between soaks — about £${keepWarm.savingWeekly.toFixed(2)} a week better than holding it hot.`}
          </p>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-slate-400">
        {measured
          ? `Timed from ${samples} real heat-ups on your own tub, adjusted for tonight's ${Math.round(ambientC)} °C.`
          : `Estimated from your tub size and a typical heater — I'll time your real heat-ups as the probe records them and tighten this up.`}{" "}
        Includes a half-hour of slack, since running on early costs pennies and
        running late spoils the soak.
      </p>
    </Card>
  );
}
