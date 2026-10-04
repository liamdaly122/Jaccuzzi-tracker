"use client";

// Tick a job off, with Undo in the toast. One place for this, so Today, Care,
// the calendar and the log sheet all behave the same way.
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toaster";

export function useCompleteJob() {
  const router = useRouter();
  const toast = useToast();

  return useCallback(
    async (taskId: number, name: string, opts?: { onUndone?: () => void }): Promise<boolean> => {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => null);
      if (!res?.ok) {
        toast("That didn't save. Check your connection and try again.");
        return false;
      }
      router.refresh();
      toast(`${name}: done`, {
        undo: async () => {
          const undo = await fetch(`/api/tasks/${taskId}/complete`, { method: "DELETE" }).catch(
            () => null,
          );
          if (undo?.ok) {
            opts?.onUndone?.();
            router.refresh();
            toast(`${name}: not done`);
          } else {
            toast("Too late to undo that one.");
          }
        },
      });
      return true;
    },
    [router, toast],
  );
}
