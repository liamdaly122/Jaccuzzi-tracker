"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SpaSettings } from "@/lib/types";
import type { TargetRanges, DosingConstants } from "@/lib/chemistry";
import { computeWaterChangeIntervalDays } from "@/lib/water";
import { Button, Card, Field, inputClass } from "./ui";

interface Props {
  settings: SpaSettings;
  icsUrl: string | null;
}

// Labels for the "advanced" numeric grids, so the UI isn't a wall of keys.
const rangeFields: { key: keyof TargetRanges; label: string }[] = [
  { key: "phIdealMin", label: "pH ideal min" },
  { key: "phIdealMax", label: "pH ideal max" },
  { key: "phAcceptableMin", label: "pH acceptable min" },
  { key: "phAcceptableMax", label: "pH acceptable max" },
  { key: "taMin", label: "Alkalinity min" },
  { key: "taMax", label: "Alkalinity max" },
  { key: "fcMin", label: "Chlorine min" },
  { key: "fcMax", label: "Chlorine max" },
  { key: "brMin", label: "Bromine min" },
  { key: "brMax", label: "Bromine max" },
  { key: "chMin", label: "Calcium min" },
  { key: "chMax", label: "Calcium max" },
];

const constantFields: { key: keyof DosingConstants; label: string }[] = [
  { key: "taIncreaserGPer1000LPer10Ppm", label: "Alkalinity up g/1000L per 10ppm" },
  { key: "phIncreaserDoseSmallG", label: "pH up — small dose (g/1000L)" },
  { key: "phIncreaserDoseMediumG", label: "pH up — medium (g/1000L)" },
  { key: "phIncreaserDoseLargeG", label: "pH up — large (g/1000L)" },
  { key: "phDecreaserDoseSmallG", label: "pH down — small (g/1000L)" },
  { key: "phDecreaserDoseMediumG", label: "pH down — medium (g/1000L)" },
  { key: "phDecreaserDoseLargeG", label: "pH down — large (g/1000L)" },
  { key: "dichlorAvailableChlorineFraction", label: "Dichlor available-chlorine (0–1)" },
  { key: "bromineTopUpGPer1000L", label: "Bromine top-up (g/1000L)" },
  { key: "bromineInitialChargeGPer1000L", label: "Bromine fresh-fill (g/1000L)" },
  { key: "sodiumBromideGPer1000L", label: "Sodium bromide (g/1000L)" },
  { key: "mpsShockGPer1000L", label: "Shock / MPS (g/1000L)" },
];

