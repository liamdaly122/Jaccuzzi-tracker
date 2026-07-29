"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalculationResult, SanitizerType, TargetRanges } from "@/lib/chemistry";
import { Button, Card, Field, inputClass } from "./ui";
import RecommendationList from "./RecommendationList";

interface Props {
  sanitizerType: SanitizerType;
  targetRanges: TargetRanges;
  scanEnabled?: boolean;
}

// A test-strip usually gives colour bands, so we present the ideal band next to
// each field to help the user read their strip.
export default function ReadingForm({
  sanitizerType,
  targetRanges,
  scanEnabled = false,
}: Props) {
  const router = useRouter();
  const [ph, setPh] = useState("");
  const [ta, setTa] = useState("");
  const [sanitizer, setSanitizer] = useState("");
  const [calcium, setCalcium] = useState("");
  const [isFreshFill, setIsFreshFill] = useState(false);
  const [notes, setNotes] = useState("");

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [readingId, setReadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFilled, setScanFilled] = useState(false);

  const num = (s: string): number | null =>
    s.trim() === "" ? null : Number(s);

  // Read a File as raw base64 (drops the "data:...;base64," prefix).
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const out = reader.result as string;
        const comma = out.indexOf(",");
        resolve(comma >= 0 ? out.slice(comma + 1) : out);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setScanning(true);
    setScanError(null);
    setScanFilled(false);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/scan-strip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const data = await res.json();
      if (res.ok && data.values) {
        const v = data.values;
        const san =
          sanitizerType === "chlorine" ? v.freeChlorinePpm : v.brominePpm;
        const any =
          v.ph != null ||
          v.totalAlkalinityPpm != null ||
          san != null ||
          v.calciumHardnessPpm != null;
        if (v.ph != null) setPh(String(v.ph));
        if (v.totalAlkalinityPpm != null) setTa(String(v.totalAlkalinityPpm));
        if (san != null) setSanitizer(String(san));
        if (v.calciumHardnessPpm != null) setCalcium(String(v.calciumHardnessPpm));
        if (any) {
          setScanFilled(true);
        } else {
          setScanError(
            "I couldn't read the pads clearly — please type the values in.",
          );
        }
      } else {
        setScanError(
          data.error || "Couldn't read that photo — please type the values in.",
        );
      }
    } catch {
      setScanError("Couldn't read that photo — please type the values in.");
    } finally {
      setScanning(false);
    }
  }

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
    setIsFreshFill(false);
    setNotes("");
    setScanError(null);
    setScanFilled(false);
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
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onScanFile}
                disabled={scanning}
                className="hidden"
              />
              {scanning ? "📷 Reading your strip…" : "📷 Scan strip with camera"}
            </label>
            {scanFilled ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                🤖 I filled these in from your photo — please check every value
                against the strip before saving, especially the{" "}
                {sanitizerType === "chlorine" ? "chlorine" : "bromine"}.
              </p>
            ) : null}
            {scanError ? (
              <p className="mt-2 text-xs text-slate-500">{scanError}</p>
            ) : null}
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

          <Field label={`${sanitizerLabel} (ppm)`} hint={`Aim for ${sanitizerRange}`}>
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
