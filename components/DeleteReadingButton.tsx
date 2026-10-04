"use client";

// Delete a saved test, after a second tap to confirm.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toaster";

export default function DeleteReadingButton({ readingId }: { readingId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    setDeleting(true);
    const res = await fetch(`/api/readings/${readingId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      toast("Test deleted");
      router.refresh();
    } else {
      toast("That didn't delete. Try again in a moment.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  const btn = "min-h-10 rounded-ctl px-2.5 text-sm font-bold";
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${btn} shrink-0 text-ink-3 hover:bg-surface-2`}>
        Delete
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={del} disabled={deleting} className={`${btn} bg-bad-soft text-bad-ink`}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={`${btn} text-ink-2 hover:bg-surface-2`}>
        Keep
      </button>
    </span>
  );
}
