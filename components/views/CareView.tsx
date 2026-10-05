// =============================================================================
//  Care — looking after the tub: every job with how much life it has left
//  (or the same as a calendar), the winter plan, the guides, and help when
//  something looks wrong.
// =============================================================================

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import CompleteButton from "@/components/CompleteButton";
import FrequencyEditor from "@/components/FrequencyEditor";
import CalendarView, { type CalendarTask, type SeasonalMarker } from "@/components/CalendarView";
import WinterCard from "@/components/WinterCard";
import Icon from "@/components/Icon";
import { Card, Chip, Meter, Row, Section } from "@/components/ui";
import type { TubState } from "@/lib/tubState";
import { dueChip, lifeTone, shortDay, taskTypeIcons } from "@/lib/display";
import { listSymptoms } from "@/lib/troubleshoot";

const SHORT_SYMPTOM: Record<string, string> = {
  cloudy: "Cloudy",
  foamy: "Foamy",
  green: "Green",
  smelly: "Smelly",
  itchy: "Itchy skin",
  eyes: "Stinging eyes",
  wont_hold_sanitizer: "Won't hold chlorine",
  scale: "Scale or flakes",
};

export default function CareView({ s, view }: { s: TubState; view: "jobs" | "calendar" }) {

  const calendarTasks: CalendarTask[] = s.tasks.map((t) => ({
    id: t.id,
    taskKey: t.task_key,
    name: t.name,
    taskType: t.task_type,
    frequencyDays: t.frequency_days,
    lastCompletedAt: t.last_completed_at,
  }));
  const seasonal: SeasonalMarker[] = s.window
    ? [
        { key: "winter-shutdown", name: "Winter plan deadline", date: s.window.deadline.toISOString() },
        { key: "spring-reopen", name: "Get the tub back out", date: s.window.reopen.toISOString() },
      ]
    : [];

  const tab = (v: "jobs" | "calendar", label: string) => (
    <Link
      href={v === "jobs" ? "/care" : "/care?view=calendar"}
      aria-current={view === v ? "page" : undefined}
      className={`grid min-h-[42px] place-items-center rounded-ctl text-sm font-bold ${
        view === v ? "bg-surface text-ink shadow-sm" : "text-ink-2"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Care" subtitle="Jobs, guides and help" />

      <nav className="grid grid-cols-2 gap-[3px] rounded-[15px] bg-surface-2 p-[3px]" aria-label="Show jobs as">
        {tab("jobs", "Jobs")}
        {tab("calendar", "Calendar")}
      </nav>

      {view === "jobs" ? (
        <Section title="Jobs" aside="Soonest first">
          <Card flush>
            {s.jobs.map(({ row, life }) => {
              const [when, tone] = dueChip(life.status, life.daysUntilDue, life.nextDueAt);
              return (
                <div key={row.id} className="grid gap-2.5 px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
                      <Icon name={taskTypeIcons[row.task_type]} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{row.name}</p>
                      <FrequencyEditor
                        taskId={row.id}
                        frequencyDays={row.frequency_days}
                        suffix={row.last_completed_at ? `Last done ${shortDay(new Date(row.last_completed_at))}` : "Not done yet"}
                      />
                    </div>
                    <CompleteButton taskId={row.id} name={row.name} />
                  </div>
                  {/* Indented to the text column, under the name rather than the icon. */}
                  <div className="flex items-center gap-2.5 pl-12">
                    <Meter className="flex-1" value={life.fractionRemaining} tone={lifeTone(life.status, life.fractionRemaining)} />
                    <Chip tone={tone}>{when}</Chip>
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      ) : (
        <CalendarView tasks={calendarTasks} seasonal={seasonal} />
      )}

      <WinterCard window={s.window} countdown={s.countdown} costs={s.winterCosts} hibernation={s.hibernation} />

      <Section title="Guides">
        <Card flush>
          <Row href="/setup" icon="shower" title="Fresh water setup" sub="After a refill, step by step" />
          <Row href="/guides/drain-and-refill-day" icon="drain" title="Drain & refill day" sub="8 steps" />
          <Row href="/guides/winterise" icon="snowflake" title="Winterise & pack away" sub="12 steps" />
          <Row href="/guides/spring-wake-up" icon="sun" title="Wake it up in spring" sub="6 steps" />
          <Row href="/guides" icon="flask" title="What each chemical does" sub="pH, alkalinity, chlorine and more" />
        </Card>
      </Section>

      <Section title="Something wrong?">
        <div className="flex flex-wrap gap-2">
          {listSymptoms().map((sym) => (
            <Link
              key={sym.key}
              href={`/troubleshoot/${sym.key}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold"
            >
              <Icon name={sym.icon} size={18} className="text-accent-ink" />
              {SHORT_SYMPTOM[sym.key] ?? sym.title}
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
