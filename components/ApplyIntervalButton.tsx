"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { useToast } from "./Toaster";

// One tap: set the drain & refill reminder to the interval worked out from the
// tub's size and how much it's used. The task stays the one source of truth.
export default function ApplyIntervalButton({
  taskId,
  intervalDays,
}: {
  taskId: number;
  intervalDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequencyDays: intervalDays }),
    });
    setSaving(false);
    if (res.ok) {
      toast(`Drain & refill reminder: every ${intervalDays} days`);
      router.refresh();
    } else {
      toast("That didn't save. Try again in a moment.");
    }
  }

  return (
    <Button variant="line" size="sm" onClick={apply} disabled={saving}>
      {saving ? "Saving…" : `Use ${intervalDays} days`}
    </Button>
  );
}
