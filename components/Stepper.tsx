"use client";

// =============================================================================
//  components/Stepper.tsx
//  − value + with big thumb-sized buttons. The value in the middle is a real
//  input too, so a number can also be typed straight in.
// =============================================================================

import { useEffect, useState } from "react";
import Icon from "./Icon";

export default function Stepper({
  id,
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  decimals = 0,
  unit,
  start,
}: {
  id: string;
  /** Accessible name, e.g. "pH". */
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  /** What the first tap on a blank value gives: a typical reading, not zero. */
  start?: number;
}) {
  const fmt = (n: number | null) => (n === null ? "" : n.toFixed(decimals));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (n: number) =>
    Math.round(Math.min(max, Math.max(min, n)) * 10 ** decimals) / 10 ** decimals;
  const bump = (dir: 1 | -1) =>
    onChange(
      value === null
        ? clamp(start ?? (dir > 0 ? min + step : min))
        : clamp(value + dir * step),
    );

  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink disabled:opacity-40";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        className={btn}
        aria-label={`Lower ${label}`}
        onClick={() => bump(-1)}
        disabled={value !== null && value <= min}
      >
        <Icon name="minus" size={20} />
      </button>
      <label className="grid w-[64px] justify-items-center leading-tight" htmlFor={id}>
        <input
          id={id}
          inputMode="decimal"
          aria-label={label}
          className="num-tabular w-full bg-transparent text-center text-[19px] font-extrabold outline-none"
          value={text}
          placeholder="–"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text.replace(",", "."));
            if (text.trim() === "") onChange(null);
            else if (Number.isFinite(n)) onChange(clamp(n));
            else setText(fmt(value));
          }}
        />
        {unit ? <span className="text-[11.5px] font-semibold text-ink-3">{unit}</span> : null}
      </label>
      <button
        type="button"
        className={btn}
        aria-label={`Raise ${label}`}
        onClick={() => bump(1)}
        disabled={value !== null && value >= max}
      >
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}
