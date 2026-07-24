"use client";

import { useState } from "react";
import type { CalculationResult, Severity } from "@/lib/chemistry";
import { Badge, Button } from "./ui";

const severityStyles: Record<Severity, { border: string; tone: Parameters<typeof Badge>[0]["tone"]; label: string }> = {
  safety: { border: "border-red-300 bg-red-50", tone: "red", label: "Safety" },
  high: { border: "border-red-200 bg-red-50", tone: "red", label: "Important" },
  medium: { border: "border-amber-200 bg-amber-50", tone: "amber", label: "Adjust" },
  low: { border: "border-brand-200 bg-brand-50", tone: "blue", label: "Minor" },
  info: { border: "border-slate-200 bg-slate-50", tone: "slate", label: "Info" },
};

export default function RecommendationList({
  result,
  readingId,
}: {
  result: CalculationResult;
  readingId?: number | null;
}) {
  return (
    <div className="space-y-3">
      {result.safetyFlags.length > 0 ? (
        <div className="rounded-2xl border-2 border-red-400 bg-red-100 p-4">
          <div className="mb-1 flex items-center gap-2 font-bold text-red-800">
            ⚠️ Do not use the spa yet
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
            {result.safetyFlags.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm font-medium text-slate-600">{result.summary}</p>

      {result.recommendations.map((rec, idx) => {
        const style = severityStyles[rec.severity];
        return (
          <div
            key={`${rec.chemical ?? "info"}-${idx}`}
            className={`rounded-2xl border p-4 ${style.border}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">{rec.label}</h3>
              <Badge tone={style.tone}>{style.label}</Badge>
            </div>
            {rec.amountGrams !== null ? (
              <p className="mb-1 text-2xl font-bold text-slate-900">
                {rec.amountGrams} g
              </p>
            ) : null}
            <p className="text-sm text-slate-600">{rec.instructions}</p>
            {rec.chemical && rec.amountGrams !== null ? (
              <LogAddedButton
                chemical={rec.chemical}
                amountGrams={rec.amountGrams}
                readingId={readingId ?? null}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Records into dosing_log what the user actually added. Pre-filled from the
// recommendation but the amount is editable (they may dose differently).
function LogAddedButton({
  chemical,
  amountGrams,
  readingId,
}: {
  chemical: string;
  amountGrams: number;
  readingId: number | null;
}) {
  const [state, setState] = useState<"idle" | "editing" | "saving" | "done">(
    "idle",
  );
  const [amount, setAmount] = useState(String(amountGrams));

  async function save() {
    setState("saving");
    const res = await fetch("/api/dosing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chemical,
        amountGrams: Number(amount),
        readingId,
      }),
    });
    setState(res.ok ? "done" : "editing");
  }

  if (state === "done") {
    return (
      <p className="mt-2 text-sm font-medium text-emerald-700">✓ Logged</p>
    );
  }

  if (state === "idle") {
    return (
      <Button
        variant="secondary"
        className="mt-2"
        onClick={() => setState("editing")}
      >
        Log this as added
      </Button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <span className="text-sm text-slate-500">g</span>
      <Button onClick={save} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