export default function SettingsForm({ settings, icsUrl }: Props) {
  const router = useRouter();
  const [sanitizerType, setSanitizerType] = useState(settings.sanitizer_type);
  const [volume, setVolume] = useState(String(settings.volume_litres));
  const [bathers, setBathers] = useState(
    String(settings.avg_daily_bathers ?? 1.5),
  );
  const [ranges, setRanges] = useState<TargetRanges>(settings.target_ranges);
  const [constants, setConstants] = useState<DosingConstants>(
    settings.dosing_constants,
  );
  const [location, setLocation] = useState(settings.location_name ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setStatus("saving");
    setLocationNote(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sanitizerType,
        volumeLitres: Number(volume),
        avgDailyBathers: Number(bathers),
        targetRanges: ranges,
        dosingConstants: constants,
        locationQuery: location,
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.geocodeFailed) {
        setLocationNote(
          "Couldn't find that place — try a town or postcode (everything else saved).",
        );
      }
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Sanitizer */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-800">Sanitizer</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["chlorine", "bromine"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSanitizerType(type)}
              className={`rounded-xl border-2 p-3 text-center font-medium capitalize transition ${
                sanitizerType === type
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              {type === "chlorine" ? "💧 Chlorine" : "🟠 Bromine"}
            </button>
          ))}
        </div>
      </Card>

      {/* Volume */}
      <Card>
        <Field
          label="Water volume (litres)"
          hint="A Lay-Z-Spa San Francisco holds about 1050 L when filled to the line."
        >
          <input
            type="number"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className={inputClass}
          />
        </Field>
      </Card>

      {/* Usage / water changes */}
      <Card>
        <Field
          label="People per day (on average)"
          hint="Used to work out how often to drain & refill. Even light use counts — half a person a day is fine to enter as 0.5."
        >
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            value={bathers}
            onChange={(e) => setBathers(e.target.value)}
            className={inputClass}
          />
        </Field>
        <WaterChangeHint volume={Number(volume)} bathers={Number(bathers)} />
      </Card>

      {/* Weather location */}
      <Card>
        <Field
          label="Your location (for weather warnings)"
          hint="A town or postcode is enough. Used only to warn you about frost or hot spells — leave blank to turn weather off."
        >
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder="e.g. Leeds"
          />
        </Field>
        {locationNote ? (
          <p className="mt-2 text-sm text-amber-700">{locationNote}</p>
        ) : settings.location_name ? (
          <p className="mt-2 text-xs text-slate-400">
            📍 Currently: {settings.location_name}
          </p>
        ) : null}
      </Card>

      {/* Advanced: target ranges */}
      <Card>
        <details>
          <summary className="cursor-pointer font-semibold text-slate-800">
            Advanced: target ranges
          </summary>
          <p className="mb-3 mt-2 text-xs text-slate-500">
            The ideal numbers for your water. Defaults follow common guidance —
            only change these if your test kit or product says otherwise.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {rangeFields.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs text-slate-500">{label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={ranges[key]}
                  onChange={(e) =>
                    setRanges({ ...ranges, [key]: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </details>
      </Card>

      {/* Advanced: dosing constants */}
      <Card>
        <details>
          <summary className="cursor-pointer font-semibold text-slate-800">
            Advanced: dosing strengths
          </summary>
          <p className="mb-3 mt-2 text-xs text-slate-500">
            How strong each chemical is. If your product label gives different
            dosing, adjust it here and the calculator follows suit.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {constantFields.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs text-slate-500">{label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={constants[key]}
                  onChange={(e) =>
                    setConstants({ ...constants, [key]: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        </details>
      </Card>

      <Button onClick={save} disabled={status === "saving"} className="w-full">
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "✓ Saved"
            : "Save settings"}
      </Button>
      {status === "error" ? (
        <p className="text-center text-sm text-red-600">
          Could not save. Please try again.
        </p>
      ) : null}

      {/* Calendar subscription */}
      <Card>
        <h2 className="mb-2 font-semibold text-slate-800">
          📅 Add to your phone&apos;s calendar (optional)
        </h2>
        {icsUrl ? (
          <>
            <p className="mb-2 text-sm text-slate-600">
              Subscribe to this link in Google, Apple, or Outlook calendar to see
              your maintenance dates there too. (Calendar apps refresh on their
              own schedule, so this is a backup to the phone notifications.)
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={icsUrl}
                className="w-full truncate rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(icsUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Keep this link private — anyone with it can see your schedule.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Set the <code>ICS_FEED_TOKEN</code> environment variable in Vercel to
            enable the calendar subscription link.
          </p>
        )}
      </Card>

      {/* Links */}
      <Card>
        <Link
          href="/history"
          className="flex items-center justify-between font-medium text-slate-700"
        >
          <span>📜 View history (readings &amp; doses)</span>
          <span className="text-brand-600">→</span>
        </Link>
      </Card>
      <Card>
        <Link
          href="/guides"
          className="flex items-center justify-between font-medium text-slate-700"
        >
          <span>📋 Guides &amp; help</span>
          <span className="text-brand-600">→</span>
        </Link>
      </Card>
    </div>
  );
}

// Live "you should change the water roughly every N days" hint. Recomputes as
// the volume or bathers inputs change (uses the same pure formula as the app).
function WaterChangeHint({
  volume,
  bathers,
}: {
  volume: number;
  bathers: number;
}) {
  if (!Number.isFinite(volume) || volume <= 0) return null;
  const { intervalDays, cappedByMax } = computeWaterChangeIntervalDays(
    volume,
    bathers,
  );
  return (
    <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
      💧 Suggested drain &amp; refill: about every{" "}
      <strong>{intervalDays} days</strong>
      {cappedByMax ? " (light use — quarterly is plenty)" : ""}. You can apply
      this to your schedule from the <strong>Today</strong> screen.
    </p>
  );
}
