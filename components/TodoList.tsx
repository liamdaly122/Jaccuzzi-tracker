"use client";

// =============================================================================
//  components/TodoList.tsx
//  Today's list. Each line has a tick, a title, one short sub-line and a chip
//  for when or how urgent. Ticking a job saves it (with Undo); ticking a dose
//  asks how much went in; the heater line is worked out here because its clock
//  times must be in the phone's timezone.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import LogSheet from "./LogSheet";
import WhyButton from "./WhyButton";
import { Chip, LinkButton } from "./ui";
import { useCompleteJob } from "./useCompleteJob";
import { useHeaterOn } from "./useHeaterOn";
import { heaterTodo, withHeater, type LaterItem, type TodoItem } from "@/lib/todo";
import {
  heatingPlan,
  nextOccurrenceOf,
  nextScheduledSoak,
  type HeatingSchedule,
} from "@/lib/heating";

export interface HeaterInputs {
  currentC: number;
  targetC: number;
  ambientC: number;
  watts: number;
  volumeLitres: number;
  uaWPerK: number;
  schedule: HeatingSchedule | null;
  defaultReadyAtIso: string;
}

function Tick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={`${done ? "Undo" : "Mark done"}: ${label}`}
      className="-my-2 -ml-2 -mr-1.5 grid h-11 w-11 shrink-0 place-items-center"
    >
      <span
        className={`grid h-7 w-7 place-items-center rounded-full border-2 transition-colors ${
          done ? "border-accent bg-accent text-on-accent" : "border-ink-3 text-transparent"
        }`}
      >
        <Icon name="check" size={16} strokeWidth={3} />
      </span>
    </button>
  );
}

