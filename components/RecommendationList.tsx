"use client";

import { useState } from "react";
import type { CalculationResult, Severity } from "@/lib/chemistry";
import type { LsiSnapshot } from "@/lib/balance";
import { Badge, Button } from "./ui";
import Icon from "./Icon";

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
  balance,
}: {
  result: CalculationResult;
  readingId?: number | null;
  balance?: LsiSnapshot | null;
}) {
  return (
    <div className="space-y-3">
      {result.safetyFlags.length > 0 ? (
        <div className="rounded-2xl border-2 border-red-400 bg-red-100 p-4">
          <div className="mb-1 flex items-center gap-2 font-bold text-red-800">
            <Icon name="alert-triangle" size={18} className="mr-1.5 inline align-[-3px]" />
            Do not use the spa yet
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

      <BalanceLine balance={balance ?? null} />
    </div>
  );
}

// The dose list treats each number on its own. This line is the only place that
// says whether the COMBINATION is safe for the heater — which is a different
// question, and can be "no" while every individual number reads fine.
function BalanceLine({ balance }: { balance: LsiSnapshot | null }) {
  if (!balance) return null;

  if (balance.lsi === null || balance.verdict === null) {
    // Only worth prompting when the test itself was fine and calcium is the
    // one gap — otherwise this is noise on top of a failed reading.
    if (balance.ph === null || balance.alkalinityPpm === null) return null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Icon name="thermometer" size={17} />
          Heater protection
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Add a <strong>calcium hardness</strong> number next time and I can also
          tell you whether these values <em>together</em> will scale up your
          heater — the one thing no single reading shows.
        </p>
      </div>
    );
  }

  const { verdict, lsi } = balance;
  const ok = verdict.band === "balanced";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        ok
          ? "border-emerald-200 bg-emerald-50"
          : verdict.severity === "high"
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3
          className={`flex items-center gap-2 font-semibold ${
            ok
              ? "text-emerald-900"
              : verdict.severity === "high"
                ? "text-red-800"
                : "text-amber-900"
          }`}
        >
          <Icon name={ok ? "check-circle" : "alert-triangle"} size={17} />
          {verdict.headline}
        </h3>
        <Badge tone={ok ? "green" : verdict.severity === "high" ? "red" : "amber"}>
          Heater
        </Badge>
      </div>
      <p className="text-sm text-slate-700">{verdict.detail}</p>
      {verdict.actions.length > 0 ? (
        <p className="mt-2 text-sm font-medium text-slate-800">
          {verdict.actions[0]}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        Saturation index {lsi > 0 ? "+" : ""}
        {lsi.toFixed(2)}, from pH, alkalinity, calcium{" "}
        {balance.calcium?.valuePpm} ppm and{" "}
        {balance.temperatureC.toFixed(balance.temperatureIsMeasured ? 1 : 0)} °C
        {balance.temperatureIsMeasured ? "" : " (assumed)"}.
      </p>
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
