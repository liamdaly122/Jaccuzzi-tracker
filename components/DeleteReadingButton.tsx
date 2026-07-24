"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteReadingButton({ readingId }: { readingId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    setDeleting(true);
    const res = await fetch(`/api/readings/${readingId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-slate-400 hover:text-red-600"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        onClick={del}
        disabled={deleting}
        className="font-semibold text-red-600"
      >
        {deleting ? "…" : "Confirm"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-slate-400">
        Cancel
      </button>
    </span>
  );
}
