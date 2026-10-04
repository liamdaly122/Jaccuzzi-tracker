"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { useToast } from "./Toaster";
import type { WinterStrategy } from "@/lib/winter";

// Records a winter plan, or clears it. Packing away quietens the app for
// months, so it asks first and says what will happen.
export default function WinterButton({
  action,
  strategy,
  label,
  confirm,
  variant = "line",
}: {
  action: "hibernate" | "wake";
  strategy?: WinterStrategy;
  label: string;
  /** Overrides the default confirmation text when the consequence differs. */
  confirm?: string;
  variant?: "line" | "primary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<"idle" | "confirming" | "saving">("idle");

  async function submit() {
    setState("saving");
    const res = await fetch("/api/winter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, strategy: strategy ?? null }),
    }).catch(() => null);
    if (res?.ok) {
      toast(action === "wake" ? "Winter plan cleared" : "Winter plan saved");
      router.refresh();
      setState("idle");
    } else {
      toast("That didn't save. Try again in a moment.");
      setState("confirming");
    }
  }

  if (state === "idle") {
    return (
      <Button variant={variant} size="sm" onClick={() => setState("confirming")}>
        {label}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-ctl bg-surface-2 p-3">
      <p className="text-sm text-ink-2">
        {confirm ??
          (action === "hibernate"
            ? "This pauses the test reminders and the daily check until you wake it up. Frost warnings carry on if the tub stays outside."
            : "This starts the reminders and the daily check again. Run the fresh water setup once it's filled.")}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={submit} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Yes, do it"}
        </Button>
        <Button size="sm" variant="line" onClick={() => setState("idle")} disabled={state === "saving"}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
