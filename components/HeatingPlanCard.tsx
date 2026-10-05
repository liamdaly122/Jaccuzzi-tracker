"use client";

// =============================================================================
//  components/HeatingPlanCard.tsx
//  The Heat tab's top half, in two parts. "Your soak" holds the standing
//  choices — ready-by time, temperature, which days — and saves them. "Today's
//  heat-up" answers the one question that matters on the day: when to switch
//  the heater on.
//
//  Client-side on purpose: lib/heating.ts is pure, so editing the time
//  recomputes instantly, and clock times are worked out in the phone's own
//  timezone rather than the server's (UTC).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import WhyButton from "./WhyButton";
import { Button, Callout, Card, FieldRow, Section } from "./ui";
import Stepper from "./Stepper";
import TimeStepper from "./TimeStepper";
import { useToast } from "./Toaster";
import { useHeaterOn } from "./useHeaterOn";
import {
  BUFFER_MINUTES,
  heatingPlan,
  nextOccurrenceOf,
  nextScheduledSoak,
  reachableByC,
  type HeatingSchedule,
  type KeepWarmComparison,
} from "@/lib/heating";
import { TEMP_MAX_C, TEMP_MIN_C } from "@/lib/chemistry";

const HOUR_MS = 60 * 60 * 1000;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeDays(weekdays: number[]): string {
  if (weekdays.length === 7) return "every day";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "weekdays";
  if (weekdays.length === 2 && weekdays.includes(0) && weekdays.includes(6)) return "weekends";
  return weekdays.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function dayWord(d: Date, now: Date): string {
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / (24 * HOUR_MS),
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return DAY_NAMES[d.getDay()];
}

function duration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  // Non-breaking spaces: "2 h 54 min" never splits across lines.
  if (h === 0) return `${m}\u00a0min`;
  return m === 0 ? `${h}\u00a0h` : `${h}\u00a0h\u00a0${m}\u00a0min`;
}

const money = (n: number) => (n < 1 ? `${Math.round(n * 100)}p` : `£${n.toFixed(2)}`);

/** A small label with the answer large beneath it, both on the card's left edge. */
function BigFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12.5px] font-bold text-ink-3">{label}</p>
      <p className="num-tabular mt-0.5 text-[34px] font-extrabold leading-none text-heat-ink">{value}</p>
    </div>
  );
}

