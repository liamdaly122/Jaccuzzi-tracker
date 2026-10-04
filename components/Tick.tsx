"use client";

// The round tick used by every checklist: Today, the job sheet and guides.
// The circle is 28px but the button is a full 44px target.
import Icon from "./Icon";

export default function Tick({
  done,
  label,
  onClick,
  className = "",
}: {
  done: boolean;
  /** What's being ticked, read out as "Mark done: …" or "Undo: …". */
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={`${done ? "Undo" : "Mark done"}: ${label}`}
      className={`-my-2 -ml-2 -mr-1.5 grid h-11 w-11 shrink-0 place-items-center ${className}`}
    >
      <span
        className={`grid h-7 w-7 place-items-center rounded-full border-2 transition-colors ${
          done ? "border-accent bg-accent text-on-accent" : "border-ink-3 text-transparent"
        }`}
      >
        <Icon name="check" size={16} strokeWidth={3} />
      </span>
    </button>
  );
}
