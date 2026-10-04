"use client";

// =============================================================================
//  components/RecommendationList.tsx
//  The screen after a test. What to add, numbered in the order to add it, with
//  a wait between each and an "I've added it" that logs the dose. Then one line
//  for what's fine and one for the heater. The full reasoning is behind "Why?".
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalculationResult, Recommendation, SanitizerType } from "@/lib/chemistry";
import type { LsiSnapshot } from "@/lib/balance";
import { summariseTest } from "@/lib/testResult";
import { chemicalName } from "@/lib/todo";
import { Button, Card } from "./ui";
import Icon from "./Icon";
import PageHeader from "./PageHeader";
import Stepper from "./Stepper";
import WhyButton from "./WhyButton";
import { useToast } from "./Toaster";

const firstSentence = (text: string) => {
  const m = text.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : text).replace(/\.$/, "");
};

export default function RecommendationList({
  result,
  readingId,
  balance,
  sanitizerType,
  sanitiserTested,
  onChange,
}: {
  result: CalculationResult;
  readingId: number | null;
  balance: LsiSnapshot | null;
  sanitizerType: SanitizerType;
  sanitiserTested: boolean;
  /** Back to the form to change the numbers. */
  onChange: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const s = summariseTest(result, sanitizerType, { sanitiser: sanitiserTested });
  const [added, setAdded] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const anyAdded = Object.keys(added).length > 0;

  // The test is already saved. Changing the numbers replaces it rather than
  // leaving a second one behind; once a dose is logged against it, it stays.
  async function change() {
    if (readingId !== null && !anyAdded) {
      setBusy(true);
      await fetch(`/api/readings/${readingId}`, { method: "DELETE" }).catch(() => null);
      setBusy(false);
    }
    onChange();
  }

  return (
    <div className="grid gap-[18px]">
      <PageHeader title={s.title} subtitle="Test saved" back={{ href: "/dashboard", label: "Back to Today" }} />

      {result.safetyFlags.length > 0 ? (
        // The heading already says don't get in; this says why.
        <div role="alert" className="flex gap-2.5 rounded-ctl border-2 border-bad bg-bad-soft px-3.5 py-3 text-bad-ink">
          <Icon name="alert-triangle" size={20} className="mt-px shrink-0" />
          <div className="grid gap-1 text-[14.5px] font-semibold leading-snug">
            {result.safetyFlags.map((f) => (
              <p key={f.code}>{f.message}</p>
            ))}
          </div>
        </div>
      ) : null}

      {s.doses.length ? (
        <Card flush>
          {s.doses.map((rec, i) => (
            <div key={`${rec.chemical}-${i}`}>
              {i > 0 ? (
                <p className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 text-[13.5px] text-ink-2">
                  <Icon name="hourglass" size={16} className="shrink-0 text-ink-3" />
                  Let it circulate for 20–30 minutes first.
                </p>
              ) : null}
              <Dose
                rec={rec}
                n={i + 1}
                readingId={readingId}
                added={added[i] ?? null}
                onAdded={(g) => setAdded((a) => ({ ...a, [i]: g }))}
                bordered={i > 0}
              />
            </div>
          ))}
        </Card>
      ) : result.safetyFlags.length === 0 ? (
        <p className="text-[15px] text-ink-2">Your water&apos;s in range. Enjoy your soak.</p>
      ) : null}

      {s.notes.length ? (
        <Card flush>
          {s.notes.map((n, i) => (
            <div key={`${n.label}-${i}`} className="px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
              <p className="font-bold leading-snug">{n.label}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
                {firstSentence(n.instructions)}
                {" · "}
                <WhyButton title={n.label}>
                  <p>{n.instructions}</p>
                </WhyButton>
              </p>
            </div>
          ))}
        </Card>
      ) : null}

      <Card flush>
        {s.fine.length ? (
          <p className="flex min-h-[48px] items-center gap-2.5 px-3.5 py-2.5 text-[14.5px]">
            <Icon name="check-circle" size={20} className="shrink-0 text-good-ink" />
            <span>{s.fine.join(" · ")}: fine</span>
          </p>
        ) : null}
        <HeaterLine balance={balance} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="line" className="min-w-[140px] flex-1" disabled={busy} onClick={change}>
          {anyAdded ? "Test again" : "Change values"}
        </Button>
        <Button
          className="min-w-[140px] flex-1"
          onClick={() => {
            toast(anyAdded ? "Test and doses saved" : "Test saved");
            router.push("/dashboard");
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

function Dose({
  rec,
  n,
  readingId,
  added,
  onAdded,
  bordered,
}: {
  rec: Recommendation;
  n: number;
  readingId: number | null;
  added: number | null;
  onAdded: (grams: number) => void;
  bordered: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState<number | null>(rec.amountGrams);
  const [saving, setSaving] = useState(false);

  async function log(amount: number) {
    setSaving(true);
    const res = await fetch("/api/dosing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chemical: rec.chemical, amountGrams: amount, readingId }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setEditing(false);
      onAdded(amount);
    } else {
      toast("That didn't save. Check your connection and try again.");
    }
  }

  const done = added !== null;
  const fmt = (g: number) => (Number.isInteger(g) ? String(g) : g.toFixed(1));

  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3.5 py-3.5 ${bordered ? "border-t border-line" : ""}`}>
      <span
        className={`row-span-4 grid h-[30px] w-[30px] place-items-center rounded-full font-extrabold ${
          done ? "bg-accent text-on-accent" : "bg-accent-soft text-accent-ink"
        }`}
      >
        {done ? <Icon name="check" size={16} strokeWidth={3} /> : n}
      </span>
      <p className="font-extrabold leading-snug">{chemicalName(rec.chemical) ?? rec.label}</p>
      <p className="text-[13.5px] leading-snug text-ink-2">
        {firstSentence(rec.instructions)}
        {" · "}
        <WhyButton title={rec.label}>
          <p>{rec.instructions}</p>
        </WhyButton>
      </p>
      <p className="mt-1 text-[32px] font-extrabold leading-tight tabular-nums">
        {rec.amountGrams !== null ? (
          `${fmt(rec.amountGrams)} g`
        ) : (
          <span className="text-xl">A small amount</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-good-ink">
            <Icon name="check" size={16} strokeWidth={2.6} />
            Added {fmt(added)} g
          </span>
        ) : editing ? (
          <>
            <Stepper
              id={`dose-${n}`}
              label="grams added"
              value={grams}
              onChange={setGrams}
              min={0}
              max={2000}
              step={grams !== null && grams >= 50 ? 5 : 1}
              unit="g"
              start={5}
            />
            <Button size="sm" disabled={saving || grams === null} onClick={() => grams !== null && log(grams)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => (rec.amountGrams === null ? setEditing(true) : log(rec.amountGrams))}
            >
              {saving ? "Saving…" : "I've added it"}
            </Button>
            {rec.amountGrams !== null ? (
              <Button size="sm" variant="text" onClick={() => setEditing(true)}>
                Different amount
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// The doses treat each number on its own. This line is the only place that
// says whether the combination is safe for the heater, which can be "no"
// while every single number reads fine.
function HeaterLine({ balance }: { balance: LsiSnapshot | null }) {
  if (!balance || balance.ph === null || balance.alkalinityPpm === null) return null;
  const row = "flex min-h-[48px] items-center gap-2.5 px-3.5 py-2.5 text-[14.5px] [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line";

  if (balance.lsi === null || balance.verdict === null) {
    return (
      <p className={row}>
        <Icon name="thermometer" size={20} className="shrink-0 text-ink-3" />
        <span>Heater protection needs a calcium reading.</span>
      </p>
    );
  }

  const { verdict, lsi } = balance;
  const ok = verdict.band === "balanced";
  return (
    <p className={row}>
      <Icon
        name={ok ? "check-circle" : "alert-triangle"}
        size={20}
        className={`shrink-0 ${ok ? "text-good-ink" : verdict.severity === "high" ? "text-bad-ink" : "text-warn-ink"}`}
      />
      <span className="min-w-0">
        Heater protection: {verdict.headline.charAt(0).toLowerCase() + verdict.headline.slice(1)} (
        <span className="tabular-nums">
          {lsi > 0 ? "+" : ""}
          {lsi.toFixed(2)}
        </span>
        ){" · "}
        <WhyButton title={verdict.headline}>
          <p>{verdict.detail}</p>
          {verdict.actions.map((a) => (
            <p key={a} className="font-semibold text-ink">
              {a}
            </p>
          ))}
          <p className="text-[13.5px] text-ink-3">
            Saturation index from pH, alkalinity{balance.cyaCorrected ? " (less stabiliser)" : ""},
            calcium {balance.calcium?.valuePpm} ppm and{" "}
            {balance.temperatureC.toFixed(balance.temperatureIsMeasured ? 1 : 0)} °C
            {balance.temperatureIsMeasured ? "" : " (assumed)"}.
          </p>
        </WhyButton>
      </span>
    </p>
  );
}
