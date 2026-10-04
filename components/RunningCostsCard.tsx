// =============================================================================
//  components/RunningCostsCard.tsx
//  What the tub costs to run, where the energy goes, and the insulation figure
//  every number rests on. The longer explanations sit behind "Why?".
// =============================================================================

import InsulationInput from "./InsulationInput";
import WhyButton from "./WhyButton";
import { Card } from "./ui";
import type { HeatLossBasis } from "@/lib/heating";
import type { RunningCostSummary, SeasonalComparison } from "@/lib/costs";

const money = (n: number) =>
  n < 1 ? `${Math.round(n * 100)}p` : `£${n.toFixed(n < 10 ? 2 : 0)}`;

const BASIS: Record<HeatLossBasis, string> = {
  measured: "measured by your probe",
  setting: "the figure you entered",
  estimated: "a guess for an uncovered tub, so these costs are likely too high",
};

export default function RunningCostsCard({
  summary,
  seasonal,
  basis,
  standingLossCPerH,
  impliedU,
  pricePerKwh,
  deltaTK,
  volumeLitres,
  ambientC,
}: {
  summary: RunningCostSummary;
  seasonal: SeasonalComparison | null;
  basis: HeatLossBasis;
  standingLossCPerH: number;
  impliedU: number;
  pricePerKwh: number;
  deltaTK: number;
  volumeLitres: number;
  ambientC: number;
}) {
  const d = summary.daily;
  const parts: [string, number][] = [
    ["Keeping it warm", d.standingKwh],
    ["Lid off while you soak", d.soakKwh],
    ["Filter pump", d.filterKwh],
  ];
  const biggest = Math.max(...parts.map(([, v]) => v), 0.01);

  return (
    <Card>
      <p className="text-[30px] font-extrabold leading-none tracking-tight">
        {money(d.cost)}
        <small className="ml-1.5 text-[15px] font-semibold tracking-normal text-ink-3">a day</small>
      </p>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        About {money(summary.monthlyCost)} a month, and {money(summary.annualCost.low)}–
        {money(summary.annualCost.high)} a year depending on the winter.
        {summary.perSessionCost !== null ? ` Roughly ${money(summary.perSessionCost)} a soak.` : ""}
      </p>

      <div
        className="mt-3.5 grid gap-2.5"
        role="img"
        aria-label={`Each day: ${parts.map(([l, v]) => `${l.toLowerCase()} ${v} kWh`).join(", ")}`}
      >
        {parts.map(([label, kwh]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 text-sm">
            <span>{label}</span>
            <span className="num-tabular">{kwh.toFixed(2)} kWh</span>
            <div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-track" aria-hidden>
              <div className="h-full min-w-[6px] rounded-r-full bg-accent" style={{ width: `${(kwh / biggest) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[13.5px] text-ink-2">
        At {(pricePerKwh * 100).toFixed(2)}p a kWh and today&apos;s average of{" "}
        {ambientC.toFixed(1)}° outside. Your covers lose {standingLossCPerH}° an hour,{" "}
        {BASIS[basis]}.
      </p>

      {seasonal ? (
        <p className="mt-2 text-[13.5px] text-ink-2">
          Shutting down from November to March would save about{" "}
          <b>{money(seasonal.saving)}</b> a year.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3">
        <WhyButton title="Where these numbers come from" label="How is this worked out?">
          <p>
            Most of the cost is heat leaking away while the tub sits at temperature,
            so the insulation figure drives almost everything here. Yours works out
            at about {impliedU.toFixed(2)} W/m²K.
          </p>
          <p>
            Manufacturers&apos; cover figures rarely say how they were tested. A
            measurement of your own tub beats any of them, which is why the probe
            keeps checking how fast it cools with the covers on.
          </p>
        </WhyButton>
      </div>
      <InsulationInput deltaTK={deltaTK} volumeLitres={volumeLitres} hasSaved={basis === "setting"} />
    </Card>
  );
}
