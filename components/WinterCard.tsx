// =============================================================================
//  components/WinterCard.tsx
//  The Upkeep widget: how long until the spa should be shut down for winter,
//  what each of the three routes costs, and a way into the guide.
//
//  Deliberately absent for most of the year — it appears when the lead-in
//  starts, and turns into a calm "hibernating" panel once the tub is away.
//  The countdown bar reuses lifeBarHex so it reads as the same object as every
//  other life bar on this page.
// =============================================================================

import Link from "next/link";
import { Card } from "./ui";
import Icon from "./Icon";
import WinterButton from "./WinterButton";
import { lifeBarHex } from "@/lib/display";
import {
  STRATEGIES,
  type HibernationState,
  type WinterCostComparison,
  type WinterCountdown,
  type WinterWindow,
  strategy as strategyByKey,
} from "@/lib/winter";

const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

const money = (n: number) => `£${n.toFixed(n < 10 ? 2 : 0)}`;

export default function WinterCard({
  window,
  countdown,
  costs,
  hibernation,
}: {
  window: WinterWindow | null;
  countdown: WinterCountdown | null;
  costs: WinterCostComparison | null;
  hibernation: HibernationState;
}) {
  // --- Packed away: a calm panel, not a to-do list --------------------------
  if (hibernation.hibernating) {
    const chosen = hibernation.strategy
      ? strategyByKey(hibernation.strategy)
      : null;
    return (
      <Card className="border-brand-200 bg-gradient-to-br from-slate-50 to-white">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
          <Icon name="moon" size={18} className="text-brand-600" />
          Hibernating for winter
        </h2>
        <p className="text-sm text-slate-600">
          {chosen ? `${chosen.title}, ` : ""}
          {hibernation.since
            ? `shut down on ${fmt(hibernation.since)}. `
            : ""}
          Reminders are paused — I won&apos;t nag you to test water that
          isn&apos;t there.
        </p>
        {hibernation.reopen ? (
          <p className="mt-2 text-sm text-slate-600">
            Worth getting it back out around{" "}
            <strong>{fmt(hibernation.reopen)}</strong>.
          </p>
        ) : null}
        {hibernation.stillOutdoors ? (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
            <Icon name="snowflake" size={14} className="mt-0.5 shrink-0" />
            <span>
              The tub is still outside, so I&apos;m still watching the forecast
              and will warn you about a hard frost.
            </span>
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          <WinterButton action="wake" label="Wake it up" />
          <Link
            href="/guides/spring-wake-up"
            className="block text-center text-sm font-medium text-brand-600"
          >
            <Icon name="sun" size={15} className="mr-1.5 inline align-[-2px]" />
            Spring wake-up guide
          </Link>
        </div>
      </Card>
    );
  }

  // Out of season: say nothing at all.
  if (!window || !countdown || countdown.status === "not_yet") return null;

  const urgent = countdown.status === "overdue" || countdown.status === "due_soon";
  const barStatus =
    countdown.status === "overdue"
      ? ("overdue" as const)
      : countdown.status === "due_soon"
        ? ("due_soon" as const)
        : ("ok" as const);
  const pct = Math.round(countdown.fractionRemaining * 100);
  const color = lifeBarHex(barStatus, countdown.fractionRemaining);

  return (
    <Card className={urgent ? "border-amber-200" : undefined}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <Icon name="snowflake" size={18} className="text-brand-600" />
          Winter shutdown
        </h2>
        <span className="num-tabular text-sm font-medium text-slate-500">
          {countdown.daysUntil > 0
            ? `${countdown.daysUntil} days`
            : "Overdue"}
        </span>
      </div>

      {/* Countdown — same bar language as the task life bars above it. */}
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {countdown.status === "overdue" ? (
          <>
            Past the point where frost is a real risk here. Don&apos;t leave it
            full with the power off — that&apos;s how pumps crack.
          </>
        ) : countdown.decidedBy === "forecast" ? (
          <>
            <strong>Frost is forecast</strong> (down to about{" "}
            {countdown.forecastLowC}&nbsp;°C), which beats the calendar. Worth
            doing this week rather than waiting for{" "}
            {fmt(window.deadline)}.
          </>
        ) : (
          <>
            Aim to have it shut down by <strong>{fmt(window.deadline)}</strong>.
            A good weekend to start is any dry one after {fmt(window.opens)} —
            everything has to dry out, which is miserable in November rain.
          </>
        )}
      </p>

      {/* The money, which is the whole reason for doing this */}
      {costs ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Over roughly {costs.days} days shut down
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Leave it running</dt>
              <dd className="num-tabular font-semibold text-slate-800">
                {money(costs.freezeShield.low)}–{money(costs.freezeShield.high)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Shut it down</dt>
              <dd className="num-tabular font-semibold text-slate-800">
                {money(costs.shutdown)}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-xs text-slate-400">
            Shutting down costs one refill next spring and nothing in between.
            The running figure is a rough range — it swings with how cold the
            winter turns out and how well your cover fits.
          </p>
        </div>
      ) : null}

      {/* The three routes, each with its catch */}
      <div className="mt-3 space-y-2">
        {STRATEGIES.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border p-3 ${
              s.recommended
                ? "border-brand-200 bg-brand-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-800">{s.title}</p>
              {s.recommended ? (
                <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                  Recommended
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{s.summary}</p>
            <p className="mt-1 text-xs text-slate-500">
              <strong>The catch:</strong> {s.catch}
            </p>
            <div className="mt-2">
              <WinterButton
                action="hibernate"
                strategy={s.key}
                label={
                  s.key === "freeze_shield"
                    ? "I'm leaving it running"
                    : `Mark as ${s.title.toLowerCase()}`
                }
              />
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/guides/winterise"
        className="mt-3 flex items-center justify-between font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          <Icon name="clipboard" size={17} className="text-brand-600" />
          Step-by-step: winterise &amp; pack away
        </span>
        <span className="text-brand-600">→</span>
      </Link>
    </Card>
  );
}
