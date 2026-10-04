// =============================================================================
//  components/ui.tsx
//  The shared building blocks, all drawn from the design tokens in
//  app/globals.css. Colour is chosen by tone (good / warn / bad / heat /
//  accent), never by passing raw colour classes: overrides passed through
//  className used to lose to the base classes and silently render white.
// =============================================================================

import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";
import type { Tone } from "@/lib/display";

export type { Tone };

// --- Card --------------------------------------------------------------------

const cardTones: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  accent: "border-accent/30 bg-accent-soft",
  good: "border-good/30 bg-good-soft",
  warn: "border-warn/40 bg-warn-soft",
  bad: "border-bad/50 bg-bad-soft",
  heat: "border-heat/30 bg-heat-soft",
};

export function Card({
  children,
  className = "",
  tone = "neutral",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  /** No padding — for cards made of full-width rows. */
  flush?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-card border ${cardTones[tone]} ${
        flush ? "overflow-hidden" : "p-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// --- Section header ------------------------------------------------------------

export function SectionHeader({
  children,
  aside,
}: {
  children: ReactNode;
  /** Right-hand slot: a count, a date, or a small link. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 px-0.5">
      <h2 className="min-w-0 text-[12.5px] font-bold uppercase tracking-[0.09em] text-ink-3">
        {children}
      </h2>
      {aside ? (
        <div className="shrink-0 text-[13.5px] font-semibold text-ink-3">{aside}</div>
      ) : null}
    </div>
  );
}

/** A section: header plus its content, spaced consistently. */
export function Section({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2.5">
      <SectionHeader aside={aside}>{title}</SectionHeader>
      {children}
    </section>
  );
}

// --- Chip ----------------------------------------------------------------------

const chipTones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  bad: "bg-bad-soft text-bad-ink",
  heat: "bg-heat-soft text-heat-ink",
};

export function Chip({
  children,
  tone = "neutral",
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold leading-tight ${chipTones[tone]} ${className}`}
    >
      {icon ? <Icon name={icon} size={14} strokeWidth={2.3} /> : null}
      {children}
    </span>
  );
}

// Kept for the screens that still use it; maps the old tone names onto Chip.
type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";
const badgeToTone: Record<BadgeTone, Tone> = {
  green: "good",
  amber: "warn",
  red: "bad",
  blue: "accent",
  slate: "neutral",
};
export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return <Chip tone={badgeToTone[tone]}>{children}</Chip>;
}

// --- Meter ---------------------------------------------------------------------

const meterTones: Record<Tone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  heat: "bg-heat",
};

export function Meter({
  value,
  tone = "accent",
  label,
  className = "",
}: {
  /** 0 to 1. */
  value: number;
  tone?: Tone;
  /** Read out instead of the bar; omit when the text beside it says it. */
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-track ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div
        className={`h-full min-w-[6px] rounded-full ${meterTones[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// --- Callout -------------------------------------------------------------------

export function Callout({
  children,
  tone = "neutral",
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-ctl p-3 text-sm leading-snug ${chipTones[tone]} ${className}`}
    >
      {icon ? <Icon name={icon} size={17} className="mt-0.5 shrink-0" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// --- Rows ----------------------------------------------------------------------

/** One line in a flush card: icon, title, optional sub-line, right-hand slot. */
export function Row({
  icon,
  title,
  sub,
  right,
  href,
}: {
  icon?: IconName;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      {icon ? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-snug">{title}</span>
        {sub ? (
          <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{sub}</span>
        ) : null}
      </span>
      {right}
    </>
  );
  const cls =
    "flex min-h-[60px] items-center gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-line";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-surface-2`}>
      {body}
      <Icon name="chevron" size={16} className="shrink-0 -rotate-90 text-ink-3" />
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// --- Buttons -------------------------------------------------------------------

type Variant = "primary" | "quiet" | "line" | "text" | "danger" | "secondary" | "ghost";

const buttonVariants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent/90",
  quiet: "bg-surface-2 text-ink hover:bg-line/60",
  line: "border border-line bg-surface text-ink hover:bg-surface-2",
  text: "bg-transparent text-accent-ink hover:bg-accent-soft",
  danger: "bg-bad text-white hover:bg-bad/90",
  // Older names, kept so unconverted screens keep working.
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2",
};

const sizes = {
  sm: "min-h-10 px-3 py-2 text-sm",
  md: "min-h-11 px-4 py-2.5 text-[15px]",
  lg: "min-h-[52px] px-5 py-3 text-base",
};

function buttonClass(variant: Variant, size: keyof typeof sizes, block: boolean) {
  return `inline-flex items-center justify-center gap-2 rounded-ctl text-center font-bold leading-tight transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${sizes[size]} ${block ? "w-full" : ""}`;
}

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: keyof typeof sizes;
  block?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${buttonClass(variant, size, block)} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  block?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonClass(variant, size, block)} ${className}`}>
      {children}
    </Link>
  );
}

// --- Forms ---------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[13px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-ctl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";
