"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

// Quick "we used the tub today" logger with a small people-count stepper.
export default function LogSoakButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bathers, setBathers] = useState(2);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function log() {
    setSaving(true);
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bathers }),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
      router.refresh();
      setTimeout(() => setDone(false), 2500);
    }
  }

  if (done) {
    return (
      <p className="text-center text-sm font-medium text-emerald-700">
        ✓ Soak logged — enjoy!
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
        🛁 Log a soak
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="mb-2 text-center text-sm text-slate-600">
        How many people used it?
      </p>
      <div className="mb-3 flex items-center justify-center gap-4">
        <button
          onClick={() => setBathers((b) => Math.max(1, b - 1))}
          className="h-10 w-10 rounded-full bg-slate-100 text-xl font-bold text-slate-700"
          aria-label="Fewer people"
        >
          −
        </button>
        <span className="w-10 text-center text-2xl font-bold text-slate-800">
          {bathers}
        </span>
        <button
          onClick={() => setBathers((b) => Math.min(20, b + 1))}
          className="h-10 w-10 rounded-full bg-slate-100 text-xl font-bold text-slate-700"
          aria-label="More people"
        >
          +
        </button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setOpen(false)}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button onClick={log} disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Log it"}
        </Button>
      </div>
    </div>
  );
}
