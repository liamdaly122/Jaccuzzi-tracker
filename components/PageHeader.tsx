// The top of every screen: a big title, a quiet line under it, and either the
// settings button (on Today) or a back link (on sub-pages).
import Link from "next/link";
import Icon from "./Icon";

export default function PageHeader({
  title,
  subtitle,
  settings = false,
  back,
}: {
  title: string;
  subtitle?: string;
  settings?: boolean;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex items-start gap-3 pb-1 pt-2">
      {back ? (
        <Link
          href={back.href}
          aria-label={back.label}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2"
        >
          <Icon name="chevron" size={20} className="rotate-90" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-[30px] font-extrabold leading-[1.06] tracking-tight [text-wrap:balance]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      {settings ? (
        <Link
          href="/settings"
          aria-label="Settings"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2"
        >
          <Icon name="sliders" size={20} />
        </Link>
      ) : null}
    </header>
  );
}
