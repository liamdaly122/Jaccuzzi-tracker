"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SpaSettings } from "@/lib/types";
import type { SanitizerType, SpaConfig, CalculationResult } from "@/lib/chemistry";
import {
  buildStartupPlan,
  isSafeToBathe,
  commissioningChlorineGrams,
  stagePhase,
} from "@/lib/startup";
import { Button, Callout, Card, FieldRow, LinkButton } from "./ui";
import ScanStripButton from "./ScanStripButton";
import IopoolButton, { SourceLine, type SourceMessage } from "./IopoolButton";
import Stepper from "./Stepper";
import { chemicalName } from "@/lib/todo";
import Icon from "./Icon";
import PhaseStepper from "./setup/PhaseStepper";
import WaterBalanceGauge, { type GaugeMetric } from "./setup/WaterBalanceGauge";
import DoseCard from "./setup/DoseCard";
import WaveTank from "./setup/WaveTank";

interface Props {
  settings: SpaSettings;
  drainRefillTaskId: number | null;
  scanEnabled: boolean;
  iopoolEnabled?: boolean;
}

const STORAGE_KEY = "setup-wizard-v1";

// A friendly, animated, one-screen-at-a-time flow that takes brand-new water
// from unsafe to safe. Fully integrated: it sets the sanitizer, reads tests,
// shows the exact dose for THIS tub at each step (via the app's own calculator),
// logs tests + doses, and resets the water-freshness/schedule at the end.
export default function SetupWizard({
  settings,
  drainRefillTaskId,
  scanEnabled,
  iopoolEnabled = false,
}: Props) {
  const router = useRouter();
  const orpMode = (settings.sanitizer_unit ?? "ppm") === "orp";

  const [sanitizer, setSanitizer] = useState<SanitizerType>(
    settings.sanitizer_type,
  );
  const [volume, setVolume] = useState(String(settings.volume_litres));
  const [stageIndex, setStageIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Live test values entered during the wizard, plus the calculator's response.
  const [ph, setPh] = useState("");
  const [ta, setTa] = useState("");
  const [san, setSan] = useState("");
  const [orp, setOrp] = useState("");
  const [calc, setCalc] = useState<CalculationResult | null>(null);
  const [lastReadingId, setLastReadingId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [safe, setSafe] = useState(false);
  const [finished, setFinished] = useState(false);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [source, setSource] = useState<SourceMessage | null>(null);

  const plan = useMemo(
    () => buildStartupPlan(sanitizer, Number(volume) || 0),
    [sanitizer, volume],
  );
  const stage = plan[Math.min(stageIndex, plan.length - 1)];

  const config: SpaConfig = useMemo(
    () => ({
      volumeLitres: Number(volume) || 0,
      sanitizerType: sanitizer,
      sanitizerUnit: settings.sanitizer_unit ?? "ppm",
      targetRanges: settings.target_ranges,
      dosingConstants: settings.dosing_constants,
    }),
    [
      volume,
      sanitizer,
      settings.sanitizer_unit,
      settings.target_ranges,
      settings.dosing_constants,
    ],
  );

  // Hydrate saved progress (survives closing the app during the ~24h wait).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.stageIndex === "number") setStageIndex(s.stageIndex);
        if (s.sanitizer === "chlorine" || s.sanitizer === "bromine")
          setSanitizer(s.sanitizer);
        if (typeof s.volume === "string" && s.volume) setVolume(s.volume);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist progress whenever it changes (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stageIndex, sanitizer, volume }),
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, stageIndex, sanitizer, volume]);

  // Which named phase we're in, and how far through it — drives the stepper.
  const phase = stagePhase(stage.key);
  const phaseStages = plan.filter((st) => stagePhase(st.key).index === phase.index);
  const posInPhase = phaseStages.findIndex((st) => st.key === stage.key);
  const phaseProgress =
    phaseStages.length <= 1 ? 0.5 : posInPhase / (phaseStages.length - 1);

  function go(delta: number) {
    setNote(null);
    setDir(delta < 0 ? "back" : "fwd");
    setStageIndex((i) => Math.max(0, Math.min(plan.length - 1, i + delta)));
  }

  // --- data helpers ----------------------------------------------------------
  async function saveSettings(): Promise<boolean> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sanitizerType: sanitizer,
          volumeLitres: Number(volume),
          avgDailyBathers: Number(settings.avg_daily_bathers ?? 1.5),
          targetRanges: settings.target_ranges,
          dosingConstants: settings.dosing_constants,
        }),
      });
      if (!res.ok) {
        setNote("That didn't save. Try again in a moment.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setNote("That didn't save. Try again in a moment.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveReading(): Promise<CalculationResult | null> {
    const phVal = ph.trim() === "" ? null : Number(ph);
    const taVal = ta.trim() === "" ? null : Number(ta);
    if (phVal === null || taVal === null) {
      setNote("pH and alkalinity are needed.");
      return null;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ph: phVal,
          totalAlkalinityPpm: taVal,
          freeChlorinePpm:
            sanitizer === "chlorine" && san.trim() !== "" ? Number(san) : null,
          brominePpm:
            sanitizer === "bromine" && san.trim() !== "" ? Number(san) : null,
          calciumHardnessPpm: null,
          orpMv: orp.trim() === "" ? null : Number(orp),
          isFreshFill: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error || "Couldn't save that reading.");
        return null;
      }
      setCalc(data.calculation as CalculationResult);
      setLastReadingId(data.reading?.id ?? null);
      router.refresh();
      return data.calculation as CalculationResult;
    } catch {
      setNote("Couldn't save that reading.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function logDose(chemical: string, grams: number) {
    setBusy(true);
    try {
      await fetch("/api/dosing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chemical,
          amountGrams: grams,
          readingId: lastReadingId,
        }),
      });
      setNote("Logged.");
      router.refresh();
    } catch {
      /* non-critical */
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!drainRefillTaskId) {
      setFinished(true);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${drainRefillTaskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Completed via fresh-water setup" }),
      });
      if (res.ok) {
        setFinished(true);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        router.refresh();
      } else {
        setNote("That didn't finish. Try again in a moment.");
      }
    } catch {
      setNote("That didn't finish. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  // The recommendation the calculator produced for a given dosing order
  // (1 = alkalinity, 2 = pH), or null when that metric is already in range.
  const recForOrder = (order: number) =>
    calc?.recommendations.find((r) => r.order === order && r.severity !== "info") ??
    null;

  // Live gauge of the three numbers that decide whether the water is usable.
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const r = settings.target_ranges;
  const gaugeMetrics: GaugeMetric[] = [
    {
      label: "pH",
      value: num(ph),
      min: r.phIdealMin,
      max: r.phIdealMax,
      floor: 6,
      ceiling: 9,
      decimals: 1,
    },
    {
      label: "Alkalinity",
      value: num(ta),
      min: r.taMin,
      max: r.taMax,
      floor: 0,
      ceiling: 240,
      unit: "ppm",
      decimals: 0,
    },
    {
      label: sanitizer === "chlorine" ? "Chlorine" : "Bromine",
      value: num(san),
      min: sanitizer === "chlorine" ? r.fcMin : r.brMin,
      max: sanitizer === "chlorine" ? r.fcMax : r.brMax,
      floor: 0,
      ceiling: sanitizer === "chlorine" ? 12 : 20,
      unit: "ppm",
      decimals: 1,
    },
  ];
  const hasAnyReading = gaugeMetrics.some((m) => m.value !== null);

  // --- shared test-capture block (used by test + retest actions) -------------
  const toNum = (v: string) => (v.trim() === "" ? null : Number(v));
  const toStr = (v: number | null) => (v === null ? "" : String(v));
  const sanName = sanitizer === "chlorine" ? "Chlorine" : "Bromine";
  const testInputs = (
    <div className="grid gap-3">
      {scanEnabled || iopoolEnabled ? (
        <div>
          <div className="flex flex-wrap gap-2">
            {scanEnabled ? (
              <ScanStripButton
                className="min-w-[150px] flex-1"
                sanitizerType={sanitizer}
                onMessage={setSource}
                onValues={(v) => {
                  const s = sanitizer === "chlorine" ? v.freeChlorinePpm : v.brominePpm;
                  if (v.ph != null) setPh(String(v.ph));
                  if (v.totalAlkalinityPpm != null) setTa(String(v.totalAlkalinityPpm));
                  if (s != null) setSan(String(s));
                }}
              />
            ) : null}
            {iopoolEnabled ? (
              <IopoolButton
                className="min-w-[150px] flex-1"
                onMessage={setSource}
                onValues={(pool) => {
                  const m = pool.measure;
                  if (m.ph != null) setPh(String(m.ph));
                  if (m.orpMv != null) setOrp(String(m.orpMv));
                }}
              />
            ) : null}
          </div>
          {source ? <SourceLine message={source} /> : null}
        </div>
      ) : null}
      <Card flush>
        <FieldRow name="pH">
          <Stepper id="w-ph" label="pH" value={toNum(ph)} onChange={(v) => setPh(toStr(v))} step={0.1} min={6} max={9} decimals={1} start={7.5} />
        </FieldRow>
        <FieldRow name="Alkalinity">
          <Stepper id="w-ta" label="alkalinity" value={toNum(ta)} onChange={(v) => setTa(toStr(v))} step={10} min={0} max={400} unit="ppm" start={100} />
        </FieldRow>
        {orpMode ? (
          <FieldRow name="ORP">
            <Stepper id="w-orp" label="ORP" value={toNum(orp)} onChange={(v) => setOrp(toStr(v))} step={10} min={0} max={1200} unit="mV" start={700} />
          </FieldRow>
        ) : null}
        <FieldRow name={sanName}>
          <Stepper id="w-san" label={sanName.toLowerCase()} value={toNum(san)} onChange={(v) => setSan(toStr(v))} step={0.5} min={0} max={20} decimals={1} unit="ppm" start={3} />
        </FieldRow>
      </Card>
    </div>
  );

  if (finished) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-[440px] content-center justify-items-center gap-3 px-4 py-16 text-center">
        <div className="anim-pop grid h-24 w-24 place-items-center rounded-full bg-good-soft text-good-ink">
          <Icon name="check-seal" size={52} strokeWidth={1.5} />
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight">You&apos;re all set</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">
          The water is balanced and safe, and its age has been reset for the new fill. Enjoy your
          soak.
        </p>
        <LinkButton href="/dashboard" size="lg" className="mt-3">
          Go to Today
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-[calc(14px+env(safe-area-inset-top,0px))]">
      {/* Top bar: phase progress + exit */}
      <div className="mb-6">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            {phase.label} · step {stageIndex + 1} of {plan.length}
          </span>
          <Link href="/dashboard" className="-my-2.5 py-2.5 text-sm font-bold text-accent-ink">
            Save and exit
          </Link>
        </div>
        <PhaseStepper currentPhase={phase.index} phaseProgress={phaseProgress} />
      </div>

      {/* Stage, keyed so the entrance animation replays each step */}
      <div key={stage.key} className={`flex-1 ${dir === "back" ? "anim-slide-back" : "anim-slide-fwd"}`}>
        <div className="mb-4 text-center">
          <div className="anim-pop mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <Icon name={stage.icon} size={40} strokeWidth={1.6} />
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight [text-wrap:balance]">{stage.title}</h1>
        </div>

        <div className="grid gap-3.5">
          <p className="text-[15.5px] leading-relaxed text-ink-2">{stage.body}</p>
          {stage.tip ? (
            <Callout tone="accent" icon="bulb">
              {stage.tip}
            </Callout>
          ) : null}
          {stage.safety ? (
            <Callout tone="warn" icon="alert-triangle">
              {stage.safety}
            </Callout>
          ) : null}

          {renderStageBody()}

          {note ? <p className="text-center text-[14.5px] font-semibold text-ink-2" role="status">{note}</p> : null}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="mt-6 flex gap-2">
        {stageIndex > 0 ? (
          <Button variant="line" size="lg" onClick={() => go(-1)} className="flex-1">
            Back
          </Button>
        ) : null}
        {renderPrimaryButton()}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  function renderStageBody() {
    switch (stage.key) {
      case "sanitizer":
        return (
          <Card flush>
            <div role="radiogroup" aria-label="Sanitiser">
              {(["chlorine", "bromine"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={sanitizer === type}
                  onClick={() => setSanitizer(type)}
                  className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left [&+&]:border-t [&+&]:border-line"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
                    <Icon name={type === "chlorine" ? "droplet" : "bromine"} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{type === "chlorine" ? "Chlorine" : "Bromine"}</span>
                    <span className="block text-[13.5px] text-ink-2">
                      {type === "chlorine" ? "Dichlor granules" : "Tablets or granules"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                      sanitizer === type ? "border-accent bg-accent text-on-accent" : "border-ink-3"
                    }`}
                  >
                    {sanitizer === type ? <Icon name="check" size={14} strokeWidth={3} /> : null}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        );

      case "volume":
        return (
          <Card flush>
            <FieldRow name="Litres">
              <Stepper id="w-volume" label="litres" value={toNum(volume)} onChange={(v) => setVolume(toStr(v))} step={10} min={100} max={5000} unit="L" start={1000} />
            </FieldRow>
          </Card>
        );

      case "fill":
        return <WaveTank level={0.66} />;

      case "test":
        return (
          <div className="anim-stagger grid gap-3.5">
            {testInputs}
            {hasAnyReading ? <WaterBalanceGauge metrics={gaugeMetrics} /> : null}
          </div>
        );

      case "alkalinity":
        return renderDoseStage(1, "Alkalinity");

      case "ph":
        return renderDoseStage(2, "pH");

      case "sanitiser":
        return (
          <div className="grid gap-3">
            <div className="anim-stagger grid gap-3">
              {(stage.doses ?? []).map((d, i) => {
                const m = /^([\d.]+)\s*(\S+)/.exec(d.amount);
                const value = m ? Number(m[1]) : 0;
                const unit = m ? m[2] : "";
                return (
                  <DoseCard
                    key={i}
                    label={d.label}
                    amount={value}
                    unit={unit}
                    showTeaspoons={unit === "g"}
                    fill={0.35 + Math.min(0.5, i * 0.15)}
                  />
                );
              })}
            </div>
            {sanitizer === "chlorine" ? (
              <Button
                variant="line"
                block
                disabled={busy}
                onClick={() => logDose("dichlor", commissioningChlorineGrams(Number(volume)))}
              >
                I&apos;ve added it
              </Button>
            ) : null}
          </div>
        );

      case "wait":
        return (
          <div className="grid gap-3.5">
            <div className="flex justify-center py-1">
              <div className="anim-pulse-soft text-accent-ink">
                <Icon name="hourglass" size={40} strokeWidth={1.5} />
              </div>
            </div>
            {hasAnyReading ? <WaterBalanceGauge metrics={gaugeMetrics} /> : null}
            <p className="text-center text-[14.5px] text-ink-2">
              When you&apos;ve waited, test again to check it&apos;s safe.
            </p>
            {testInputs}
            <Button
              block
              size="lg"
              disabled={busy}
              onClick={async () => {
                const c = await saveReading();
                if (!c) return;
                const sanNum = san.trim() === "" ? null : Number(san);
                const ok = isSafeToBathe(
                  sanitizer,
                  {
                    ph: Number(ph),
                    totalAlkalinityPpm: Number(ta),
                    freeChlorinePpm: sanitizer === "chlorine" ? sanNum : null,
                    brominePpm: sanitizer === "bromine" ? sanNum : null,
                    orpMv: orp.trim() === "" ? null : Number(orp),
                  },
                  config,
                );
                setSafe(ok);
                setNote(
                  ok
                    ? "Levels look safe. Tap Continue."
                    : "Not quite there yet. Give it more time and test again.",
                );
              }}
            >
              {busy ? "Checking…" : "Test again"}
            </Button>
          </div>
        );

      case "final":
        return (
          <div className="grid gap-3">
            {hasAnyReading ? <WaterBalanceGauge metrics={gaugeMetrics} /> : null}
            {safe ? (
              <Callout tone="good" icon="check-circle">
                Your water is safe and balanced.
              </Callout>
            ) : (
              <p className="text-center text-[14.5px] text-ink-2">Finish once your last test showed safe levels.</p>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  // Alkalinity / pH dose stage: show the calculator's exact amount, or confirm
  // it's already in range. Retest updates the numbers.
  function renderDoseStage(order: number, label: string) {
    if (!calc) {
      return (
        <p className="text-[14.5px] text-ink-2">
          Do a test first (the step before) and the exact {label.toLowerCase()} amount appears here.
        </p>
      );
    }
    const rec = recForOrder(order);
    return (
      <div className="grid gap-3">
        {rec ? (
          <Card>
            <p className="font-extrabold">{chemicalName(rec.chemical) ?? rec.label}</p>
            {rec.amountGrams != null ? (
              <p className="mt-1 text-[32px] font-extrabold leading-tight tabular-nums">{rec.amountGrams} g</p>
            ) : null}
            <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{rec.instructions}</p>
            {rec.chemical && rec.amountGrams != null ? (
              <Button
                variant="line"
                size="sm"
                disabled={busy}
                onClick={() => logDose(rec.chemical as string, rec.amountGrams as number)}
                className="mt-3"
              >
                I&apos;ve added it
              </Button>
            ) : null}
          </Card>
        ) : (
          <Callout tone="good" icon="check-circle">
            {label} is already in range. Nothing to add.
          </Callout>
        )}

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold text-accent-ink">
            <Icon name="chevron" size={16} className="-rotate-90 transition-transform group-open:rotate-0" />
            Added it? Test again
          </summary>
          <div className="mt-2 grid gap-3">
            {testInputs}
            <Button block disabled={busy} onClick={saveReading}>
              {busy ? "Saving…" : "Save the new test"}
            </Button>
          </div>
        </details>
      </div>
    );
  }

  function renderPrimaryButton() {
    const cls = "flex-1";
    // The final stage finishes; the wait stage only advances once safe.
    if (stage.key === "final") {
      return (
        <Button size="lg" onClick={finish} disabled={busy || !safe} className={cls}>
          {busy ? "Finishing…" : "Finish setup"}
        </Button>
      );
    }
    if (stage.key === "wait") {
      return (
        <Button size="lg" onClick={() => go(1)} disabled={!safe} className={cls}>
          Continue
        </Button>
      );
    }
    if (stage.key === "volume" || stage.key === "sanitizer") {
      return (
        <Button
          size="lg"
          disabled={busy || (stage.key === "volume" && !(Number(volume) > 0))}
          onClick={async () => {
            const ok = await saveSettings();
            if (ok) go(1);
          }}
          className={cls}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      );
    }
    if (stage.key === "test") {
      return (
        <Button
          size="lg"
          disabled={busy}
          onClick={async () => {
            const c = await saveReading();
            if (c) go(1);
          }}
          className={cls}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      );
    }
    return (
      <Button size="lg" onClick={() => go(1)} className={cls}>
        {stageIndex === 0 ? "Let's go" : "Next"}
      </Button>
    );
  }
}
