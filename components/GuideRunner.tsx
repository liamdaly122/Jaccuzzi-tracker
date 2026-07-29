"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Guide } from "@/lib/guides";
import { Button, Card } from "./ui";

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
  const [checked, setChecked] = useState<boolean[]>(
    () => guide.steps.map(() => false),
  );
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
    });
    setFinishing(false);
    if (res.ok) {
      setFinished(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-600">{guide.intro}</p>
        {/* Progress bar */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {doneCount} of {guide.steps.length} done
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Card>

      <ol className="space-y-2">
        {guide.steps.map((step, i) => (
          <li key={i}>
            <button
              onClick={() => toggle(i)}
              className={`flex w-full gap-3 rounded-2xl border p-4 text-left transition ${
                checked[i]
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                  checked[i]
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span>
                <span
                  className={`block font-semibold ${
                    checked[i]
                      ? "text-emerald-800 line-through"
                      : "text-slate-800"
                  }`}
                >
                  {i + 1}. {step.title}
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  {step.detail}
                </span>
                {step.tip ? (
                  <span className="mt-1 block text-xs text-brand-700">
                    💡 {step.tip}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {completesTaskId ? (
        finished ? (
          <p className="text-center text-sm font-medium text-emerald-700">
            ✓ Done and logged — your schedule and water freshness have reset.
          </p>
        ) : (
          <Button
            onClick={markTaskDone}
            disabled={finishing}
            className={`w-full ${allDone ? "" : "opacity-70"}`}
          >
            {finishing ? "Saving…" : "Finish & mark done"}
          </Button>
        )
      ) : null}
    </div>
  );
}
