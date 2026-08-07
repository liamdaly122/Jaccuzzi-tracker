"use client";

// =============================================================================
//  components/CollapsibleCard.tsx
//  A dashboard card that folds away. The Today screen has grown to eight or
//  nine panels; most days you want two of them and the rest are reference.
//
//  Open/closed is remembered per card in localStorage, so tidying it once
//  sticks. Read on mount rather than in the state initialiser, so the server
//  and the first client render agree — the same hydration-safe pattern as
//  components/GuideRunner.tsx.
//
//  DELIBERATELY NOT USED for the "do not use the spa yet" safety banner. A
//  health warning must not be something you can fold away and forget.
// =============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { Card } from "./ui";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";

export default function CollapsibleCard({
  id,
  title,
  icon,
  summary,
  defaultOpen = true,
  className,
  children,
}: {
  /** Stable key for remembering this card's state. */
  id: string;
  title: string;
  icon?: IconName;
  /** One line shown while collapsed, so the card still says something. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const storageKey = `card-open:${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "0") setOpen(false);
      if (saved === "1") setOpen(true);
    } catch {
      // Blocked storage just means the default stands.
    }
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Still works for this session.
      }
      return next;
    });
  }

  return (
    <Card className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {icon ? <Icon name={icon} size={18} className="shrink-0 text-brand-600" /> : null}
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
          {title}
        </span>
        {/* Must be allowed to shrink: a long summary would otherwise push the
            chevron clean off the right edge of the card. On a very narrow phone
            there isn't room for both, and the title is the one you need — so
            the summary drops out entirely rather than truncating the heading. */}
        {!open && summary ? (
          <span className="num-tabular min-w-0 max-w-[55%] truncate text-sm text-slate-500 max-[359px]:hidden">
            {summary}
          </span>
        ) : null}
        <Icon
          name="chevron"
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>

      {open ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
