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
      <div className="mt-2 flex flex-wrap gap-x-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-my-2 py-2 text-sm font-bold text-accent-ink underline underline-offset-[3px]"
        >
          {hasSaved ? "Change this figure" : "I've measured mine"}
        </button>
        {hasSaved ? (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={state === "saving"}
            className="-my-2 py-2 text-sm font-bold text-ink-2 underline underline-offset-[3px]"
          >
            Use the probe&apos;s figure instead
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-ctl bg-surface-2 p-3">
      <label className="block text-sm font-bold text-ink-2" htmlFor="insulation-rate">
        With the covers on and nobody in it, how many degrees does it lose an hour?
      </label>
      <input
        id="insulation-rate"
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 0.1"
        className="mt-1.5 w-full rounded-ctl border border-line bg-surface px-3 py-2.5 text-base"
      />
      <p className="mt-1.5 text-[13px] text-ink-2">
        Leave it alone for a few hours and compare two probe readings. Worked out
        using today&apos;s {deltaTK.toFixed(0)}° gap between water and air
        {preview !== null ? `: ${preview.toFixed(1)} W/K` : ""}.
      </p>
      {state === "error" ? (
        <p className="mt-1.5 text-[13px] font-semibold text-bad-ink">
          That didn&apos;t save. Check the number and try again.
        </p>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={preview === null || state === "saving"}
          onClick={() => preview !== null && save(preview)}
          className="min-h-10 rounded-ctl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-10 rounded-ctl border border-line bg-surface px-4 text-sm font-bold text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
