// =============================================================================
//  components/Icon.tsx
//  A dependency-free inline-SVG icon renderer. Geometry lives in the pure data
//  module lib/iconPaths.ts (so the set is unit-testable without a JSX
//  transform); this component just draws it. Every glyph shares a 24x24 grid
//  with currentColor strokes, so icons inherit text colour and stay crisp at
//  any size — and look identical on every phone, unlike emoji.
//
//  Decorative by default (aria-hidden). Pass `label` when the icon alone
//  carries meaning, and it becomes role="img" with an accessible name.
// =============================================================================

import type { IconName } from "@/lib/icons";
import { ICON_PATHS } from "@/lib/iconPaths";

const SIZES = { sm: 16, md: 20, lg: 24, xl: 44 } as const;

interface Props {
  name: IconName;
  size?: keyof typeof SIZES | number;
  className?: string;
  /** Provide when the icon alone carries meaning; otherwise it's decorative. */
  label?: string;
  strokeWidth?: number;
}

export default function Icon({
  name,
  size = "lg",
  className = "",
  label,
  strokeWidth = 1.75,
}: Props) {
  const px = typeof size === "number" ? size : SIZES[size];
  const parts = ICON_PATHS[name] ?? [];

  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {parts.map((part, i) => {
        if (part.t === "path") {
          return (
            <path
              key={i}
              d={part.d}
              fill={part.solid ? "currentColor" : undefined}
              stroke={part.solid ? "none" : undefined}
            />
          );
        }
        if (part.t === "circle") {
          return (
            <circle
              key={i}
              cx={part.cx}
              cy={part.cy}
              r={part.r}
              fill={part.solid ? "currentColor" : undefined}
              stroke={part.solid ? "none" : undefined}
            />
          );
        }
        return (
          <rect
            key={i}
            x={part.x}
            y={part.y}
            width={part.w}
            height={part.h}
            rx={part.rx}
          />
        );
      })}
    </svg>
  );
}
