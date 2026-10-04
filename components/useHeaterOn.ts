"use client";

// "I've switched the heater on" for today, remembered on this phone only.
// Shared by Today's to-do list and the Heat tab, so ticking it in one place
// shows in the other. It resets itself tomorrow because the key is the date.
import { useCallback, useEffect, useState } from "react";

const EVENT = "heater-on-change";

function keyFor(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `heater-on:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function read(): boolean {
  try {
    return window.localStorage.getItem(keyFor(new Date())) === "1";
  } catch {
    return false;
  }
}

export function useHeaterOn(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(read());
    const sync = () => setOn(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      const k = keyFor(new Date());
      if (next) window.localStorage.setItem(k, "1");
      else window.localStorage.removeItem(k);
    } catch {
      // Still right for this visit.
    }
    setOn(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [on, set];
}
