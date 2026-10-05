"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toaster";

// "Every 7 days · Change" under a job (with "Last done …" beneath), opening to
// a small inline editor.
export default function FrequencyEditor({
  taskId,
  frequencyDays,
  suffix,
}: {
  taskId: number;
  frequencyDays: number;
  /** A second line, e.g. "Last done Sun 27 Sep". */
  suffix?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(frequencyDays));
  const [saving, setSaving] = useState(false);

  async function save() {
    const days = Number(value);
    if (!Number.isInteger(days) || days <= 0) return;
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequencyDays: days }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setEditing(false);
      toast(`Now every ${days} day${days === 1 ? "" : "s"}`);
      router.refresh();
    } else {
      toast("That didn't save. Try again in a moment.");
    }
  }

  if (!editing) {
    return (
      // Two fixed lines, so "Change" is never left on a line of its own.
      <span className="block text-[13.5px] leading-snug text-ink-2">
        <span className="block">
          Every {frequencyDays} day{frequencyDays === 1 ? "" : "s"}
          {" · "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-my-2 py-2 font-bold text-accent-ink underline underline-offset-[3px]"
          >
            Change
          </button>
        </span>
        {suffix ? <span className="block">{suffix}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
      Every
      <input
        type="number"
        inputMode="numeric"
        aria-label="Days between"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-ctl border border-line bg-surface px-2 py-1.5 text-base text-ink"
        min={1}
      />
      days
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="min-h-9 rounded-ctl bg-accent px-3 font-bold text-on-accent disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setValue(String(frequencyDays));
        }}
        className="min-h-9 px-1 font-bold text-ink-2"
      >
        Cancel
      </button>
    </span>
  );
}
