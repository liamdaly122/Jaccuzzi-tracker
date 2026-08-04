"use client";

import { useState } from "react";
import Icon from "./Icon";
import type { IopoolPool } from "@/lib/iopool-parse";

interface Props {
  /** Called with the live probe values so the parent can pre-fill its fields. */
  onValues: (pool: IopoolPool) => void;
  className?: string;
}

// "Read my probe" — pulls the latest pH / ORP / temperature straight from the
// iopool EcO. Shared by the reading form and the setup wizard.
export default function IopoolButton({ onValues, className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<IopoolPool | null>(null);

  async function read() {
    setLoading(true);
    setError(null);
    setFilled(null);
    try {
      const res = await fetch("/api/iopool");
      const data = await res.json();
      if (res.ok && data.pool) {
        const pool = data.pool as IopoolPool;
        onValues(pool);
        setFilled(pool);
      } else {
        setError(data.error || "Couldn't read your probe just now.");
      }
    } catch {
      setError("Couldn't read your probe just now.");
    } finally {
      setLoading(false);
    }
  }

  const m = filled?.measure;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={read}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
      >
        <Icon name="bolt" size={18} />
        {loading ? "Reading your probe…" : "Read my iopool probe"}
      </button>

      {m ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Icon name="check-circle" size={13} className="mr-1 inline align-[-2px]" />
          Read from your probe
          {m.ageMinutes !== null
            ? m.ageMinutes < 60
              ? ` ${m.ageMinutes} min ago`
              : ` ${Math.round(m.ageMinutes / 60)} h ago`
            : ""}
          .{" "}
          {m.isValid
            ? "Alkalinity isn't measured by the probe — add it from a strip."
            : "Your probe says this reading is still settling, so treat it as rough."}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-slate-500">{error}</p> : null}
    </div>
  );
}
