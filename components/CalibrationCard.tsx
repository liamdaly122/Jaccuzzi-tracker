"use client";

// Calibration: what the tub's own before-and-after tests say about how strong
// each product really is, with one tap to use the learned figure. Shown in a
// sheet from Settings.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Card } from "./ui";
import Icon from "./Icon";

// The shape the /api/calibrate GET returns (kept local so this file stays
// client-safe and doesn't import the server-only data layer).
export interface Suggestion {
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
  const [applied, setApplied] = useState<string[]>([]);

  async function apply(s: Suggestion) {
    setApplying(s.constantKey);
    setError(null);
    try {
      const res = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constantKey: s.constantKey, suggestedValue: s.suggestedValue }),
      });
      if (res.ok) {
        setApplied((a) => [...a, s.constantKey]);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That didn't apply. Try again in a moment.");
      }
    } catch {
      setError("That didn't apply. Check your connection and try again.");
    } finally {
      setApplying(null);
    }
  }

  if (suggestions.length === 0) {
    return (
      <p className="text-[14.5px] leading-relaxed text-ink-2">
        {observationCount > 0
          ? `Learned from ${observationCount} dose${observationCount === 1 ? "" : "s"} so far. Your tub matches the standard strengths, so there's nothing to change. Keep logging tests and doses and this keeps checking.`
          : "Log your tests and the doses you add. Once there are a few clean before-and-after pairs, the calculator tunes itself to how your tub actually behaves."}
      </p>
    );
  }

  return (
    <>
      <p className="text-[14.5px] leading-relaxed text-ink-2">
        Your own tests say these products work differently from the standard figures. Using the
        learned figure makes future doses fit your tub.
      </p>
      <Card flush>
        {suggestions.map((s) => {
          const done = applied.includes(s.constantKey);
          return (
            <div key={s.constantKey} className="flex min-h-[64px] items-center gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-snug">{s.label}</p>
                <p className="text-[13.5px] text-ink-2">
                  <span className="tabular-nums">
                    {s.currentValue} → <strong className="text-ink">{s.suggestedValue}</strong>
                  </span>{" "}
                  · from {s.observationCount} doses
                </p>
              </div>
              {done ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-good-ink">
                  <Icon name="check" size={16} strokeWidth={2.6} />
                  Using it
                </span>
              ) : (
                <Button size="sm" variant="line" onClick={() => apply(s)} disabled={applying !== null}>
                  {applying === s.constantKey ? "Applying…" : "Use it"}
                </Button>
              )}
            </div>
          );
        })}
      </Card>
      <p className="text-[13px] text-ink-3">
        This only changes the calculator&apos;s assumptions. Still check your product label and dose
        a little at a time.
      </p>
      {error ? (
        <Callout tone="bad" icon="alert-triangle">
          {error}
        </Callout>
      ) : null}
    </>
  );
}
