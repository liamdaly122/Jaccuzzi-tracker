"use client";

// Today's four big log buttons. Same sheet as the + in the tab bar, opened
// straight at the right form.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import LogSheet, { type LogView } from "./LogSheet";
import { Section } from "./ui";
import type { IconName } from "@/lib/icons";

export default function LogGrid() {
  const router = useRouter();
  const [view, setView] = useState<LogView | null>(null);
  const btn = (icon: IconName, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[84px] min-w-0 flex-col items-start justify-between gap-2.5 rounded-[16px] border border-line bg-surface p-3.5 text-left text-[15px] font-extrabold leading-tight"
    >
      <Icon name={icon} size={26} className="text-accent-ink" />
      {label}
    </button>
  );
  return (
    <Section title="Log something">
      <div className="grid grid-cols-2 gap-2.5">
        {btn("flask", "Test the water", () => router.push("/readings/new"))}
        {btn("bath", "Log a soak", () => setView("soak"))}
        {btn("droplet", "Add a chemical", () => setView("chem"))}
        {btn("check-circle", "Mark a job done", () => setView("job"))}
      </div>
      <LogSheet open={view !== null} initial={view ?? "menu"} onClose={() => setView(null)} />
    </Section>
  );
}
