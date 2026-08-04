// =============================================================================
//  components/QuickLinks.tsx
//  The three "go somewhere else" destinations, as one compact row instead of
//  three full-width cards. Navigation shouldn't take up a third of the
//  dashboard's height.
// =============================================================================

import Link from "next/link";
import { Card } from "./ui";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";

const LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/setup", icon: "shower", label: "Fresh water setup" },
  { href: "/troubleshoot", icon: "search", label: "Something wrong?" },
  { href: "/guides", icon: "clipboard", label: "Guides & help" },
];

export default function QuickLinks() {
  return (
    <Card>
      <div className="grid grid-cols-3 gap-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition hover:bg-slate-50"
          >
            <Icon name={l.icon} size={24} className="text-brand-600" />
            <span className="text-xs font-medium leading-tight text-slate-700">
              {l.label}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
