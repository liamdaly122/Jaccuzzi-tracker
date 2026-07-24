"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FrequencyEditor({
  taskId,
  frequencyDays,
}: {
  taskId: number;
  frequencyDays: number;
}) {
  const router = useRouter();
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
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        Every {frequencyDays} day{frequencyDays === 1 ? "" : "s"} · edit
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500">Every</span>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        min={1}
      />
      <span className="text-xs text-slate-500">days</span>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setValue(String(frequencyDays));
        }}
        className="text-xs text-slate-400"
      >
        Cancel
      </button>
    </div>
  );
}
