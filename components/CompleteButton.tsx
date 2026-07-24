"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export default function CompleteButton({
  taskId,
  label = "Mark done",
}: {
  taskId: number;
  label?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function complete() {
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  return (
    <Button variant="secondary" onClick={complete} disabled={saving}>
      {saving ? "…" : label}
    </Button>
  );
}
