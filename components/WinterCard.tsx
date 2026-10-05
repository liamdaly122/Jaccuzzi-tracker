// =============================================================================
//  components/WinterCard.tsx
//  The winter plan, on the Care tab. Absent for most of the year; appears for
//  the lead-in to the shutdown date with the three options and what each
//  costs; then shows whichever plan was chosen.
// =============================================================================

import { format } from "date-fns";
import WinterButton from "./WinterButton";
import { Callout, Card, Chip, LinkButton, Meter, Section } from "./ui";
import {
  STRATEGIES,
  type HibernationState,
  type WinterCostComparison,
  type WinterCountdown,
  type WinterWindow,
} from "@/lib/winter";

const money = (n: number) => `£${n.toFixed(n < 10 ? 2 : 0)}`;

const SHORT: Record<string, string> = {
  pack_down: "Drain, dry, deflate and store it somewhere above 6°.",
  freeze_shield: "Freeze Shield keeps it above freezing, and you can still use it.",
  drained_in_place: "Nothing to store, but cold makes the vinyl brittle.",
};

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
  if (hibernation.hibernating) {
    return (
      <Section title="Winter">
        <Card>
          <p className="text-[30px] font-extrabold leading-none tracking-tight">Hibernating</p>
          <p className="mt-2 text-[13.5px] text-ink-2">
            {hibernation.since ? `Put away on ${format(hibernation.since, "d MMMM")}. ` : ""}
            Reminders are paused.
            {hibernation.reopen ? ` Get it back out around ${format(hibernation.reopen, "d MMMM")}.` : ""}
          </p>
          {hibernation.stillOutdoors ? (
            <Callout tone="warn" icon="snowflake" className="mt-2.5">
              It&apos;s still outside, so frost warnings carry on.
            </Callout>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
            <WinterButton action="wake" label="Wake it up" variant="primary" />
            <LinkButton href="/guides/spring-wake-up" variant="text" size="sm">
              Spring wake-up guide
            </LinkButton>
          </div>
        </Card>
      </Section>
    );
  }

  if (hibernation.keepingItRunning) {
    return (
      <Section title="Winter">
        <Card>
          <p className="text-lg font-extrabold">Keeping it running this winter</p>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            Freeze Shield keeps the water above freezing, so your reminders and the
            daily check carry on as normal.
          </p>
          <Callout tone="warn" icon="alert-triangle" className="mt-2.5">
            Keep it plugged in with the filter running. A tripped socket in a cold
            snap is how pumps crack.
          </Callout>
          <div className="mt-3">
            <WinterButton
              action="wake"
              label="Change plan"
              confirm="This clears your winter plan so you can pick again."
            />
          </div>
        </Card>
      </Section>
    );
  }

  if (!window || !countdown || countdown.status === "not_yet") return null;

  const overdue = countdown.status === "overdue";
  const urgent = overdue || countdown.status === "due_soon";

  return (
    <Section title="Winter plan" aside={`Decide by ${format(window.deadline, "EEE d MMM")}`}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-[30px] font-extrabold leading-none tracking-tight">
            {overdue ? "Overdue" : countdown.daysUntil}
            {overdue ? null : (
              <small className="ml-1.5 text-[15px] font-semibold tracking-normal text-ink-3">
                {countdown.daysUntil === 1 ? "day left" : "days left"}
              </small>
            )}
          </span>
          <Chip tone={urgent ? "bad" : "warn"}>Not decided</Chip>
        </div>
        <Meter className="mt-2.5" value={countdown.fractionRemaining} tone={urgent ? "bad" : "warn"} />
        {countdown.decidedBy === "forecast" ? (
          <Callout tone="bad" icon="snowflake" className="mt-2.5">
            Frost is forecast (down to {countdown.forecastLowC}°). Worth sorting this week.
          </Callout>
        ) : overdue ? (
          <Callout tone="bad" icon="alert-triangle" className="mt-2.5">
            Don&apos;t leave it full with the power off. That&apos;s how pumps crack.
          </Callout>
        ) : null}

        <div className="mt-3 grid gap-2">
          {STRATEGIES.map((s) => {
            const cost = costs
              ? s.key === "freeze_shield"
                ? `${money(costs.freezeShield.low)}–${money(costs.freezeShield.high)} for the winter`
                : `${money(costs.shutdown)} to refill in spring`
              : null;
            return (
              <div key={s.key} className="grid gap-1.5 rounded-ctl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold">{s.title}</span>
                  {s.recommended ? <Chip tone="accent">Recommended</Chip> : null}
                </div>
                <p className="text-[13.5px] text-ink-2">{SHORT[s.key] ?? s.summary}</p>
                {/* The cost gives way before the button does; only the confirm
                    panel (full width) drops to its own line. */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {cost ? <span className="num-tabular min-w-0 flex-1 font-extrabold">{cost}</span> : <span className="flex-1" />}
                  <WinterButton
                    action="hibernate"
                    strategy={s.key}
                    label="Choose"
                    confirm={
                      s.key === "freeze_shield"
                        ? "Your reminders and the daily check carry on, because the water still needs looking after."
                        : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <LinkButton href="/guides/winterise" variant="text" size="sm">
            Step-by-step: winterise &amp; pack away
          </LinkButton>
        </div>
      </Card>
    </Section>
  );
}
