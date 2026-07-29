// =============================================================================
//  lib/tips.ts
//  Plain-English "what does this actually do?" explainers. Pure data.
// =============================================================================

export interface Tip {
  key: string;
  title: string;
  emoji: string;
  what: string; // what it is / does
  why: string; // why it matters
}

export const TIPS: Tip[] = [
  {
    key: "ph",
    title: "pH",
    emoji: "⚖️",
    what: "A measure of how acidic or alkaline the water is, on a scale of 0–14. You want 7.4–7.6.",
    why: "Too low stings eyes and corrodes the tub; too high makes water cloudy and stops your sanitizer working. It's the balance that makes water feel 'soft' and comfortable.",
  },
  {
    key: "alkalinity",
    title: "Total alkalinity",
    emoji: "🧯",
    what: "The water's buffer — how well it resists sudden pH swings. Aim for 80–120 ppm.",
    why: "Set this first. With good alkalinity, pH stays put; with low alkalinity, pH bounces around and nothing else stays stable.",
  },
  {
    key: "chlorine",
    title: "Chlorine",
    emoji: "💧",
    what: "A sanitizer that kills bacteria and breaks down sweat, oils and other nasties. Aim for 3–5 ppm.",
    why: "It's what keeps the water safe to sit in. In a hot tub it gets used up fast, so you top it up little and often — usually with dichlor granules.",
  },
  {
    key: "bromine",
    title: "Bromine",
    emoji: "🟠",
    what: "An alternative sanitizer, often gentler on skin and better in hot water. Aim for 3–5 ppm.",
    why: "It's usually delivered slowly from tablets in a floating dispenser, and 'reactivated' by shock. Popular for people who find chlorine harsh.",
  },
  {
    key: "shock",
    title: "Shock (MPS)",
    emoji: "⚡",
    what: "A bigger, one-off dose (non-chlorine shock / MPS) that oxidises the gunk your everyday sanitizer leaves behind.",
    why: "Regular shocking keeps water clear and stops that 'used' smell. On bromine, it also re-activates your bromine. Do it weekly, or after heavy use.",
  },
  {
    key: "calcium",
    title: "Calcium hardness",
    emoji: "🪨",
    what: "How much dissolved calcium is in the water. Around 100–250 ppm is typical.",
    why: "Too low can make water corrosive; too high causes scale and cloudiness. It matters less for an inflatable spa, so it's an optional reading.",
  },
  {
    key: "filter",
    title: "The filter",
    emoji: "🧽",
    what: "A cartridge the water passes through to trap dirt, oils and debris.",
    why: "A clean filter does half the work of keeping water clear. Rinse it weekly, give it a chemical soak now and then, and replace it every few months.",
  },
];

export function getTip(key: string): Tip | undefined {
  return TIPS.find((t) => t.key === key);
}
