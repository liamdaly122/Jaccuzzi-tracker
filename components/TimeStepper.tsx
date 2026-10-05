"use client";

// =============================================================================
//  components/TimeStepper.tsx
//  A clock time as − 19:30 +, in quarter hours, drawn exactly like Stepper so
//  the two sit level in a card. Tapping the time itself opens the phone's own
//  time wheel: a see-through native time input lies over the figure. Safari
//  draws a visible time input at its own size and shape, which is what threw
//  the Heat tab's layout out on iPhone; an invisible one can't.
// =============================================================================

import Icon from "./Icon";
import { stepTime } from "@/lib/clock";

export default function TimeStepper({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  /** Accessible name, e.g. "Ready-by time". */
  label: string;
  /** "HH:MM", or "" before it's known. */
  value: string;
  onChange: (next: string) => void;
}) {
  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" className={btn} aria-label={`Earlier ${label.toLowerCase()}`} onClick={() => onChange(stepTime(value, -1))}>
        <Icon name="minus" size={20} />
      </button>
      <label htmlFor={id} className="relative grid h-11 w-[64px] place-items-center">
        <span aria-hidden className="num-tabular text-[19px] font-extrabold leading-tight">
          {value || "–"}
        </span>
        <input
          id={id}
          type="time"
          aria-label={label}
          value={value}
          step={60}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onClick={(e) => {
            // Desktop browsers need asking; phones open their wheel on tap.
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Not allowed here; typing still works.
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
        />
      </label>
      <button type="button" className={btn} aria-label={`Later ${label.toLowerCase()}`} onClick={() => onChange(stepTime(value, 1))}>
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}
