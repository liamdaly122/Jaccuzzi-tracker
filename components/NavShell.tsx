"use client";

// =============================================================================
//  components/NavShell.tsx
//  The frame around every screen: a phone-width column and the tab bar —
//  Today, Water, + Log, Heat, Care. Each screen draws its own header.
//  Sub-pages light up the tab they belong to.
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { IconName } from "@/lib/icons";
import Icon from "./Icon";
import LogSheet from "./LogSheet";
import { ToastProvider } from "./Toaster";

const TABS: { href: string; label: string; icon: IconName; also: string[] }[] = [
  { href: "/dashboard", label: "Today", icon: "home", also: ["/settings"] },
  { href: "/water", label: "Water", icon: "droplet", also: ["/history", "/readings"] },
  { href: "/heat", label: "Heat", icon: "flame", also: [] },
  { href: "/care", label: "Care", icon: "check-circle", also: ["/guides", "/troubleshoot"] },
];

export default function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [logOpen, setLogOpen] = useState(false);

  const isActive = (t: (typeof TABS)[number]) =>
    pathname === t.href ||
    pathname.startsWith(`${t.href}/`) ||
    t.also.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const tab = (t: (typeof TABS)[number]) => {
    const active = isActive(t);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={`grid min-h-[54px] content-end justify-items-center gap-[3px] rounded-ctl px-0.5 pb-1 pt-1.5 text-[11.5px] font-semibold ${
          active ? "text-accent-ink" : "text-ink-3"
        }`}
      >
        <Icon name={t.icon} size={24} strokeWidth={active ? 2.3 : 1.8} />
        {t.label}
      </Link>
    );
  };

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh w-full max-w-[440px]">
        {/* Room at the bottom for the bar, the raised + and the home bar. */}
        <main className="px-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] pt-2">{children}</main>
        {/* Fixed, so it's on screen however far down the page you are. */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-[440px] grid-cols-5 items-end border-t border-line bg-surface px-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] pt-1"
        >
          {tab(TABS[0])}
          {tab(TABS[1])}
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="grid min-h-[54px] content-end justify-items-center gap-[3px] px-0.5 pb-1 text-[11.5px] font-semibold text-ink-2"
            aria-label="Log something"
          >
            <span className="-mt-7 grid h-[58px] w-[58px] place-items-center rounded-full border-4 border-surface bg-accent text-on-accent shadow-lg">
              <Icon name="plus" size={26} strokeWidth={2.6} />
            </span>
            Log
          </button>
          {tab(TABS[2])}
          {tab(TABS[3])}
        </nav>
      </div>
      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} />
    </ToastProvider>
  );
}
