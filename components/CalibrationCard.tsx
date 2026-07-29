"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "./ui";

// The shape the /api/calibrate GET returns (kept local so this file stays
// client-safe and doesn't import the server-only data layer).
interface Suggestion {
  chemical: string;
  label: string;
  constantKey: string;
  currentValue: number;
  suggestedValue: number;
  observationCount: number;
  changePercent: number;
  message: string;
}

interface Props {
  suggestions: Suggestion[];
  observationCount: number;
}

export default function CalibrationCard({ suggestions, observationCount }: Props) {
  const router = useRouter();
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedKey, setAppliedKey] = useState<string | null>(null);

  async function apply(s: Suggestion) {
    setApplying(s.constantKey);
    setError(null);
    try {
      const res = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constantKey: s.constantKey,
          suggestedValue: s.suggestedValue,
        }),
      });
      if (res.ok) {
        setAppliedKey(s.constantKey);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't apply that — please try again.");
      }
    } catch {
      setError("Couldn't apply that — please try again.");
    } finally {
      setApplying(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-slate-800">
        🎯 Calibration — tuned to your tub
      </h2>

      {suggestions.length === 0 ? (
        <p className="text-sm text-slate-500">
          {observationCount > 0
            ? `I've learned from ${observationCount} dose${observationCount === 1 ? "" : "s"} so far — your tub matches the standard strengths, so there's nothing to change yet. Keep logging tests and doses and I'll keep watching.`
            : "Keep logging your test readings and the doses you add, and once I've seen a few clean before-and-after pairs I'll fine-tune the calculator to how your tub actually behaves."}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Based on your own readings, these strengths look different from the
            defaults. Applying one makes future dose suggestions more accurate
            for your tub.
          </p>
          <div className="space-y-3">
            {suggestions.map((s) => {
              const applied = appliedKey === s.constantKey;
              return (
                <div
                  key={s.constantKey}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-medium text-slate-800">{s.label}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {s.currentValue} →{" "}
                    <strong className="text-slate-800">{s.suggestedValue}</strong>{" "}
                    <span className="text-xs text-slate-400">
                      (from {s.observationCount} doses)
                    </span>
                  </p>
                  <div className="mt-2">
                    {applied ? (
                      <span className="text-sm font-semibold text-emerald-700">
                        ✓ Applied
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => apply(s)}
                        disabled={applying !== null}
                        className="text-xs"
                      >
                        {applying === s.constantKey ? "Applying…" : "Apply"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            This only changes the calculator&apos;s strength assumptions — always
            confirm against your product label and dose gradually.
          </p>
        </>
      )}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </Card>
  );
}
