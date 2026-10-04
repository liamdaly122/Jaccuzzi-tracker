// =============================================================================
//  lib/icons.ts
//  The canonical list of icon names. Names ONLY (no JSX), so the pure data
//  modules in lib/ can reference icons without importing React, and so the set
//  stays unit-testable: a test asserts components/Icon.tsx implements every name
//  here, which catches typos and missing glyphs at build time.
// =============================================================================

export const ICON_NAMES = [
  // Core water chemistry
  "droplet",
  "flask",
  "balance",
  "flame",
  "bolt",
  "rock",
  "sponge",
  "bromine",
  // Maintenance / tasks
  "filter",
  "shower",
  "sparkle",
  "bucket",
  "thermometer",
  "ruler",
  // Navigation
  "home",
  "calendar",
  "check-circle",
  "cog",
  "bath",
  // Status / meta
  "chart-line",
  "clipboard",
  "search",
  "trend-up",
  "target",
  "pin",
  "camera",
  "hourglass",
  "moon",
  "bulb",
  "sparkles",
  "scroll",
  "alert-triangle",
  "check-seal",
  "party",
  // Troubleshooting symptoms
  "cloud",
  "bubbles",
  "leaf",
  "nose",
  "person",
  "eye",
  "drain",
  "snowflake",
  "sun",
  "chevron",
  // Controls
  "plus",
  "minus",
  "check",
  "close",
  "refresh",
  "sliders",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}
