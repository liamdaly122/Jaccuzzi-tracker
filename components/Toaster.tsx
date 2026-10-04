"use client";

// =============================================================================
//  components/Toaster.tsx
//  One short message at a time, just above the tab bar, with an optional Undo.
//  Ticking things off is a single tap, so a mis-tap has to be one tap to undo.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastFn = (message: string, opts?: { undo?: () => void | Promise<void> }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{
    id: number;
    message: string;
    undo?: () => void | Promise<void>;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<ToastFn>((message, opts) => {
    setCurrent({ id: Date.now(), message, undo: opts?.undo });
  }, []);

  useEffect(() => {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), current.undo ? 6000 : 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4"
      >
        {current ? (
          <div
            key={current.id}
            className="anim-toast pointer-events-auto flex min-h-[52px] w-full max-w-[408px] items-center gap-2.5 rounded-[14px] bg-ink py-1.5 pl-4 pr-1.5 text-[14.5px] font-semibold text-bg shadow-2xl"
          >
            <span className="min-w-0 flex-1">{current.message}</span>
            {current.undo ? (
              <button
                type="button"
                className="min-h-11 shrink-0 px-3 font-extrabold underline underline-offset-[3px]"
                onClick={async () => {
                  const undo = current.undo;
                  setCurrent(null);
                  await undo?.();
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
