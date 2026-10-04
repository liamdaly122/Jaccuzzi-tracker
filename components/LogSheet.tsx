"use client";

// =============================================================================
//  components/LogSheet.tsx
//  The + button. Everything you might record, one tap from any screen: a test,
//  a soak, a chemical, or a job done. Opened by the tab bar and by Today's log
//  buttons, which can jump straight to one of the forms.
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import Stepper from "./Stepper";
import Icon from "./Icon";
import { Button, Card } from "./ui";
import { useToast } from "./Toaster";
import { useCompleteJob } from "./useCompleteJob";
import type { IconName } from "@/lib/icons";

export type LogView = "menu" | "soak" | "chem" | "job";

const CHEMICALS: { key: string; label: string; grams: number }[] = [
  { key: "dichlor", label: "Dichlor", grams: 5 },
  { key: "ph_decreaser", label: "pH down", grams: 13 },
  { key: "ph_increaser", label: "pH up", grams: 13 },
  { key: "ta_increaser", label: "Alkalinity up", grams: 50 },
  { key: "mps_shock", label: "Shock (MPS)", grams: 20 },
  { key: "other", label: "Something else", grams: 10 },
];

interface TaskSummary {
  id: number;
  name: string;
  frequency_days: number;
  last_completed_at: string | null;
}

export default function LogSheet({
  open,
  initial = "menu",
  chemical,
  grams,
  onClose,
}: {
  open: boolean;
  initial?: LogView;
  /** Pre-select a chemical (from a to-do line). */
  chemical?: string;
  grams?: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const complete = useCompleteJob();
  const [view, setView] = useState<LogView>(initial);
  const [people, setPeople] = useState<number | null>(2);
  const [chem, setChem] = useState(chemical ?? "dichlor");
  const [amount, setAmount] = useState<number | null>(grams ?? 5);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setView(initial);
    if (chemical) {
      setChem(chemical);
      setAmount(grams ?? CHEMICALS.find((c) => c.key === chemical)?.grams ?? 5);
    }
  }, [open, initial, chemical, grams]);

  useEffect(() => {
    if (!open || view !== "job" || tasks !== null) return;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => setTasks((d.tasks ?? []) as TaskSummary[]))
      .catch(() => setTasks([]));
  }, [open, view, tasks]);

  async function post(url: string, body: unknown, done: string) {
    setBusy(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onClose();
      toast(done);
      router.refresh();
    } else {
      toast("That didn't save. Check your connection and try again.");
    }
  }

  const title =
    view === "soak" ? "Log a soak" : view === "chem" ? "Add a chemical" : view === "job" ? "Mark a job done" : "Log something";

  const option = (v: LogView | "test", icon: IconName, name: string, sub: string) => (
    <button
      type="button"
      onClick={() => {
        if (v === "test") {
          onClose();
          router.push("/readings/new");
        } else setView(v);
      }}
      className="flex min-h-[68px] w-full items-center gap-3.5 px-3.5 py-3 text-left [&+&]:border-t [&+&]:border-line"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-ink">
        <Icon name={icon} size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{name}</span>
        <span className="block text-[13.5px] text-ink-2">{sub}</span>
      </span>
      <Icon name="chevron" size={16} className="-rotate-90 text-ink-3" />
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {view === "menu" ? (
        <Card flush>
          {option("test", "flask", "Test the water", "Strip, probe or a photo of the strip")}
          {option("soak", "bath", "Log a soak", "Who got in")}
          {option("chem", "droplet", "Add a chemical", "Dichlor, pH, alkalinity, shock")}
          {option("job", "check-circle", "Mark a job done", "Filter, cover, drain and refill")}
        </Card>
      ) : null}

      {view === "soak" ? (
        <>
          <Card flush>
            <div className="flex min-h-[68px] items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="font-bold">Who got in?</p>
                <p className="text-[13px] text-ink-3">People this time</p>
              </div>
              <Stepper id="soak-people" label="people" value={people} onChange={setPeople} min={1} max={20} unit={people === 1 ? "person" : "people"} />
            </div>
          </Card>
          <p className="text-[13.5px] text-ink-2">This feeds your water age and running costs.</p>
          <Button block disabled={busy || !people} onClick={() => post("/api/usage", { bathers: people }, "Soak logged. Enjoy it.")}>
            {busy ? "Saving…" : "Log soak"}
          </Button>
        </>
      ) : null}

      {view === "chem" ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Which chemical">
            {CHEMICALS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={chem === c.key}
                onClick={() => {
                  setChem(c.key);
                  setAmount(c.grams);
                }}
                className="min-h-11 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold aria-pressed:border-accent aria-pressed:shadow-[inset_0_0_0_1px_rgb(var(--accent))]"
              >
                {c.label}
              </button>
            ))}
          </div>
          <Card flush>
            <div className="flex min-h-[68px] items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="font-bold">How much?</p>
                <p className="text-[13px] text-ink-3">Grams</p>
              </div>
              <Stepper id="chem-grams" label="grams" value={amount} onChange={setAmount} min={0} max={2000} step={amount !== null && amount >= 50 ? 5 : 1} decimals={amount !== null && amount < 10 ? 1 : 0} unit="g" />
            </div>
          </Card>
          {chem === "mps_shock" ? (
            <p className="text-[13.5px] text-ink-2">This also ticks off the weekly shock.</p>
          ) : null}
          <Button
            block
            disabled={busy || amount === null}
            onClick={() =>
              post(
                "/api/dosing",
                { chemical: chem, amountGrams: amount ?? 0 },
                `Logged ${amount} g of ${CHEMICALS.find((c) => c.key === chem)?.label.toLowerCase() ?? "chemical"}`,
              )
            }
          >
            {busy ? "Saving…" : "Log it"}
          </Button>
        </>
      ) : null}

      {view === "job" ? (
        <Card flush>
          {tasks === null ? (
            <p className="px-3.5 py-4 text-sm text-ink-2">Loading your jobs…</p>
          ) : tasks.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-2">Couldn&apos;t load your jobs just now.</p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={async () => {
                  onClose();
                  await complete(t.id, t.name);
                }}
                className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-3 text-left [&+&]:border-t [&+&]:border-line"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 font-bold">{t.name}</span>
                <span className="shrink-0 text-[13px] text-ink-3">every {t.frequency_days} d</span>
              </button>
            ))
          )}
        </Card>
      ) : null}

      {view !== "menu" && initial === "menu" ? (
        <Button variant="text" onClick={() => setView("menu")}>
          Back
        </Button>
      ) : null}
    </Sheet>
  );
}
