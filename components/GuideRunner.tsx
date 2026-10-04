"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Guide } from "@/lib/guides";
import { Button, Callout, Card, Meter, Row } from "./ui";
import Icon from "./Icon";
import Tick from "./Tick";
import { useToast } from "./Toaster";
import type { IconName } from "@/lib/icons";

// Interactive checklist for a guide: tick steps off, watch the progress bar,
// and (for guides that map to a maintenance task) finish by marking it done.
export default function GuideRunner({
  guide,
  completesTaskId,
}: {
  guide: Guide;
  completesTaskId: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // Progress is kept in the browser, not the database: some of these jobs run
  // over a weekend (winterising alone needs a day or two just for drying), and
  // losing your ticks because you closed the app makes the checklist useless.
  const storageKey = `guide-progress:${guide.key}`;
  const [checked, setChecked] = useState<boolean[]>(
    () => guide.steps.map(() => false),
  );
  const [restored, setRestored] = useState(false);

  // Read on mount rather than in the initialiser, so the server and the first
  // client render agree and React doesn't complain about a hydration mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === guide.steps.length) {
          setChecked(parsed.map(Boolean));
        }
      }
    } catch {
      // A blocked or corrupt localStorage just means starting fresh.
    }
    setRestored(true);
  }, [storageKey, guide.steps.length]);

  useEffect(() => {
    if (!restored) return; // don't overwrite saved progress with the blank slate
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(checked));
    } catch {
      // Nothing to do — the checklist still works for this session.
    }
  }, [checked, restored, storageKey]);

  function clearProgress() {
    setChecked(guide.steps.map(() => false));
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore.
    }
  }
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);

  const doneCount = checked.filter(Boolean).length;
  const allDone = doneCount === guide.steps.length;
  const pct = Math.round((doneCount / guide.steps.length) * 100);

  function toggle(i: number) {
    setChecked((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }

  async function markTaskDone() {
    if (!completesTaskId) return;
    setFinishing(true);
    const res = await fetch(`/api/tasks/${completesTaskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: `Completed via "${guide.title}" guide` }),
    }).catch(() => null);
    setFinishing(false);
    if (res?.ok) {
      setFinished(true);
      router.refresh();
    } else {
      toast("That didn't save. Check your connection and try again.");
    }
  }

  const next = NEXT[guide.key];

  return (
    <div className="grid gap-[18px]">
      <p className="text-[15px] leading-relaxed text-ink-2">{guide.intro}</p>

      <div>
        <div className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-ink-3">
          <span>
            <span className="tabular-nums font-extrabold text-ink">{doneCount}</span> of {guide.steps.length} done
          </span>
          {doneCount > 0 ? (
            <button type="button" onClick={clearProgress} className="-my-2 py-2 font-bold text-accent-ink">
              Start again
            </button>
          ) : (
            <span>Saved as you go</span>
          )}
        </div>
        <Meter className="mt-1.5" value={pct / 100} tone={allDone ? "good" : "accent"} />
      </div>

      <Card flush>
        <ol>
          {guide.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
              <Tick done={checked[i]} label={`Step ${i + 1}: ${step.title}`} onClick={() => toggle(i)} className="-mt-1.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-ink-3">Step {i + 1}</p>
                <p className={`font-bold leading-snug ${checked[i] ? "text-ink-3 line-through decoration-[1.5px]" : ""}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{step.detail}</p>
                {step.tip ? (
                  <p className="mt-1.5 flex gap-1.5 text-[13.5px] font-semibold leading-snug text-accent-ink">
                    <Icon name="bulb" size={16} className="mt-px shrink-0" />
                    <span>{step.tip}</span>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {completesTaskId ? (
        finished ? (
          <>
            <Callout tone="good" icon="check-circle">
              Done and logged. Your schedule and the water&apos;s age have reset.
            </Callout>
            {next ? <NextStep {...next} /> : null}
          </>
        ) : (
          <Button size="lg" block variant={allDone ? "primary" : "line"} onClick={markTaskDone} disabled={finishing}>
            {finishing ? "Saving…" : "Finish and mark done"}
          </Button>
        )
      ) : next ? (
        <NextStep {...next} />
      ) : null}
    </div>
  );
}

// Where each guide leads once it's done.
const NEXT: Record<string, { href: string; icon: IconName; title: string; sub: string }> = {
  "drain-and-refill-day": {
    href: "/setup",
    icon: "shower",
    title: "Now set up the new water",
    sub: "Fresh water isn't safe until it's balanced. Step by step from here.",
  },
  winterise: {
    href: "/care",
    icon: "snowflake",
    title: "Go to winter plan",
    sub: "Tell the app it's packed away, so the reminders pause.",
  },
  "spring-wake-up": {
    href: "/setup",
    icon: "shower",
    title: "Set up the new water",
    sub: "Balance the fresh fill before anyone gets in.",
  },
};

function NextStep({ href, icon, title, sub }: { href: string; icon: IconName; title: string; sub: string }) {
  return (
    <Card tone="accent" flush>
      <Row href={href} icon={icon} title={title} sub={sub} />
    </Card>
  );
}
