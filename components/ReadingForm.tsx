"use client";

// =============================================================================
//  components/ReadingForm.tsx
//  Test the water. Fill from the probe or a photo of the strip, or step each
//  number in; "See what to add" saves the test and turns into the results:
//  what to add, in order, each with a button to log it once it's in.
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CalculationResult,
  SanitizerType,
  SanitizerUnit,
  TargetRanges,
} from "@/lib/chemistry";
import type { LsiSnapshot } from "@/lib/balance";
import { Button, Callout, Card, FieldRow, inputClass } from "./ui";
import PageHeader from "./PageHeader";
import Stepper from "./Stepper";
import RecommendationList from "./RecommendationList";
import ScanStripButton from "./ScanStripButton";
import IopoolButton, { SourceLine, type SourceMessage } from "./IopoolButton";

interface Props {
  sanitizerType: SanitizerType;
  targetRanges: TargetRanges;
  scanEnabled?: boolean;
  sanitizerUnit?: SanitizerUnit;
  iopoolEnabled?: boolean;
}

type Num = number | null;

export default function ReadingForm({
  sanitizerType,
  targetRanges: r,
  scanEnabled = false,
  sanitizerUnit = "ppm",
  iopoolEnabled = false,
}: Props) {
  const orpMode = sanitizerUnit === "orp";
  const chlorine = sanitizerType === "chlorine";
  const router = useRouter();
  const [ph, setPh] = useState<Num>(null);
  const [ta, setTa] = useState<Num>(null);
  const [sanitizer, setSanitizer] = useState<Num>(null);
  const [calcium, setCalcium] = useState<Num>(null);
  const [cya, setCya] = useState<Num>(null);
  const [orp, setOrp] = useState<Num>(null);
  const [isFreshFill, setIsFreshFill] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [source, setSource] = useState<SourceMessage | null>(null);

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [readingId, setReadingId] = useState<number | null>(null);
  const [balance, setBalance] = useState<LsiSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The "needed" message goes as soon as both are filled in.
  useEffect(() => {
    if (ph !== null && ta !== null) setError(null);
  }, [ph, ta]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (ph === null || ta === null) {
      setError("pH and alkalinity are needed. The rest are optional.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ph,
          totalAlkalinityPpm: ta,
          freeChlorinePpm: chlorine ? sanitizer : null,
          brominePpm: chlorine ? null : sanitizer,
          calciumHardnessPpm: calcium,
          cyanuricAcidPpm: cya,
          orpMv: orp,
          isFreshFill,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.calculation as CalculationResult);
        setReadingId(data.reading?.id ?? null);
        setBalance((data.balance as LsiSnapshot | null) ?? null);
        window.scrollTo({ top: 0 });
        router.refresh();
      } else {
        setError(data.error || "That didn't save. Try again in a moment.");
      }
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <RecommendationList
        result={result}
        readingId={readingId}
        balance={balance}
        sanitizerType={sanitizerType}
        sanitiserTested={sanitizer !== null || orp !== null}
        onChange={() => {
          setResult(null);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const sanName = chlorine ? "Free chlorine" : "Bromine";
  const sanRange = chlorine ? `${r.fcMin}–${r.fcMax}` : `${r.brMin}–${r.brMax}`;

  return (
    <form onSubmit={onSubmit} className="grid gap-[18px]">
      <PageHeader title="Test the water" back={{ href: "/dashboard", label: "Back to Today" }} />

      {scanEnabled || iopoolEnabled ? (
        <div>
          <div className="flex flex-wrap gap-2">
            {scanEnabled ? (
              <ScanStripButton
                className="min-w-[150px] flex-1"
                sanitizerType={sanitizerType}
                onMessage={setSource}
                onValues={(v) => {
                  const san = chlorine ? v.freeChlorinePpm : v.brominePpm;
                  if (v.ph != null) setPh(v.ph);
                  if (v.totalAlkalinityPpm != null) setTa(v.totalAlkalinityPpm);
                  if (san != null) setSanitizer(san);
                  if (v.calciumHardnessPpm != null) setCalcium(v.calciumHardnessPpm);
                  if (v.cyanuricAcidPpm != null) setCya(v.cyanuricAcidPpm);
                }}
              />
            ) : null}
            {iopoolEnabled ? (
              <IopoolButton
                className="min-w-[150px] flex-1"
                onMessage={setSource}
                onValues={(pool) => {
                  const m = pool.measure;
                  if (m.ph != null) setPh(m.ph);
                  if (m.orpMv != null) setOrp(m.orpMv);
                }}
              />
            ) : null}
          </div>
          {source ? <SourceLine message={source} /> : null}
        </div>
      ) : null}

      <Card flush>
        <FieldRow name="pH" hint={`Aim ${r.phIdealMin}–${r.phIdealMax}`}>
          <Stepper id="t-ph" label="pH" value={ph} onChange={setPh} step={0.1} min={6} max={9} decimals={1} start={7.5} />
        </FieldRow>
        <FieldRow name="Alkalinity" hint={`Aim ${r.taMin}–${r.taMax}`}>
          <Stepper id="t-ta" label="alkalinity" value={ta} onChange={setTa} step={10} min={0} max={400} unit="ppm" start={100} />
        </FieldRow>
        {orpMode ? (
          <FieldRow name="ORP" hint={`Aim ${r.orpMin}–${r.orpMax}, from the probe`}>
            <Stepper id="t-orp" label="ORP" value={orp} onChange={setOrp} step={10} min={0} max={1200} unit="mV" start={700} />
          </FieldRow>
        ) : null}
        <FieldRow name={sanName} hint={orpMode ? "Optional, from a strip" : `Aim ${sanRange}`}>
          <Stepper id="t-san" label={sanName.toLowerCase()} value={sanitizer} onChange={setSanitizer} step={0.5} min={0} max={20} decimals={1} unit="ppm" start={3} />
        </FieldRow>
        <FieldRow name="Calcium" hint="Optional">
          <Stepper id="t-ch" label="calcium" value={calcium} onChange={setCalcium} step={25} min={0} max={1000} unit="ppm" start={150} />
        </FieldRow>
        <FieldRow name="Stabiliser" hint="Optional, every few weeks">
          <Stepper id="t-cya" label="stabiliser" value={cya} onChange={setCya} step={10} min={0} max={300} unit="ppm" start={30} />
        </FieldRow>
      </Card>

      <Card flush>
        <label className="flex min-h-[60px] cursor-pointer items-center gap-3 px-3.5 py-3">
          <input
            type="checkbox"
            checked={isFreshFill}
            onChange={(e) => setIsFreshFill(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-accent"
          />
          <span className="min-w-0">
            <span className="block font-bold">I&apos;ve just refilled it</span>
            <span className="block text-[13px] text-ink-3">Fresh water gets a starting dose</span>
          </span>
        </label>
      </Card>

      {showNotes ? (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
          rows={2}
          aria-label="Note"
          placeholder="Anything worth remembering"
          autoFocus
        />
      ) : (
        <Button variant="text" className="justify-self-start" onClick={() => setShowNotes(true)}>
          Add a note
        </Button>
      )}

      {error ? (
        <Callout tone="bad" icon="alert-triangle">
          {error}
        </Callout>
      ) : null}

      <Button type="submit" size="lg" block disabled={loading}>
        {loading ? "Working it out…" : "See what to add"}
      </Button>
    </form>
  );
}
