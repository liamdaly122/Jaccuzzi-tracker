"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Today", icon: "🏠" },
  { href: "/readings/new", label: "Test", icon: "🧪" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/tasks", label: "Upkeep", icon: "✅" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl">🛁</span>
          <span className="font-bold text-slate-800">Hot Tub Tracker</span>
        </Link>
        <button
          onClick={logout}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 border-t border-slate-200 bg-white">
        <div className="grid grid-cols-5">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  active ? "text-brand-600" : "text-slate-400"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
