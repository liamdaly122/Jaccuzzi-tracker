"use client";

// =============================================================================
//  components/InsulationInput.tsx
//  Enter a measured standing loss. Sits next to the insulation figure on the
//  running-costs card, because that's where it's explained and where a wrong
//  one gets noticed.
//
//  Asks for °C per hour rather than W/K: nobody measures watts per kelvin, but
//  anyone can leave the tub alone overnight and read the probe twice. The
//  conversion needs the temperature difference at the time, which the app
//  already knows from the probe and the forecast.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { heatLossFromStandingLoss } from "@/lib/thermal";

export default function InsulationInput({
  deltaTK,
  volumeLitres,
  hasSaved,
}: {
  /** How much warmer the water currently is than the air. */
  deltaTK: number;
  volumeLitres: number;
  hasSaved: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const parsed = Number(value);
  const preview =
    value.trim() !== "" && Number.isFinite(parsed) && parsed > 0
      ? heatLossFromStandingLoss(parsed, deltaTK, volumeLitres)
      : null;

  async function save(heatLossWPerK: number | null) {
    setState("saving");
    try {
      const res = await fetch("/api/heat-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heatLossWPerK }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("idle");
      setOpen(false);
      setValue("");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-brand-600 underline underline-offset-2"
        >
          {hasSaved ? "Change this figure" : "I've measured mine"}
        </button>
        {hasSaved ? (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={state === "saving"}
            className="text-xs font-medium text-slate-400 underline underline-offset-2"
          >
            Use the measured one instead
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3">
      <label className="block text-xs font-medium text-slate-600">
        With the covers on and nobody in it, how many °C does it lose an hour?
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 0.1"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <p className="mt-1.5 text-xs text-slate-400">
        Leave it alone for a few hours and compare two probe readings. Converted
        using the {deltaTK.toFixed(0)} °C difference between your water and the
        air right now
        {preview !== null ? `, which works out at ${preview.toFixed(1)} W/K` : ""}.
      </p>
      {state === "error" ? (
        <p className="mt-1.5 text-xs text-red-700">
          That didn&apos;t save — check the number and try again.
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={preview === null || state === "saving"}
          onClick={() => preview !== null && save(preview)}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
