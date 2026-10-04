// =============================================================================
//  components/TodayView.tsx
//  What Today draws, given what Today worked out: three numbers about the
//  water, the ranked to-do list and the log buttons. Kept apart from the page
//  so it renders the same from sample data as from the real tub.
// =============================================================================

import Link from "next/link";
import { format } from "date-fns";
import PageHeader from "./PageHeader";
import TodoList, { type HeaterInputs } from "./TodoList";
import LogGrid from "./LogGrid";
import Icon from "./Icon";
import { Callout, Card, Row, Section, type Tone } from "./ui";
import type { LaterItem, TodoItem, WaterPill } from "@/lib/todo";
import type { SafetyFlag } from "@/lib/chemistry";
import { ukClock } from "@/lib/clock";

export interface TodayViewProps {
  date: string;
  safety: SafetyFlag[];
  /** Null before the first test or probe reading: shows the setup card instead. */
  pills: WaterPill[] | null;
  items: TodoItem[];
  later: LaterItem[];
  heater: HeaterInputs | null;
  lastCheckIso: string | null;
}

export default function TodayView(p: TodayViewProps) {
  return (
    <div className="grid gap-[18px]">
      <PageHeader title="Today" subtitle={p.date} settings />
      <SafetyBanner flags={p.safety} />
      {p.pills === null ? (
        <Card tone="accent" flush>
          <Row
            icon="shower"
            title="Start here: fresh water setup"
            sub="New tub or fresh fill? Step by step to safe, balanced water."
            href="/setup"
          />
        </Card>
      ) : p.pills.length ? (
        <section aria-label="Your water right now" className={`grid gap-2 ${COLS[p.pills.length]}`}>
          {p.pills.map((pill) => (
            <Pill key={pill.label} {...pill} />
          ))}
        </section>
      ) : null}
      <TodoList items={p.items} later={p.later} heater={p.heater} />
      <LogGrid />
      <p className="text-center text-[13px] text-ink-3">
        {p.lastCheckIso
          ? `Last daily check ${format(ukClock(p.lastCheckIso), "EEE d MMM, HH:mm")}`
          : "The daily check will show here once it has run."}
      </p>
    </div>
  );
}

// Can't be dismissed: it goes when the water is safe again.
function SafetyBanner({ flags }: { flags: SafetyFlag[] }) {
  if (flags.length === 0) return null;
  const danger = flags.some((f) => f.severity === "danger");
  return (
    <div
      role="alert"
      className={`rounded-card border-2 p-4 ${
        danger ? "border-bad bg-bad-soft text-bad-ink" : "border-warn bg-warn-soft text-warn-ink"
      }`}
    >
      <p className="flex items-center gap-2 text-[17px] font-extrabold">
        <Icon name="alert-triangle" size={22} />
        {danger ? "Don't get in yet" : "Take care"}
      </p>
      <ul className="mt-1.5 grid gap-1 pl-[30px] text-[14.5px] leading-snug">
        {flags.map((f) => (
          <li key={f.code}>{f.message}</li>
        ))}
      </ul>
    </div>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  heat: "bg-heat",
};

const COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"];

function Pill({ label, value, tone }: WaterPill) {
  return (
    <Link
      href="/water"
      className="grid min-h-[60px] min-w-0 content-center gap-0.5 rounded-[14px] border border-line bg-surface px-[11px] py-2.5"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
        {tone ? <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden /> : null}
        {label}
      </span>
      <span
        className={`whitespace-nowrap text-[19px] font-extrabold leading-tight tabular-nums ${
          tone === "warn" ? "text-warn-ink" : tone === "bad" ? "text-bad-ink" : ""
        }`}
      >
        {value}
      </span>
    </Link>
  );
}

// A deliberately quiet screen. The tub is away; there is nothing to do and
// nothing to worry about, and the app should look like it knows that.
export function HibernatingView({
  date,
  since,
  reopen,
  stillOutdoors,
}: {
  date: string;
  since: Date | null;
  reopen: Date | null;
  stillOutdoors: boolean;
}) {
  const fmt = (d: Date) => format(ukClock(d), "d MMMM");
  return (
    <div className="grid gap-[18px]">
      <PageHeader title="Today" subtitle={date} settings />
      <Card>
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-ink">
            <Icon name="moon" size={26} />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold">Put away for winter</p>
            <p className="text-[14.5px] text-ink-2">
              {since ? `Since ${fmt(since)}. ` : ""}Nothing to test, nothing due.
            </p>
          </div>
        </div>
        {reopen ? (
          <p className="mt-3 text-[14.5px] text-ink-2">
            Around <strong className="text-ink">{fmt(reopen)}</strong> is usually a good time to
            fill it again.
          </p>
        ) : null}
        {stillOutdoors ? (
          <Callout tone="accent" icon="snowflake" className="mt-3">
            It&apos;s still outside, so the daily check keeps an eye on the forecast and will warn
            you before a hard frost.
          </Callout>
        ) : null}
      </Card>
      <Section title="When you're ready">
        <Card flush>
          <Row icon="sun" title="Wake it up for the season" sub="On the Care tab" href="/care" />
          <Row icon="scroll" title="Guides" sub="Refilling, start-up and more" href="/guides" />
        </Card>
      </Section>
    </div>
  );
}
