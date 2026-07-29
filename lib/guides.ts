// =============================================================================
//  lib/guides.ts
//  Static, plain-English step-by-step routines for the fiddly hot-tub jobs.
//  Pure data — no I/O. Content is general guidance; the app reminds users to
//  confirm doses against their product label and use the Test screen for exact
//  amounts.
// =============================================================================

export interface GuideStep {
  title: string;
  detail: string;
  tip?: string;
}

export interface Guide {
  key: string;
  title: string;
  emoji: string;
  intro: string;
  // Some guides map onto a maintenance task, so finishing can tick it off.
  completesTaskKey?: string;
  // Whether finishing should also reset the usage/water-freshness counter.
  resetsUsage?: boolean;
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    key: "fresh-fill-startup",
    title: "Fresh-fill startup",
    emoji: "🚿",
    intro:
      "Starting with brand-new water? Follow these steps in order to get the water balanced and safe. Balance always goes: alkalinity → pH → sanitizer → shock.",
    steps: [
      {
        title: "Fill the tub",
        detail:
          "Fill to the marked line with fresh cold water. Filling through the filter housing (never leave the pump running dry) helps avoid airlocks.",
        tip: "Filling from a garden hose is fine. If you have very hard tap water, that's normal — you'll balance it next.",
      },
      {
        title: "Switch on and start heating",
        detail:
          "Turn the tub on and set your target temperature (many people use 37–38°C). Balancing works best once the water is circulating.",
      },
      {
        title: "Test the water",
        detail:
          "Dip a test strip and enter the numbers on the Test screen. That gives you exact amounts for the next steps.",
        tip: "Fresh tap water is often low in everything — don't worry, that's expected.",
      },
      {
        title: "Balance alkalinity first",
        detail:
          "Alkalinity is the buffer that keeps pH stable, so always set it first. Add the amount the Test screen suggests, run the pump to mix, wait, then retest.",
      },
      {
        title: "Then adjust pH",
        detail:
          "With alkalinity in range, nudge pH into 7.4–7.6. Add small amounts, circulate, and retest — pH doesn't move in a straight line.",
      },
      {
        title: "Add your sanitizer",
        detail:
          "On chlorine: add the granule dose the app suggests. On bromine with fresh water: build your 'bromide bank' with sodium bromide, then activate it with shock. Aim for 3–5 ppm.",
        tip: "In bromine tubs, keep tablets topped up in the floating dispenser for day-to-day levels.",
      },
      {
        title: "Shock the water",
        detail:
          "Add a dose of non-chlorine shock (MPS) with the pump running and the cover off for a bit. This clears anything the sanitizer hasn't yet.",
      },
      {
        title: "Retest before you get in",
        detail:
          "Wait until sanitizer settles into range and pH is 7.4–7.6, then do a final test. If the app shows a red warning, don't get in until it's cleared.",
      },
    ],
  },
  {
    key: "drain-and-refill-day",
    title: "Drain & refill day",
    emoji: "🧽",
    completesTaskKey: "drain_refill",
    resetsUsage: true,
    intro:
      "Time to swap the water out. This resets your water-freshness counter. Set aside an hour or two, mostly waiting for draining and refilling.",
    steps: [
      {
        title: "Turn off and unplug",
        detail:
          "Switch the tub off at the control unit and unplug it before you start draining. Never drain with the heater or pump running.",
      },
      {
        title: "Optional: flush the pipes",
        detail:
          "If you have a pipe-cleaning product, add it to the old water and run the jets for 10–15 minutes first. It clears gunk (biofilm) from inside the plumbing before you drain.",
        tip: "Doing this every couple of changes keeps the water clearer for longer.",
      },
      {
        title: "Drain the old water",
        detail:
          "Attach the drain hose and let it empty somewhere it won't flood — old spa water is fine on the lawn once sanitizer has dropped, but not straight onto delicate plants.",
      },
      {
        title: "Wipe down the shell",
        detail:
          "While it's empty, wipe the inside with a soft cloth and a spa-safe surface cleaner. Avoid household detergents — they cause foam.",
      },
      {
        title: "Clean or replace the filter",
        detail:
          "Give the filter cartridge a good rinse, a chemical soak if it's due, or swap it for a new one if it's worn. A clean filter is half the battle for clear water.",
      },
      {
        title: "Refill with fresh water",
        detail: "Refill to the line with fresh cold water, as in a fresh fill.",
      },
      {
        title: "Heat and balance",
        detail:
          "Switch on, set your temperature, then balance the new water: alkalinity → pH → sanitizer → shock, using the Test screen for amounts. (The Fresh-fill startup guide walks through this.)",
      },
      {
        title: "Mark it done",
        detail:
          "Tick this off to reset your drain & refill schedule and your water-freshness counter, so the app starts tracking the new water.",
      },
    ],
  },
];

export function getGuide(key: string): Guide | undefined {
  return GUIDES.find((g) => g.key === key);
}