/** now → switch on → ready, drawn to scale. */
function Timeline({ now, on, ready }: { now: Date; on: Date; ready: Date }) {
  const W = 300;
  const L = 12;
  const R = 12;
  const start = Math.min(now.getTime(), on.getTime());
  const span = Math.max(1, ready.getTime() - start);
  const x = (t: number) => L + Math.min(1, Math.max(0, (t - start) / span)) * (W - L - R);
  const onX = x(on.getTime());
  return (
    <svg
      viewBox={`0 0 ${W} 54`}
      className="mt-2.5 block h-auto w-full"
      role="img"
      aria-label={`Now ${clock(now)}, switch on ${clock(on)}, ready ${clock(ready)}`}
    >
      <rect className="fill-track" x={L} y={22} width={W - L - R} height={6} rx={3} />
      <rect className="fill-heat" x={onX} y={22} width={Math.max(2, x(ready.getTime()) - onX)} height={6} rx={3} />
      <circle className="fill-ink-3 stroke-surface" strokeWidth={2} cx={x(now.getTime())} cy={25} r={6} />
      <circle className="fill-heat stroke-surface" strokeWidth={2} cx={onX} cy={25} r={7} />
      <circle className="fill-good stroke-surface" strokeWidth={2} cx={x(ready.getTime())} cy={25} r={7} />
      <text className="fill-ink text-[12px] font-extrabold" x={onX} y={12} textAnchor={onX < 60 ? "start" : onX > W - 60 ? "end" : "middle"}>
        On {clock(on)}
      </text>
      <text className="fill-ink-3 text-[11px] font-semibold" x={L} y={48}>
        Now {clock(now)}
      </text>
      <text className="fill-ink-3 text-[11px] font-semibold" x={W - R} y={48} textAnchor="end">
        Ready {clock(ready)}
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
  /** Heat loss of this tub (W/K) — measured, saved or estimated. Without it
   *  the plan assumes a bare, uninsulated tub and says switch on far too early. */
  uaWPerK: number;
  pricePerKwh: number;
  defaultReadyAtIso: string;
  nowIso: string;
  patternNote: string | null;
  /** The saved schedule, when there is one. */
  schedule: HeatingSchedule | null;
  keepWarm?: KeepWarmComparison | null;
}

export default function HeatingPlanCard({
  currentC,
  targetC,
  ambientC,
  watts,
  measured,
  samples,
  volumeLitres,
  uaWPerK,
  pricePerKwh,
  defaultReadyAtIso,
  nowIso,
  patternNote,
  schedule,
  keepWarm,
}: HeatingPlanCardProps) {
  const toast = useToast();
  const [heaterOn, setHeaterOn] = useHeaterOn();
  // Seed from the saved schedule so a freshly loaded, unedited one never
  // looks changed.
  // Without a saved schedule the default time is filled in on the phone, so
  // it's in the phone's timezone rather than the server's.
  const [readyTime, setReadyTime] = useState(() => schedule?.time ?? "");
  const [target, setTarget] = useState(targetC);
  const [saved, setSaved] = useState<HeatingSchedule | null>(schedule);
  const [days, setDays] = useState<number[]>(() => schedule?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date(nowIso));
  // Clock times are only drawn once this is running on the phone: the server
  // runs on UTC, and a time drawn there would be an hour out in summer.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setNow(new Date());
    setReadyTime((t) => t || toTimeInput(new Date(defaultReadyAtIso)));
    setMounted(true);
  }, [defaultReadyAtIso]);

  const readyAt = useMemo(() => {
    if (saved) {
      const next = nextScheduledSoak({ ...saved, time: readyTime }, now);
      if (next) return next;
    }
    return nextOccurrenceOf(readyTime, now) ?? new Date(defaultReadyAtIso);
  }, [saved, readyTime, now, defaultReadyAtIso]);

  const sortedDays = [...days].sort((a, b) => a - b);
  const dirty =
    saved === null || saved.time !== readyTime || saved.weekdays.join() !== sortedDays.join();

  async function saveSchedule(next: HeatingSchedule | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/heating-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      if (res.ok) {
        setSaved(next);
        toast(next ? "Heating schedule saved" : "Schedule cleared");
      } else {
        toast("That didn't save. Try again in a moment.");
      }
    } catch {
      toast("That didn't save. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  // A standing preference that the morning reminder also uses, so it saves
  // straight away.
  async function saveTarget(next: number) {
    const clamped = Math.min(TEMP_MAX_C, Math.max(TEMP_MIN_C, next));
    setTarget(clamped);
    try {
      await fetch("/api/soak-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempTarget: clamped }),
      });
    } catch {
      // The figure on screen is still right for this visit.
    }
  }

  const plan = useMemo(
    () =>
      heatingPlan({ currentC, targetC: target, readyAt, ambientC, watts, volumeLitres, uaWPerK, pricePerKwh, now }),
    [currentC, target, readyAt, ambientC, watts, volumeLitres, uaWPerK, pricePerKwh, now],
  );
  const hoursAvailable = Math.max(0, (readyAt.getTime() - now.getTime()) / HOUR_MS);

  const ready = mounted ? dayWord(readyAt, now) : "";
  const fmtTemp = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

  return (
    <>
      <Section title="Your soak">
        <Card flush>
          <FieldRow name="Ready by" hint={ready ? ready.charAt(0).toUpperCase() + ready.slice(1) : "\u00a0"}>
            <TimeStepper id="ready-by" label="Ready-by time" value={readyTime} onChange={setReadyTime} />
          </FieldRow>
          <FieldRow name="Temperature" hint={`Tub's max is ${TEMP_MAX_C}°`}>
            <Stepper
              id="soak-temp"
              label="soak temperature"
              value={target}
              onChange={(v) => v !== null && saveTarget(v)}
              step={0.5}
              min={TEMP_MIN_C}
              max={TEMP_MAX_C}
              decimals={1}
              format={fmtTemp}
              unit="°C"
            />
          </FieldRow>

          <div className="grid grid-cols-7 gap-1.5 border-t border-line px-3.5 py-3" role="group" aria-label="Soak days">
            {DAY_LABELS.map((label, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => setDays((d) => (on ? d.filter((x) => x !== i) : [...d, i]))}
                  className="min-h-11 rounded-ctl border border-line bg-surface text-sm font-extrabold text-ink-2 aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Status on the left, its one action on the right: never wraps under. */}
          <div className="grid min-h-[56px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-3.5 py-2.5">
            {!dirty && saved ? (
              <>
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-good-ink">
                  <Icon name="check-circle" size={16} className="shrink-0" />
                  <span className="min-w-0">
                    Saved · {describeDays(saved.weekdays)}, {saved.time}
                  </span>
                </span>
                <Button size="sm" variant="text" className="-mr-3" disabled={saving} onClick={() => saveSchedule(null)}>
                  Forget it
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 text-[13.5px] leading-snug text-ink-2">
                  {saved ? "Changed, not saved yet." : patternNote ?? "Save it and the morning reminder follows it."}
                </span>
                <Button
                  size="sm"
                  disabled={saving || days.length === 0 || !readyTime}
                  onClick={() => saveSchedule({ enabled: true, weekdays: sortedDays, time: readyTime })}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>
        </Card>
      </Section>

      <Section title="Today's heat-up">
        <Card>
          {!mounted ? (
            <p className="text-sm text-ink-2">Working out the timing…</p>
          ) : currentC === null || !plan ? (
            <p className="text-sm text-ink-2">
              This needs the water temperature from your probe.
            </p>
          ) : plan.alreadyWarmEnough ? (
            <>
              <p className="font-bold">Already warm enough</p>
              <p className="mt-1 text-[13.5px] text-ink-2">
                The water is {currentC}°. Nothing to do but get in.
              </p>
            </>
          ) : plan.unreachable ? (
            <Callout tone="bad" icon="alert-triangle">
              At {Math.round(ambientC)}° outside, the heater can&apos;t get it to {target}°.
              Keep the cover on and aim a little lower.
            </Callout>
          ) : heaterOn ? (
            <>
              <BigFigure label="Heater" value="On" />
              <p className="mt-2 text-[13.5px] text-ink-2">
                Ready {dayWord(readyAt, now)} at {clock(readyAt)}, {target}°.
              </p>
              <Button variant="quiet" block className="mt-3" onClick={() => setHeaterOn(false)}>
                It&apos;s not on yet
              </Button>
            </>
          ) : plan.tooLate ? (
            <>
              <BigFigure label="Switch on" value="Now" />
              <p className="mt-2 text-[13.5px] text-ink-2">
                You&apos;d reach about{" "}
                <b>{reachableByC(currentC, hoursAvailable, ambientC, watts, volumeLitres, uaWPerK)}°</b>{" "}
                by {clock(readyAt)}. {target}° needs {duration(plan.hours - BUFFER_MINUTES / 60)} from {currentC}°.
              </p>
              <Button block className="mt-3" onClick={() => { setHeaterOn(true); toast("Heater on"); }}>
                It&apos;s on
              </Button>
            </>
          ) : plan.switchOnAt ? (
            <>
              <BigFigure
                label={`Switch on ${dayWord(plan.switchOnAt, now) === "today" ? "at" : `${dayWord(plan.switchOnAt, now)} at`}`}
                value={clock(plan.switchOnAt)}
              />
              <Timeline now={now} on={plan.switchOnAt} ready={readyAt} />
              <p className="mt-2 text-[13.5px] text-ink-2">
                {currentC}° to {target}° takes {duration(plan.hours - BUFFER_MINUTES / 60)}, plus half an
                hour to spare. About {plan.kwh} kWh ({money(plan.cost)}).
              </p>
              <Button block className="mt-3" onClick={() => { setHeaterOn(true); toast("Heater on"); }}>
                It&apos;s on
              </Button>
            </>
          ) : null}

          {currentC !== null && plan && !plan.alreadyWarmEnough ? (
            <p className="mt-3 text-[13.5px] text-ink-2">
              {measured
                ? `Timed from ${samples} real heat-ups on your tub.`
                : "Uses a typical 2 kW heater until the probe times a real heat-up."}{" "}
              {keepWarm ? (
                <WhyButton title="Leave it on instead?" label="Leave it on instead?">
                  <p>
                    Letting the water cool between soaks saves about{" "}
                    {money(keepWarm.savingWeekly)} a week. It only drops to about{" "}
                    {keepWarm.coolsToC}° in between, because your covers hold the heat
                    so well.
                  </p>
                  <p>
                    Leaving the heater on costs that bit more, and the tub is always
                    ready. Switching it off means switching on about{" "}
                    {duration(keepWarm.reheatHours)} before each soak.
                  </p>
                </WhyButton>
              ) : null}
            </p>
          ) : null}
        </Card>
      </Section>
    </>
  );
}
