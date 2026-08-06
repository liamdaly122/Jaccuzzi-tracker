// =============================================================================
//  lib/guides.ts
//  Static, plain-English step-by-step routines for the fiddly hot-tub jobs.
//  Pure data — no I/O. Content is general guidance; the app reminds users to
//  confirm doses against their product label and use the Test screen for exact
//  amounts.
// =============================================================================

import type { IconName } from "./icons";

export interface GuideStep {
  title: string;
  detail: string;
  tip?: string;
}

export interface Guide {
  key: string;
  title: string;
  icon: IconName;
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
    icon: "shower",
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
    icon: "filter",
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
  {
    key: "winterise",
    title: "Winterise & pack away",
    icon: "snowflake",
    intro:
      "Shutting the tub down for the cold months. Set aside an afternoon for the wet work, then a day or two of drying before it goes into storage — don't try to do it all in one go, and don't rush the drying.",
    steps: [
      {
        title: "Pick your day",
        detail:
          "Aim for a dry, breezy day above about 10 °C. Everything has to come out bone dry, and that's far harder in November drizzle — going a fortnight early in decent weather beats going on time in the wet.",
        tip: "If frost is forecast before you can do it, run the heater and keep the cover on until you get a dry day. Never leave it full with the power off.",
      },
      {
        title: "Balance the water one last time (optional)",
        detail:
          "If you're draining onto a lawn or borders, stop dosing a few days beforehand and let the sanitiser fall away. Water with normal chlorine or bromine in it will scorch plants.",
        tip: "Spread the outflow around rather than drowning one patch, and avoid draining straight into a pond.",
      },
      {
        title: "Turn off and unplug",
        detail:
          "Switch off at the control unit and pull the plug out before any water starts moving. Nothing electrical should be live from here on.",
      },
      {
        title: "Drain it fully",
        detail:
          "Screw a garden hose onto the drain valve and run it somewhere it can soak away. Expect it to take a while — there's over a tonne of water in there. Near the end, lift and tilt the far side to chase the last of it towards the valve.",
        tip: "Yours is a HydroJet, so there's water sitting in the internal pipework as well as the tub. Getting that out is the whole point of the next two steps.",
      },
      {
        title: "Clear the pipework and pump",
        detail:
          "With the tub empty, disconnect the pump hoses and let them drain. Tip the pump so any water in the housing runs out. This is the step that saves you a pump: it's trapped water freezing inside the unit that cracks it, not the water in the tub.",
        tip: "Bring the pump indoors for a day or two afterwards so the inside dries out properly, whatever else you decide to do with the tub.",
      },
      {
        title: "Clean the liner",
        detail:
          "Wipe the inside with a soft cloth and a little spa surface cleaner, paying attention to the waterline where scum collects. Rinse off and let the rinse water drain out too.",
      },
      {
        title: "Dry everything — properly",
        detail:
          "Towel out every surface, then leave it open to the air until there is no dampness left anywhere: liner, lid, cover, hoses, filter housing. This is the step people skip and the one that ruins tubs — anything still damp grows mould in storage, and any water left behind freezes and splits the vinyl.",
        tip: "Give it longer than you think. A whole dry day with the lid off is not too much.",
      },
      {
        title: "Take the filter out",
        detail:
          "Remove the filter cartridge. If it's near the end of its life, bin it now so you start the new season fresh; otherwise rinse it, dry it completely and bag it.",
      },
      {
        title: "Deflate",
        detail:
          "Open the inflation valve — turn the outer ring anti-clockwise — and let the air out. It takes about ten minutes. Press down as it goes to push the last of the air out of the walls and floor.",
      },
      {
        title: "Fold with talc",
        detail:
          "Dust the inside and outside lightly with talcum powder before folding. It stops the vinyl sticking to itself over the winter and soaks up any last trace of moisture. Fold loosely along the original creases rather than cramming it.",
      },
      {
        title: "Store it above freezing",
        detail:
          "Liner, lid and cover into a plastic storage box; pump and fittings back in the original carton. Keep it somewhere dry, ventilated and reliably above 6 °C — inside the house, not an unheated garage or a loft, both of which drop below freezing in a cold snap.",
        tip: "It packs down smaller than you'd expect: the folded liner and lid are about the size of a large suitcase, and will go under a bed or on top of a wardrobe.",
      },
      {
        title: "Tell the app you're done",
        detail:
          "Mark the tub as hibernating on the Upkeep screen. The app will stop reminding you to test water that isn't there, and will wake you up again in spring.",
      },
    ],
  },
  {
    key: "spring-wake-up",
    title: "Wake it up in spring",
    icon: "sun",
    intro:
      "Getting the tub back out after the winter. Take it slowly the first time — most winter damage shows up on the first fill, and it's much easier to deal with before there's a tonne of water in the way.",
    steps: [
      {
        title: "Unpack and warm it up",
        detail:
          "Bring everything out and let the liner sit somewhere warm for a few hours before you unfold it. Cold vinyl is stiff and much easier to crease or split.",
      },
      {
        title: "Inspect before you inflate",
        detail:
          "Unfold it in the sun and look over the seams, the floor and around the valves for splits, brittle patches or mould spots. Wipe out any talc residue with a damp cloth.",
      },
      {
        title: "Inflate and leave it standing",
        detail:
          "Inflate to firm — not rock hard — then leave it an hour and check it hasn't sagged. A slow leak is far easier to find now than once it's full.",
      },
      {
        title: "Check the pump before it gets wet",
        detail:
          "Look the pump over for cracks or split hoses, especially if it spent the winter anywhere cold. Fit a fresh filter cartridge.",
        tip: "If anything looks cracked, sort it before filling. A hairline crack becomes a flood once there's pressure behind it.",
      },
      {
        title: "Fill and run the fresh-water setup",
        detail:
          "Fill to the line with fresh cold water, then use the app's Fresh water setup flow — it walks you through commissioning brand-new water from scratch, in the right order.",
      },
      {
        title: "Wake the app up",
        detail:
          "Mark the tub as awake on the Upkeep screen so testing reminders, the calendar and the daily check all start again.",
      },
    ],
  },
];

export function getGuide(key: string): Guide | undefined {
  return GUIDES.find((g) => g.key === key);
}