export default function TodoList({
  items,
  later,
  heater,
}: {
  items: TodoItem[];
  later: LaterItem[];
  heater: HeaterInputs | null;
}) {
  const complete = useCompleteJob();
  const [heaterOn, setHeaterOn] = useHeaterOn();
  // Clock times must be the phone's, so the heater line waits for it.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  // Ticked here; the refreshed list then drops them. Undo clears them.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [laterOpen, setLaterOpen] = useState(false);
  const [dose, setDose] = useState<{ chemical: string; grams: number | null } | null>(null);

  const heaterItem = useMemo(() => {
    if (!heater || !now) return null;
    const readyAt =
      (heater.schedule ? nextScheduledSoak(heater.schedule, now) : null) ??
      nextOccurrenceOf(new Date(heater.defaultReadyAtIso).toTimeString().slice(0, 5), now) ??
      new Date(heater.defaultReadyAtIso);
    const plan = heatingPlan({
      currentC: heater.currentC,
      targetC: heater.targetC,
      readyAt,
      ambientC: heater.ambientC,
      watts: heater.watts,
      volumeLitres: heater.volumeLitres,
      uaWPerK: heater.uaWPerK,
      now,
    });
    if (!plan) return null;
    return heaterTodo({
      switchOnAt: plan.switchOnAt,
      readyAt,
      targetC: heater.targetC,
      alreadyWarm: plan.alreadyWarmEnough,
      unreachable: plan.unreachable,
      tooLate: plan.tooLate,
      now,
    });
  }, [heater, now]);

  const list = withHeater(items, heaterItem);
  const isDone = (it: TodoItem) => (it.action.kind === "heater" ? heaterOn : ticked.has(it.id));
  const left = list.filter((it) => it.action.kind !== "info" && !isDone(it)).length;

  const setTick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function tickTask(id: string, taskId: number, name: string) {
    if (ticked.has(id)) return;
    setTick(id, true);
    const ok = await complete(taskId, name, { onUndone: () => setTick(id, false) });
    if (!ok) setTick(id, false);
  }

  const row = (it: TodoItem) => {
    const done = isDone(it);
    const sub = !done ? it.sub : it.action.kind === "heater" ? "On. Enjoy your soak." : "Done";
    let lead: React.ReactNode;
    if (it.action.kind === "task" || it.action.kind === "test") {
      const a = it.action;
      lead = <Tick done={done} label={it.title} onClick={() => tickTask(it.id, a.taskId, a.name)} />;
    } else if (it.action.kind === "dose") {
      const a = it.action;
      lead = <Tick done={false} label={it.title} onClick={() => setDose({ chemical: a.chemical, grams: a.grams })} />;
    } else if (it.action.kind === "heater") {
      lead = <Tick done={heaterOn} label={it.title} onClick={() => setHeaterOn(!heaterOn)} />;
    } else {
      lead = (
        <span className="grid h-7 w-7 shrink-0 place-items-center text-ink-3">
          <Icon name={it.icon} size={20} />
        </span>
      );
    }
    let right: React.ReactNode = it.chip && !done ? <Chip tone={it.chip.tone}>{it.chip.label}</Chip> : null;
    if (!done && it.action.kind === "test") {
      right = (
        <LinkButton href="/readings/new" variant="quiet" size="sm">
          Log test
        </LinkButton>
      );
    }
    if (!done && it.action.kind === "link") {
      right = (
        <LinkButton href={it.action.href} variant="line" size="sm">
          {it.action.label}
        </LinkButton>
      );
    }
    return (
      <div key={it.id} className="flex min-h-[62px] items-center gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
        {lead}
        <div className="min-w-0 flex-1">
          <p className={`text-[15.5px] font-bold leading-snug ${done ? "text-ink-3 line-through decoration-[1.5px]" : ""}`}>
            {it.title}
          </p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
            {sub}
            {it.why && !done ? (
              <>
                {" · "}
                <WhyButton title={it.why.title}>
                  {it.why.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </WhyButton>
              </>
            ) : null}
            {it.action.kind === "heater" && !done ? (
              <>
                {" · "}
                <Link href="/heat" className="-my-2.5 py-2.5 font-bold text-accent-ink underline decoration-[1.5px] underline-offset-[3px]">
                  Plan
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {right}
      </div>
    );
  };

  return (
    <section className="grid min-w-0 gap-2.5">
      <div className="flex min-h-7 items-center justify-between gap-2 px-0.5">
        <h2 className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-ink-3">To do</h2>
        <span className="text-[13.5px] font-semibold text-ink-3">{left ? `${left} left` : "All done"}</span>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {list.length === 0 ? (
          <div className="flex items-center gap-3 px-3.5 py-4">
            <Icon name="check-seal" size={28} className="shrink-0 text-good-ink" />
            <div className="min-w-0">
              <p className="font-bold">All done for now</p>
              <p className="text-[13.5px] text-ink-2">
                {later[0] ? `Next up: ${later[0].title.toLowerCase()}, ${later[0].when}.` : "Nothing else is due this month."}
              </p>
            </div>
          </div>
        ) : (
          list.map(row)
        )}
        {later.length ? (
          <>
            <button
              type="button"
              aria-expanded={laterOpen}
              onClick={() => setLaterOpen((v) => !v)}
              className="flex min-h-[52px] w-full items-center gap-2.5 border-t border-line px-3.5 py-3.5 text-left font-bold text-accent-ink"
            >
              <Icon name="chevron" size={16} className={`transition-transform ${laterOpen ? "" : "-rotate-90"}`} />
              {laterOpen ? "Hide the rest of the month" : `${later.length} more this month`}
            </button>
            {laterOpen
              ? later.map((l) => (
                  <div key={l.id} className="flex min-h-[56px] items-center gap-3 border-t border-line px-3.5 py-2.5">
                    {l.taskId ? (
                      <Tick done={ticked.has(l.id)} label={l.title} onClick={() => tickTask(l.id, l.taskId!, l.title)} />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-ink-3">
                        <Icon name={l.icon} size={18} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{l.title}</p>
                      <p className="text-[13.5px] text-ink-2">{l.when}</p>
                    </div>
                    {l.href ? (
                      <LinkButton href={l.href} variant="line" size="sm">
                        Look
                      </LinkButton>
                    ) : null}
                  </div>
                ))
              : null}
          </>
        ) : null}
      </div>
      <LogSheet open={dose !== null} initial="chem" chemical={dose?.chemical} grams={dose?.grams} onClose={() => setDose(null)} />
    </section>
  );
}
