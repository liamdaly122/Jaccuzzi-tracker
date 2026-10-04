"use client";

import { useState } from "react";
import Icon from "./Icon";
import type { IopoolPool } from "@/lib/iopool-parse";

export interface SourceMessage {
  tone: "good" | "warn" | "neutral";
  text: string;
}

interface Props {
  /** Called with the live probe values so the parent can pre-fill its fields. */
  onValues: (pool: IopoolPool) => void;
  /** When given, the parent shows the status line instead of this button. */
  onMessage?: (m: SourceMessage | null) => void;
  label?: string;
  className?: string;
}

// "Use my probe": pulls the latest pH, ORP and temperature straight from the
// iopool EcO. Shared by the test form and the setup wizard.
export default function IopoolButton({ onValues, onMessage, label = "Use my probe", className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<SourceMessage | null>(null);

  const say = (m: SourceMessage | null) => {
    setMessage(m);
    onMessage?.(m);
  };

  async function read() {
    setLoading(true);
    say(null);
    try {
      const res = await fetch("/api/iopool?fresh=1");
      const data = await res.json();
      if (res.ok && data.pool) {
        const pool = data.pool as IopoolPool;
        onValues(pool);
        const m = pool.measure;
        const ago =
          m.ageMinutes === null
            ? ""
            : m.ageMinutes < 60
              ? `, ${m.ageMinutes} min ago`
              : `, ${Math.round(m.ageMinutes / 60)} h ago`;
        say(
          m.isValid
            ? { tone: "good", text: `pH and ORP filled from your probe${ago}. Alkalinity still needs a strip.` }
            : { tone: "warn", text: `Filled from your probe${ago}, but it says the reading is still settling, so treat it as rough.` },
        );
      } else {
        say({ tone: "neutral", text: data.error || "Couldn't read your probe just now." });
      }
    } catch {
      say({ tone: "neutral", text: "Couldn't read your probe just now." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={read}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-ctl border border-line bg-surface px-4 py-2.5 text-[15px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-60"
      >
        <Icon name="bolt" size={18} className="text-accent-ink" />
        {loading ? "Reading your probe…" : label}
      </button>
      {message && !onMessage ? <SourceLine message={message} /> : null}
    </div>
  );
}

const LINE_TONE = { good: "text-good-ink", warn: "text-warn-ink", neutral: "text-ink-2" };

/** The one line under the source buttons saying what got filled in. */
export function SourceLine({ message }: { message: SourceMessage }) {
  return (
    <p className={`mt-2 flex items-start gap-2 text-[13.5px] font-semibold leading-snug ${LINE_TONE[message.tone]}`}>
      <Icon name={message.tone === "good" ? "check-circle" : "alert-triangle"} size={16} className="mt-px shrink-0" />
      <span>{message.text}</span>
    </p>
  );
}
