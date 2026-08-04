"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CalculationResult,
  SanitizerType,
  SanitizerUnit,
  TargetRanges,
} from "@/lib/chemistry";
import { Button, Card, Field, inputClass } from "./ui";
import RecommendationList from "./RecommendationList";
import ScanStripButton from "./ScanStripButton";

interface Props {
  sanitizerType: SanitizerType;
  targetRanges: TargetRanges;
  scanEnabled?: boolean;
  sanitizerUnit?: SanitizerUnit;
}

// A test-strip usually gives colour bands, so we present the ideal band next to
// each field to help the user read their strip.
export default function ReadingForm({
  sanitizerType,
  targetRanges,
  scanEnabled = false,
  sanitizerUnit = "ppm",
}: Props) {
  const orpMode = sanitizerUnit === "orp";
  const router = useRouter();
  const [ph, setPh] = useState("");
  const [ta, setTa] = useState("");
  const [sanitizer, setSanitizer] = useState("");
  const [calcium, setCalcium] = useState("");
  const [orp, setOrp] = useState("");
  const [isFreshFill, setIsFreshFill] = useState(false);
  const [notes, setNotes] = useState("");

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [readingId, setReadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const num = (s: string): number | null =>
    s.trim() === "" ? null : Number(s);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const phVal = num(ph);
    const taVal = num(ta);
    if (phVal === null || taVal === null) {
      setError("Please enter at least pH and Total Alkalinity.");
      return;
    }

    setLoading(true);
    const payload = {
      ph: phVal,
      totalAlkalinityPpm: taVal,
      freeChlorinePpm: sanitizerType === "chlorine" ? num(sanitizer) : null,
      brominePpm: sanitizerType === "bromine" ? num(sanitizer) : null,
      calciumHardnessPpm: num(calcium),
      orpMv: num(orp),
      isFreshFill,
      notes: notes.trim() || null,
    };

    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.calculation as CalculationResult);
        setReadingId(data.reading?.id ?? null);
        router.refresh(); // keep dashboard/history fresh
      } else {
        setError(data.error || "Could not save the reading.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setReadingId(null);
    setPh("");
    setTa("");
    setSanitizer("");
    setCalcium("");
    setOrp("");
    setIsFreshFill(false);
    setNotes("");
  }

  if (result) {
    return (
      <div className="space-y-4">
        <RecommendationList result={result} readingId={readingId} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset} className="flex-1">
            Log another reading
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
            className="flex-1"
          >
            Back to Today
          </Button>
        </div>
      </div>
    );
  }

  const sanitizerLabel =
    sanitizerType === "chlorine" ? "Free chlorine" : "Bromine";
  const sanitizerRange =
    sanitizerType === "chlorine"
      ? `${targetRanges.fcMin}–${targetRanges.fcMax} ppm`
      : `${targetRanges.brMin}–${targetRanges.brMax} ppm`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <p className="mb-4 text-sm text-slate-500">
          Dip your test strip, then type in what it reads. The app will work out
          exactly what to add.
        </p>

        {scanEnabled ? (
          <div className="mb-4">
            <ScanStripButton
              sanitizerType={sanitizerType}
              onValues={(v) => {
                const san =
                  sanitizerType === "chlorine"
                    ? v.freeChlorinePpm
                    : v.brominePpm;
                if (v.ph != null) setPh(String(v.ph));
                if (v.totalAlkalinityPpm != null)
                  setTa(String(v.totalAlkalinityPpm));
                if (san != null) setSanitizer(String(san));
                if (v.calciumHardnessPpm != null)
                  setCalcium(String(v.calciumHardnessPpm));
              }}
            />
            <p className="mt-2 text-center text-xs text-slate-400">
              or type the readings in below
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          <Field
            label="pH"
            hint={`Aim for ${targetRanges.phIdealMin}–${targetRanges.phIdealMax}`}
          >
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              className={inputClass}
              placeholder="e.g. 7.5"
            />
          </Field>

          <Field
            label="Total Alkalinity (ppm)"
            hint={`Aim for ${targetRanges.taMin}–${targetRanges.taMax}`}
          >
            <input
              type="number"
              inputMode="decimal"
              value={ta}
              onChange={(e) => setTa(e.target.value)}
              className={inputClass}
              placeholder="e.g. 100"
            />
          </Field>

          {orpMode ? (
            <Field
              label="ORP / disinfection potential (mV)"
              hint={`Aim for ${targetRanges.orpMin ?? 650}–${targetRanges.orpMax ?? 750} mV. This is your probe's main reading.`}
            >
              <input
                type="number"
                inputMode="decimal"
                value={orp}
                onChange={(e) => setOrp(e.target.value)}
                className={inputClass}
                placeholder="e.g. 700"
              />
            </Field>
          ) : null}

          <Field
            label={`${sanitizerLabel} (ppm)${orpMode ? " — optional" : ""}`}
            hint={
              orpMode
                ? "Only if you also did a strip. Adding it lets me work out an exact dose."
                : `Aim for ${sanitizerRange}`
            }
          >
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={sanitizer}
              onChange={(e) => setSanitizer(e.target.value)}
              className={inputClass}
              placeholder="e.g. 3"
            />
          </Field>

          <Field
            label="Calcium hardness (ppm) — optional"
            hint="Leave blank if your strip doesn't test this"
          >
            <input
              type="number"
              inputMode="decimal"
              value={calcium}
              onChange={(e) => setCalcium(e.target.value)}
              className={inputClass}
              placeholder="optional"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={isFreshFill}
              onChange={(e) => setIsFreshFill(e.target.checked)}
              className="h-5 w-5 rounded"
            />
            <span className="text-sm text-slate-700">
              This is a fresh fill (I just refilled the tub)
            </span>
          </label>

          <Field label="Notes — optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Anything worth remembering"
            />
          </Field>
        </div>
      </Card>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Working it out…" : "Get my recommendations"}
      </Button>
    </form>
  );
}
