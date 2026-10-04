"use client";

// "Why?" — the explanation lives one tap away instead of on the screen. Keeps
// cards short without hiding the reasoning from anyone who wants it.
import { useState, type ReactNode } from "react";
import Sheet from "./Sheet";
import { Button } from "./ui";

export default function WhyButton({
  title,
  label = "Why?",
  children,
  className = "",
}: {
  title: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`-my-2.5 py-2.5 font-bold text-accent-ink underline decoration-[1.5px] underline-offset-[3px] ${className}`}
      >
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="grid gap-2.5 text-[15px] leading-relaxed text-ink-2">{children}</div>
        <Button variant="quiet" block onClick={() => setOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  );
}
