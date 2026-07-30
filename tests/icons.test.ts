import { describe, it, expect } from "vitest";
import { ICON_NAMES, isIconName, type IconName } from "../lib/icons";
import { ICON_PATHS } from "../lib/iconPaths";
import { GUIDES } from "../lib/guides";
import { TIPS } from "../lib/tips";
import { listSymptoms } from "../lib/troubleshoot";
import { buildStartupPlan } from "../lib/startup";
import { taskTypeIcons } from "../lib/display";

describe("icon set", () => {
  it("has unique names", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("implements every declared name (catches missing glyphs)", () => {
    const implemented = Object.keys(ICON_PATHS);
    const missing = ICON_NAMES.filter((n) => !implemented.includes(n));
    expect(missing).toEqual([]);
  });

  it("declares every implemented name (catches stray glyphs)", () => {
    const extra = Object.keys(ICON_PATHS).filter(
      (n) => !(ICON_NAMES as readonly string[]).includes(n),
    );
    expect(extra).toEqual([]);
  });

  it("every glyph actually draws something", () => {
    const empty = Object.entries(ICON_PATHS)
      .filter(([, parts]) => parts.length === 0)
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });

  it("isIconName guards correctly", () => {
    expect(isIconName("droplet")).toBe(true);
    expect(isIconName("not-a-real-icon")).toBe(false);
  });
});

describe("data modules reference only valid icons", () => {
  const assertValid = (names: string[], where: string) => {
    const bad = names.filter((n) => !isIconName(n));
    expect(bad, `invalid icon name(s) in ${where}`).toEqual([]);
  };

  it("task types", () => {
    assertValid(Object.values(taskTypeIcons), "taskTypeIcons");
  });

  it("guides", () => {
    assertValid(
      GUIDES.map((g) => g.icon as string),
      "GUIDES",
    );
  });

  it("tips", () => {
    assertValid(
      TIPS.map((t) => t.icon as string),
      "TIPS",
    );
  });

  it("troubleshoot symptoms", () => {
    assertValid(
      listSymptoms().map((s) => s.icon as string),
      "symptoms",
    );
  });

  it("startup stages (both chemistries)", () => {
    const names: IconName[] = [
      ...buildStartupPlan("chlorine", 1050).map((s) => s.icon),
      ...buildStartupPlan("bromine", 1050).map((s) => s.icon),
    ];
    assertValid(names as string[], "startup stages");
  });
});
