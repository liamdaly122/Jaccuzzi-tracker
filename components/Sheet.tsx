"use client";

// =============================================================================
//  components/Sheet.tsx
//  A bottom sheet: slides up over a dimmed screen, closes on Esc, the close
//  button or a tap outside, keeps keyboard focus inside while open, and hands
//  focus back to whatever opened it. Rendered into <body> so no parent's
//  transform or overflow can clip it.
// =============================================================================

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-sheet-close]")?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = Array.from(
      panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex="0"]',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-sheet grid max-h-[calc(100%-20px-env(safe-area-inset-top,0px))] w-full max-w-[440px] content-start gap-4 overflow-y-auto overscroll-contain rounded-t-3xl bg-bg px-4 pb-[calc(22px+env(safe-area-inset-bottom,0px))] pt-1.5 shadow-2xl"
      >
        <div className="mx-auto mt-1 h-[5px] w-10 rounded-full bg-line" aria-hidden />
        <div className="flex items-center gap-2.5">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-[23px] font-extrabold leading-tight tracking-tight [text-wrap:balance]"
          >
            {title}
          </h2>
          <button
            type="button"
            data-sheet-close
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
