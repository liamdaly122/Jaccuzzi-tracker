"use client";

// =============================================================================
//  components/SettingsForm.tsx
//  Settings as short grouped rows, each showing its current value. Tapping one
//  opens just that setting with its own Save, so nothing is lost by wandering
//  off and nobody has to scroll a wall of fields to change one number.
// =============================================================================

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SpaSettings } from "@/lib/types";
import {
  DEFAULT_DOSING_CONSTANTS,
  DEFAULT_TARGET_RANGES,
  type DosingConstants,
  type SanitizerType,
  type SanitizerUnit,
  type TargetRanges,
} from "@/lib/chemistry";
import { computeWaterChangeIntervalDays } from "@/lib/water";
import { Button, Callout, Card, Row, Section, inputClass } from "./ui";
import Icon from "./Icon";
import Sheet from "./Sheet";
import Stepper from "./Stepper";
import CalibrationCard, { type Suggestion } from "./CalibrationCard";
import { useToast } from "./Toaster";
import type { IconName } from "@/lib/icons";

interface Props {
  settings: SpaSettings;
  icsUrl: string | null;
  suggestions: Suggestion[];
  observationCount: number;
}

// Soak temperature is left out: the Heat tab owns it.
const rangeFields: { key: keyof TargetRanges; label: string }[] = [
  { key: "phIdealMin", label: "pH ideal, low" },
  { key: "phIdealMax", label: "pH ideal, high" },
  { key: "phAcceptableMin", label: "pH acceptable, low" },
  { key: "phAcceptableMax", label: "pH acceptable, high" },
  { key: "taMin", label: "Alkalinity, low" },
  { key: "taMax", label: "Alkalinity, high" },
  { key: "fcMin", label: "Chlorine, low" },
  { key: "fcMax", label: "Chlorine, high" },
  { key: "brMin", label: "Bromine, low" },
  { key: "brMax", label: "Bromine, high" },
  { key: "chMin", label: "Calcium, low" },
  { key: "chMax", label: "Calcium, high" },
  { key: "cyaMin", label: "Stabiliser, low" },
  { key: "cyaMax", label: "Stabiliser, high" },
];

const constantFields: { key: keyof DosingConstants; label: string }[] = [
  { key: "taIncreaserGPer1000LPer10Ppm", label: "Alkalinity up, g per 1,000 L per 10 ppm" },
  { key: "phIncreaserDoseSmallG", label: "pH up, small (g per 1,000 L)" },
  { key: "phIncreaserDoseMediumG", label: "pH up, medium" },
  { key: "phIncreaserDoseLargeG", label: "pH up, large" },
  { key: "phDecreaserDoseSmallG", label: "pH down, small (g per 1,000 L)" },
  { key: "phDecreaserDoseMediumG", label: "pH down, medium" },
  { key: "phDecreaserDoseLargeG", label: "pH down, large" },
  { key: "dichlorAvailableChlorineFraction", label: "Dichlor strength (0–1)" },
  { key: "bromineTopUpGPer1000L", label: "Bromine top-up (g per 1,000 L)" },
  { key: "bromineInitialChargeGPer1000L", label: "Bromine fresh fill (g per 1,000 L)" },
  { key: "sodiumBromideGPer1000L", label: "Sodium bromide (g per 1,000 L)" },
  { key: "mpsShockGPer1000L", label: "Shock / MPS (g per 1,000 L)" },
];

interface Values {
  sanitizerType: SanitizerType;
  sanitizerUnit: SanitizerUnit;
  volumeLitres: number;
  avgDailyBathers: number;
  targetRanges: TargetRanges;
  dosingConstants: DosingConstants;
}

type Panel =
  | "volume"
  | "sanitiser"
  | "measure"
  | "people"
  | "location"
  | "calendar"
  | "ranges"
  | "dosing"
  | "calibration";

const TITLES: Record<Panel, string> = {
  volume: "Water volume",
  sanitiser: "Sanitiser",
  measure: "How you measure",
  people: "People per day",
  location: "Location",
  calendar: "Phone calendar",
  ranges: "Target ranges",
  dosing: "Dosing strengths",
  calibration: "Calibration",
};

function SetRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2 [&+&]:border-t [&+&]:border-line"
    >
      <span className="min-w-0 flex-1 font-bold">{label}</span>
      <span className="min-w-0 max-w-[50%] truncate text-right text-ink-2">{value}</span>
      <Icon name="chevron" size={16} className="shrink-0 -rotate-90 text-ink-3" />
    </button>
  );
}

function Option({
  selected,
  icon,
  title,
  sub,
  onClick,
}: {
  selected: boolean;
  icon: IconName;
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left [&+&]:border-t [&+&]:border-line"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        {sub ? <span className="block text-[13.5px] text-ink-2">{sub}</span> : null}
      </span>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
          selected ? "border-accent bg-accent text-on-accent" : "border-ink-3"
        }`}
        aria-hidden
      >
        {selected ? <Icon name="check" size={14} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function NumberGrid<K extends string>({
  fields,
  values,
  onChange,
  step,
}: {
  fields: { key: K; label: string }[];
  values: Record<K, number>;
  onChange: (key: K, v: number) => void;
  step: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
      {fields.map(({ key, label }) => (
        <label key={key} className="flex min-w-0 flex-col justify-end">
          <span className="mb-1 block text-[13px] font-semibold leading-snug text-ink-2">{label}</span>
          <input
            type="number"
            inputMode="decimal"
            step={step}
            value={values[key]}
            onChange={(e) => onChange(key, Number(e.target.value))}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

const sameNumbers = <T extends object>(a: T, b: T, skip: (keyof T)[] = []) =>
  (Object.keys(b) as (keyof T)[]).every((k) => skip.includes(k) || Number(a[k]) === Number(b[k]));

export default function SettingsForm({ settings, icsUrl, suggestions, observationCount }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState<Values>({
    sanitizerType: settings.sanitizer_type,
    sanitizerUnit: settings.sanitizer_unit ?? "ppm",
    volumeLitres: Number(settings.volume_litres),
    avgDailyBathers: Number(settings.avg_daily_bathers ?? 1.5),
    targetRanges: settings.target_ranges,
    dosingConstants: settings.dosing_constants,
  });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState<Values>(saved);
  const [place, setPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function open(p: Panel) {
    setDraft(saved);
    setPlace(settings.location_name ?? "");
    setNote(null);
    setPanel(p);
  }

  async function save() {
    setSaving(true);
    setNote(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        // Only look a place up when that's what was being changed.
        ...(panel === "location" ? { locationQuery: place } : {}),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setNote("That didn't save. Check your connection and try again.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (panel === "location" && data.geocodeFailed) {
      setNote("Couldn't find that place. Try a town or a postcode.");
      return;
    }
    setSaved(draft);
    setPanel(null);
    toast("Saved");
    router.refresh();
  }

  const set = <K extends keyof Values>(k: K, v: Values[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fmtL = (n: number) => `${n.toLocaleString("en-GB")} L`;
  const change = computeWaterChangeIntervalDays(draft.volumeLitres, draft.avgDailyBathers);
  const rangesStandard = sameNumbers(saved.targetRanges, DEFAULT_TARGET_RANGES, ["tempTarget"]);
  const dosingStandard = sameNumbers(saved.dosingConstants, DEFAULT_DOSING_CONSTANTS);
  const editable = panel !== null && panel !== "calendar" && panel !== "calibration";

  let body: ReactNode = null;
  switch (panel) {
    case "volume":
      body = (
        <>
          <Card flush>
            <div className="flex min-h-[68px] items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="min-w-0 font-bold">Litres</p>
              <Stepper id="set-volume" label="litres" value={draft.volumeLitres} onChange={(v) => v !== null && set("volumeLitres", v)} step={10} min={100} max={5000} unit="L" />
            </div>
          </Card>
          <p className="text-[14.5px] text-ink-2">Filled to the line, not the brim. Every dose is worked out from this, so it&apos;s worth getting right.</p>
        </>
      );
      break;
    case "sanitiser":
      body = (
        <Card flush>
          <div role="radiogroup" aria-label="Sanitiser">
            <Option selected={draft.sanitizerType === "chlorine"} icon="droplet" title="Chlorine" sub="Dichlor granules" onClick={() => set("sanitizerType", "chlorine")} />
            <Option selected={draft.sanitizerType === "bromine"} icon="bromine" title="Bromine" sub="Tablets or granules" onClick={() => set("sanitizerType", "bromine")} />
          </div>
        </Card>
      );
      break;
    case "measure":
      body = (
        <>
          <Card flush>
            <div role="radiogroup" aria-label="How you measure">
              <Option selected={draft.sanitizerUnit === "ppm"} icon="flask" title="Test strips" sub="How much sanitiser, in ppm" onClick={() => set("sanitizerUnit", "ppm")} />
              <Option selected={draft.sanitizerUnit === "orp"} icon="bolt" title="A probe" sub="How hard it's working, as ORP in mV" onClick={() => set("sanitizerUnit", "orp")} />
            </div>
          </Card>
          {draft.sanitizerUnit === "orp" ? (
            <p className="text-[14.5px] leading-relaxed text-ink-2">
              ORP and ppm can&apos;t be converted into each other: the same ppm reads differently
              with pH, stabiliser and temperature. So with a probe you&apos;re told whether the
              sanitiser is working and to top up a little at a time. Add a strip&apos;s ppm to a
              test whenever you have one and you&apos;ll get exact grams.
            </p>
          ) : null}
        </>
      );
      break;
    case "people":
      body = (
        <>
          <Card flush>
            <div className="flex min-h-[68px] items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="min-w-0 font-bold">On average</p>
              <Stepper id="set-people" label="people per day" value={draft.avgDailyBathers} onChange={(v) => v !== null && set("avgDailyBathers", v)} step={0.5} min={0} max={20} decimals={1} />
            </div>
          </Card>
          <Callout tone="accent" icon="droplet">
            That means changing the water about every <strong>{change.intervalDays} days</strong>
            {change.cappedByMax ? " (light use, so quarterly is plenty)" : ""}. Half a person a day is fine to enter as 0.5.
          </Callout>
        </>
      );
      break;
    case "location":
      body = (
        <>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className={inputClass}
            placeholder="A town or postcode"
            aria-label="Town or postcode"
            autoComplete="address-level2"
          />
          <p className="text-[14.5px] text-ink-2">
            For frost and heat warnings, and the outdoor temperature in the heating plan. Leave it
            empty to turn weather off.
          </p>
        </>
      );
      break;
    case "calendar":
      body = icsUrl ? (
        <>
          <p className="text-[14.5px] leading-relaxed text-ink-2">
            Puts your job dates in your phone&apos;s calendar. Calendar apps refresh on their own
            slow schedule, so the phone notifications stay the reliable reminder.
          </p>
          {/* A plain https link just downloads a file; webcal:// opens "subscribe". */}
          <a
            href={icsUrl.replace(/^https?:\/\//, "webcal://")}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-ctl bg-accent px-5 py-3 font-bold text-on-accent"
          >
            <Icon name="calendar" size={20} />
            Add to my calendar
          </a>
          <div>
            <p className="mb-1.5 text-[13.5px] font-semibold text-ink-2">
              Didn&apos;t work, or using Google Calendar on a computer? Copy the link and use
              &ldquo;Subscribe from URL&rdquo;:
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={icsUrl} aria-label="Calendar link" className={`${inputClass} min-w-0 truncate`} />
              <Button
                variant="line"
                onClick={() => {
                  navigator.clipboard.writeText(icsUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <ul className="grid gap-1.5 text-[13.5px] leading-snug text-ink-2">
            <li><strong className="text-ink">iPhone:</strong> tap Add to my calendar, then Subscribe.</li>
            <li><strong className="text-ink">Android:</strong> the button works with a calendar app that takes subscriptions. Otherwise use Google Calendar on a computer.</li>
            <li><strong className="text-ink">Google Calendar:</strong> Other calendars, then +, then From URL, and paste.</li>
            <li><strong className="text-ink">Outlook:</strong> Add calendar, then Subscribe from web, and paste.</li>
          </ul>
          <p className="text-[13px] text-ink-3">Keep the link private: anyone with it can see your schedule.</p>
        </>
      ) : (
        <p className="text-[14.5px] text-ink-2">
          Not switched on. It needs an <code>ICS_FEED_TOKEN</code> in the Vercel project&apos;s
          environment variables (see the README).
        </p>
      );
      break;
    case "ranges":
      body = (
        <>
          <p className="text-[14.5px] text-ink-2">The numbers to aim for. Only change these if your test kit or product says otherwise.</p>
          <NumberGrid fields={rangeFields} values={draft.targetRanges as unknown as Record<keyof TargetRanges, number>} step="0.1" onChange={(k, v) => set("targetRanges", { ...draft.targetRanges, [k]: v })} />
          <Button variant="text" className="justify-self-start" onClick={() => set("targetRanges", { ...DEFAULT_TARGET_RANGES, tempTarget: draft.targetRanges.tempTarget })}>
            Back to standard
          </Button>
        </>
      );
      break;
    case "dosing":
      body = (
        <>
          <p className="text-[14.5px] text-ink-2">How strong each product is. If your label doses differently, change it here and the calculator follows.</p>
          <NumberGrid fields={constantFields} values={draft.dosingConstants as unknown as Record<keyof DosingConstants, number>} step="0.01" onChange={(k, v) => set("dosingConstants", { ...draft.dosingConstants, [k]: v })} />
          <Button variant="text" className="justify-self-start" onClick={() => set("dosingConstants", DEFAULT_DOSING_CONSTANTS)}>
            Back to standard
          </Button>
        </>
      );
      break;
    case "calibration":
      body = <CalibrationCard suggestions={suggestions} observationCount={observationCount} />;
      break;
  }

  return (
    <>
      <Section title="Your tub">
        <Card flush>
          <SetRow label="Water volume" value={fmtL(saved.volumeLitres)} onClick={() => open("volume")} />
          <SetRow label="Sanitiser" value={saved.sanitizerType === "chlorine" ? "Chlorine" : "Bromine"} onClick={() => open("sanitiser")} />
          <SetRow label="How you measure" value={saved.sanitizerUnit === "orp" ? "Probe (ORP)" : "Test strips"} onClick={() => open("measure")} />
          <SetRow label="People per day" value={String(saved.avgDailyBathers)} onClick={() => open("people")} />
        </Card>
      </Section>

      <Section title="Heating">
        <Card flush>
          <Row title="Soak temperature and times" sub={`${saved.targetRanges.tempTarget}°C, on the Heat tab`} href="/heat" />
        </Card>
      </Section>

      <Section title="Reminders">
        <Card flush>
          <SetRow label="Location" value={settings.location_name || "Not set"} onClick={() => open("location")} />
          <SetRow label="Phone calendar" value={icsUrl ? "Add" : "Off"} onClick={() => open("calendar")} />
        </Card>
      </Section>

      <Section title="Fine-tuning">
        <Card flush>
          <SetRow label="Target ranges" value={rangesStandard ? "Standard" : "Custom"} onClick={() => open("ranges")} />
          <SetRow label="Dosing strengths" value={dosingStandard ? "Standard" : "Custom"} onClick={() => open("dosing")} />
          <SetRow
            label="Calibration"
            value={suggestions.length ? `${suggestions.length} to review` : `${observationCount} dose${observationCount === 1 ? "" : "s"} learned`}
            onClick={() => open("calibration")}
          />
        </Card>
      </Section>

      <Section title="More">
        <Card flush>
          <Row icon="scroll" title="History" sub="Every test, dose and soak" href="/history" />
          <Row icon="clipboard" title="Guides" sub="Step by step, saved as you go" href="/guides" />
          <Row icon="shower" title="Fresh water setup" sub="After a drain and refill" href="/setup" />
        </Card>
      </Section>

      <Card flush>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" }).catch(() => null);
            router.push("/login");
          }}
          className="flex min-h-[56px] w-full items-center px-3.5 font-bold text-bad-ink hover:bg-surface-2"
        >
          Log out
        </button>
      </Card>

      <Sheet open={panel !== null} onClose={() => setPanel(null)} title={panel ? TITLES[panel] : ""}>
        {body}
        {note ? (
          <Callout tone="warn" icon="alert-triangle">
            {note}
          </Callout>
        ) : null}
        {editable ? (
          <Button block size="lg" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : (
          <Button block variant="quiet" onClick={() => setPanel(null)}>
            Done
          </Button>
        )}
      </Sheet>
    </>
  );
}
