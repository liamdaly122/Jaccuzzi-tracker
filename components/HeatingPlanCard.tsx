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
  reachableByC,
  type KeepWarmComparison,
} from "@/lib/heating";

const TRACK = "#e2e8f0";
const HEATING = "#fab219";
const READY = "#0ca30c";
const MUTED = "#94a3b8";

const HOUR_MS = 60 * 60 * 1000;

// A datetime-local value in the browser's own timezone.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h} hours` : `${h}h ${m}m`;
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
}: HeatingPlanCardProps) {
  const [readyAtLocal, setReadyAtLocal] = useState(() =>
    toLocalInput(new Date(defaultReadyAtIso)),
  );
  // Start from the server's clock so the first client render matches, then
  // correct to the real one — the same hydration-safe trick GuideRunner uses.
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => setNow(new Date()), []);

  const readyAt = useMemo(() => new Date(readyAtLocal), [readyAtLocal]);

  const plan = useMemo(
    () =>
      heatingPlan({
        currentC,
        targetC,
        readyAt,
        ambientC,
        watts,
        volumeLitres,
        pricePerKwh,
        now,
      }),
    [currentC, targetC, readyAt, ambientC, watts, volumeLitres, pricePerKwh, now],
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

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Ready by
        </span>
        <input
          type="datetime-local"
          value={readyAtLocal}
          onChange={(e) => setReadyAtLocal(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {patternNote ? (
        <p className="mt-1 text-xs text-slate-400">{patternNote}</p>
      ) : null}

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
              Can&apos;t reach {targetC}&nbsp;°C in this weather
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
              {currentC}&nbsp;°C to {targetC}&nbsp;°C, about {plan.kwh}&nbsp;kWh
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
