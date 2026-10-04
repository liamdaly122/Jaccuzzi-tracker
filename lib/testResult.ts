// =============================================================================
//  lib/testResult.ts
//  What the screen after a test says: the doses to add in order, the notes
//  that aren't doses, which readings were fine, and a heading that says it in
//  a few words. Pure, so the wording rules are tested (tests/testResult.test.ts).
// =============================================================================

import type { CalculationResult, Recommendation, SanitizerType } from "./chemistry";

export interface TestSummary {
  title: string;
  /** Things to add, in the order to add them. */
  doses: Recommendation[];
  /** Advice that isn't a dose. "Do not use" is left to the safety box. */
  notes: Recommendation[];
  /** Readings that need nothing, e.g. ["pH", "Alkalinity"]. */
  fine: string[];
}

const SERIOUS = new Set(["medium", "high", "safety"]);

export function summariseTest(
  result: CalculationResult,
  sanitizerType: SanitizerType,
  tested: { sanitiser: boolean },
): TestSummary {
  const recs = [...result.recommendations].sort((a, b) => a.order - b.order);
  const doses = recs.filter((r) => r.chemical !== null);
  const notes = recs.filter((r) => r.chemical === null && r.severity !== "safety");

  // Alkalinity, pH and sanitiser are orders 1–3. One is fine when nothing
  // needs adding for it and nothing serious was said about it.
  const names: [number, string][] = [
    [1, "Alkalinity"],
    [2, "pH"],
    [3, sanitizerType === "chlorine" ? "Chlorine" : "Bromine"],
  ];
  const fine = names
    .filter(([order]) => order !== 3 || tested.sanitiser)
    .filter(([order]) => !recs.some((r) => r.order === order && (r.chemical !== null || SERIOUS.has(r.severity))))
    .map(([, name]) => name);

  const n = doses.length;
  const title =
    result.safetyFlags.some((f) => f.severity === "danger")
      ? "Don't get in yet"
      : n === 0
        ? "Nothing to add"
        : n === 1
          ? "One thing to add"
          : `${n} things to add, in this order`;

  return { title, doses, notes, fine };
}
