import { describe, it, expect } from "vitest";
import {
  weatherAdvice,
  type WeatherForecast,
  FROST_C,
  HEAT_C,
} from "../lib/weather";

function fc(days: Partial<WeatherForecast["days"][number]>[]): WeatherForecast {
  return {
    days: days.map((d, i) => ({
      date: `2026-08-0${i + 1}`,
      tempMax: 20,
      tempMin: 12,
      uvMax: 4,
      precipMm: 0,
      ...d,
    })),
  };
}

describe("weatherAdvice", () => {
  it("warns about frost when a night dips to/below the threshold", () => {
    const a = weatherAdvice(fc([{ tempMin: FROST_C }]), "chlorine");
    expect(a.some((x) => x.code === "frost")).toBe(true);
    expect(a.find((x) => x.code === "frost")!.severity).toBe("warning");
  });

  it("does not warn about frost on a mild night", () => {
    const a = weatherAdvice(fc([{ tempMin: 8 }]), "chlorine");
    expect(a.some((x) => x.code === "frost")).toBe(false);
  });

  it("flags heat by temperature and names the sanitizer", () => {
    const a = weatherAdvice(fc([{ tempMax: HEAT_C }]), "bromine");
    const heat = a.find((x) => x.code === "heat");
    expect(heat).toBeDefined();
    expect(heat!.message.toLowerCase()).toContain("bromine");
  });

  it("flags heat by high UV even when temperature is moderate", () => {
    const a = weatherAdvice(fc([{ tempMax: 22, uvMax: 8 }]), "chlorine");
    expect(a.some((x) => x.code === "heat")).toBe(true);
  });

  it("flags heavy rain", () => {
    const a = weatherAdvice(fc([{ precipMm: 15 }]), "chlorine");
    expect(a.some((x) => x.code === "rain")).toBe(true);
  });

  it("returns nothing for calm, mild weather", () => {
    const a = weatherAdvice(fc([{ tempMax: 22, tempMin: 12, uvMax: 4, precipMm: 1 }]), "chlorine");
    expect(a).toHaveLength(0);
  });

  it("handles an empty forecast without throwing", () => {
    expect(weatherAdvice({ days: [] }, "chlorine")).toHaveLength(0);
  });

  it("ignores days with non-finite temps", () => {
    const a = weatherAdvice(fc([{ tempMax: NaN, tempMin: NaN }]), "chlorine");
    expect(a).toHaveLength(0);
  });
});
