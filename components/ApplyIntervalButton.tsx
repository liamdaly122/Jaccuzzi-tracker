"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

// One-tap: set the drain & refill task's cadence to the recommended interval,
// keeping maintenance_tasks as the single source of truth for scheduling.
export default function ApplyIntervalButton({
  taskId,
  intervalDays,
}: {
  taskId: number;
  intervalDays: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequencyDays: intervalDays }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  return (
    <Button variant="secondary" onClick={apply} disabled={saving} className="mt-3 w-full">
      {saving ? "Updating…" : `Use this schedule (every ${intervalDays} days)`}
    </Button>
  );
}
