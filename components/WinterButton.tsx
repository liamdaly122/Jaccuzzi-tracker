"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import type { WinterStrategy } from "@/lib/winter";

// Puts the tub into (or out of) hibernation. Shutting down is a real decision
// with a real consequence — the app goes quiet for months — so it asks first.
export default function WinterButton({
  action,
  strategy,
  label,
  confirm,
}: {
  action: "hibernate" | "wake";
  strategy?: WinterStrategy;
  label: string;
  /** Overrides the default confirmation text when the consequence differs. */
  confirm?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirming" | "saving">("idle");

  async function submit() {
    setState("saving");
    const res = await fetch("/api/winter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, strategy: strategy ?? null }),
    });
    if (res.ok) {
      router.refresh();
      setState("idle");
    } else {
      setState("confirming");
    }
  }

  if (state === "idle") {
    return (
      <Button
        variant={action === "wake" ? "primary" : "secondary"}
        className="w-full"
        onClick={() => setState("confirming")}
      >
        {label}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm text-slate-700">
        {confirm ??
          (action === "hibernate"
          ? "This stops the testing reminders and the daily check until you wake it up again. Frost warnings carry on if the tub is staying outside."
          : "This starts the reminders and the daily check again. You'll want to run the fresh water setup once it's filled.")}
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={submit} disabled={state === "saving"} className="flex-1">
          {state === "saving" ? "Saving…" : "Yes, do it"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setState("idle")}
          disabled={state === "saving"}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
