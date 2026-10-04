"use client";

import { useState } from "react";
import { Button } from "./ui";
import { useCompleteJob } from "./useCompleteJob";

// "Done" for one job. The toast that follows carries the Undo.
export default function CompleteButton({
  taskId,
  name,
  label = "Done",
}: {
  taskId: number;
  name: string;
  label?: string;
}) {
  const complete = useCompleteJob();
  const [saving, setSaving] = useState(false);

  return (
    <Button
      variant="line"
      size="sm"
      disabled={saving}
      aria-label={`${label}: ${name}`}
      onClick={async () => {
        setSaving(true);
        await complete(taskId, name);
        setSaving(false);
      }}
    >
      {saving ? "…" : label}
    </Button>
  );
}
