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
} from "@/lib/startup";
import { Button, Card } from "./ui";
import ScanStripButton from "./ScanStripButton";

interface Props {
  settings: SpaSettings;
  drainRefillTaskId: number | null;
  scanEnabled: boolean;
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
}: Props) {
  const router = useRouter();

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
  const [calc, setCalc] = useState<CalculationResult | null>(null);
  const [lastReadingId, setLastReadingId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [safe, setSafe] = useState(false);
  const [finished, setFinished] = useState(false);

  const plan = useMemo(
    () => buildStartupPlan(sanitizer, Number(volume) || 0),
    [sanitizer, volume],
  );
  const stage = plan[Math.min(stageIndex, plan.length - 1)];

  const config: SpaConfig = useMemo(
    () => ({
      volumeLitres: Number(volume) || 0,
      sanitizerType: sanitizer,
      targetRanges: settings.target_ranges,
      dosingConstants: settings.dosing_constants,
    }),
    [volume, sanitizer, settings.target_ranges, settings.dosing_constants],
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

  const pct = Math.round((stageIndex / (plan.length - 1)) * 100);

  function go(delta: number) {
    setNote(null);
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
        setNote("Couldn't save that — please try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setNote("Couldn't save that — please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveReading(): Promise<CalculationResult | null> {
    const phVal = ph.trim() === "" ? null : Number(ph);
    const taVal = ta.trim() === "" ? null : Number(ta);
    if (phVal === null || taVal === null) {
      setNote("Please enter at least pH and alkalinity.");
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
      setNote("Logged ✓");
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
        setNote("Couldn't finish — please try again.");
      }
    } catch {
      setNote("Couldn't finish — please try again.");
    } finally {
      setBusy(false);
    }
  }

  // The recommendation the calculator produced for a given dosing order
  // (1 = alkalinity, 2 = pH), or null when that metric is already in range.
  const recForOrder = (order: number) =>
    calc?.recommendations.find((r) => r.order === order && r.severity !== "info") ??
    null;

  // --- shared test-capture block (used by test + retest actions) -------------
  const testInputs = (
    <div className="space-y-3">
      {scanEnabled ? (
        <ScanStripButton
          sanitizerType={sanitizer}
          onValues={(v) => {
            const s =
              sanitizer === "chlorine" ? v.freeChlorinePpm : v.brominePpm;
            if (v.ph != null) setPh(String(v.ph));
            if (v.totalAlkalinityPpm != null) setTa(String(v.totalAlkalinityPpm));
            if (s != null) setSan(String(s));
          }}
        />
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <LabelledInput label="pH" value={ph} onChange={setPh} placeholder="7.5" />
        <LabelledInput
          label="Alkalinity"
          value={ta}
          onChange={setTa}
          placeholder="100"
        />
        <LabelledInput
          label={sanitizer === "chlorine" ? "Chlorine" : "Bromine"}
          value={san}
          onChange={setSan}
          placeholder="3"
        />
      </div>
    </div>
  );

  if (finished) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="anim-pop mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          🎉
        </div>
        <h1 className="text-2xl font-bold text-slate-800">You&apos;re all set!</h1>
        <p className="mt-2 text-slate-600">
          Your water is balanced and safe, and I&apos;ve reset your
          water-freshness tracking for the new water. Enjoy your soak.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700"
          >
            Go to Today →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-5">
      {/* Top bar: progress + exit */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Step {stageIndex + 1} of {plan.length}
          </span>
          <Link href="/dashboard" className="font-medium text-slate-400">
            Save &amp; exit
          </Link>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stage card — keyed so the entrance animation replays each step */}
      <div key={stage.key} className="anim-stage flex-1">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 text-5xl">{stage.emoji}</div>
          <h1 className="text-2xl font-bold text-slate-800">{stage.title}</h1>
        </div>

        <Card>
          <p className="text-slate-600">{stage.body}</p>
          {stage.tip ? (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              💡 {stage.tip}
            </p>
          ) : null}
          {stage.safety ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ {stage.safety}
            </p>
          ) : null}

          {/* Stage-specific controls */}
          <div className="mt-4">{renderStageBody()}</div>

          {note ? (
            <p className="mt-3 text-center text-sm text-slate-500">{note}</p>
          ) : null}
        </Card>
      </div>

      {/* Bottom navigation */}
      <div className="mt-5 flex gap-3">
        {stageIndex > 0 ? (
          <Button variant="secondary" onClick={() => go(-1)} className="flex-1">
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
          <div className="grid grid-cols-2 gap-3">
            {(["chlorine", "bromine"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSanitizer(type)}
                className={`rounded-2xl border-2 p-4 text-center transition ${
                  sanitizer === type
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="text-3xl">
                  {type === "chlorine" ? "💧" : "🟠"}
                </div>
                <div className="mt-1 font-semibold capitalize text-slate-800">
                  {type}
                </div>
              </button>
            ))}
          </div>
        );

      case "volume":
        return (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Water volume (litres)
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
        );

      case "fill":
        return <WaterFill />;

      case "test":
        return testInputs;

      case "alkalinity":
        return renderDoseStage(1, "Alkalinity");

      case "ph":
        return renderDoseStage(2, "pH");

      case "sanitiser":
        return (
          <div className="space-y-3">
            <ul className="space-y-2">
              {(stage.doses ?? []).map((d, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm text-slate-700">{d.label}</p>
                  <p className="text-lg font-bold text-slate-900">{d.amount}</p>
                </li>
              ))}
            </ul>
            {sanitizer === "chlorine" ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  logDose("dichlor", commissioningChlorineGrams(Number(volume)))
                }
                className="w-full"
              >
                Log this dose
              </Button>
            ) : null}
          </div>
        );

      case "wait":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-2">
              <div className="anim-pulse-soft text-5xl">💤</div>
            </div>
            <p className="text-center text-sm text-slate-500">
              When you&apos;ve waited, test again to check it&apos;s safe.
            </p>
            {testInputs}
            <Button
              disabled={busy}
              onClick={async () => {
                const c = await saveReading();
                if (!c) return;
                const ok = isSafeToBathe(
                  sanitizer,
                  {
                    ph: Number(ph),
                    totalAlkalinityPpm: Number(ta),
                    freeChlorinePpm:
                      sanitizer === "chlorine" ? Number(san) : null,
                    brominePpm: sanitizer === "bromine" ? Number(san) : null,
                  },
                  config,
                );
                setSafe(ok);
                setNote(
                  ok
                    ? "✓ Levels look safe — tap Continue."
                    : "Not quite there yet — give it more time and test again.",
                );
              }}
              className="w-full"
            >
              {busy ? "Checking…" : "Test again"}
            </Button>
          </div>
        );

      case "final":
        return (
          <div className="space-y-2 text-center text-sm text-slate-500">
            {safe ? (
              <p className="font-medium text-emerald-700">
                ✓ Your water is safe and balanced.
              </p>
            ) : (
              <p>Finish once your last test showed safe levels.</p>
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
        <p className="text-sm text-slate-500">
          Do a test first (previous step) and your exact {label.toLowerCase()}{" "}
          amount will appear here.
        </p>
      );
    }
    const rec = recForOrder(order);
    return (
      <div className="space-y-3">
        {rec ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">{rec.label}</p>
            {rec.amountGrams != null ? (
              <p className="text-lg font-bold text-slate-900">
                {rec.amountGrams} g
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">{rec.instructions}</p>
            {rec.chemical && rec.amountGrams != null ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  logDose(rec.chemical as string, rec.amountGrams as number)
                }
                className="mt-2 text-xs"
              >
                Log this dose
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            ✓ {label} is already in range — nothing to add.
          </p>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-brand-600">
            Added it? Retest
          </summary>
          <div className="mt-3 space-y-3">
            {testInputs}
            <Button disabled={busy} onClick={saveReading} className="w-full">
              {busy ? "Saving…" : "Save retest"}
            </Button>
          </div>
        </details>
      </div>
    );
  }

  function renderPrimaryButton() {
    // The final stage finishes; the wait stage only advances once safe.
    if (stage.key === "final") {
      return (
        <Button onClick={finish} disabled={busy || !safe} className="flex-1">
          {busy ? "Finishing…" : "Finish setup 🎉"}
        </Button>
      );
    }
    if (stage.key === "wait") {
      return (
        <Button onClick={() => go(1)} disabled={!safe} className="flex-1">
          Continue
        </Button>
      );
    }
    if (stage.key === "volume") {
      return (
        <Button
          disabled={busy || !(Number(volume) > 0)}
          onClick={async () => {
            const ok = await saveSettings();
            if (ok) go(1);
          }}
          className="flex-1"
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      );
    }
    if (stage.key === "sanitizer") {
      return (
        <Button
          disabled={busy}
          onClick={async () => {
            const ok = await saveSettings();
            if (ok) go(1);
          }}
          className="flex-1"
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      );
    }
    if (stage.key === "test") {
      return (
        <Button
          disabled={busy}
          onClick={async () => {
            const c = await saveReading();
            if (c) go(1);
          }}
          className="flex-1"
        >
          {busy ? "Saving…" : "Save & continue"}
        </Button>
      );
    }
    return (
      <Button onClick={() => go(1)} className="flex-1">
        {stageIndex === 0 ? "Let's go" : "Next"}
      </Button>
    );
  }
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
    </label>
  );
}

// A small decorative "filling tub" illustration for the fill step.
function WaterFill() {
  return (
    <div className="mx-auto flex h-28 w-40 items-end overflow-hidden rounded-2xl border-2 border-brand-200 bg-brand-50">
      <div className="anim-water-rise h-full w-full origin-bottom bg-gradient-to-t from-brand-400 to-brand-300 opacity-80" />
    </div>
  );
}
