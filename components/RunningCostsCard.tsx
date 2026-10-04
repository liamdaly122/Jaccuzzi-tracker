// =============================================================================
//  components/RunningCostsCard.tsx
//  What the tub costs to run, and the insulation figure everything rests on.
//
//  Reference rather than glanceable, so it lives collapsed by default. It also
//  carries the keep-warm-vs-reheat comparison, which moved off the heating card
//  — that card should answer "when do I switch on" and nothing else.
// =============================================================================

import Icon from "./Icon";
import InsulationInput from "./InsulationInput";
import type { HeatLossBasis } from "@/lib/heating";
import type { KeepWarmComparison } from "@/lib/heating";
import type { RunningCostSummary, SeasonalComparison } from "@/lib/costs";

const money = (n: number) =>
  n < 1 ? `${Math.round(n * 100)}p` : `£${n.toFixed(n < 10 ? 2 : 0)}`;

const BASIS_NOTE: Record<HeatLossBasis, string> = {
  measured:
    "Measured from your own tub — the probe watched it cool with the covers on.",
  setting: "From the insulation figure you entered.",
  estimated:
    "Estimated for an uninsulated tub, because nothing better is known yet. If you have covers on it, this overstates every figure here — often several times over.",
};

export default function RunningCostsCard({
  summary,
  seasonal,
  keepWarm,
  basis,
  standingLossCPerH,
  impliedU,
  pricePerKwh,
  deltaTK,
  volumeLitres,
}: {
  summary: RunningCostSummary;
  seasonal: SeasonalComparison | null;
  keepWarm: KeepWarmComparison | null;
  basis: HeatLossBasis;
  standingLossCPerH: number;
  impliedU: number;
  pricePerKwh: number;
  deltaTK: number;
  volumeLitres: number;
}) {
  const d = summary.daily;

  return (
    <div className="space-y-3">
      {/* The headline */}
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Running now
          </span>
          <span className="num-tabular text-2xl font-bold text-slate-900">
            {money(d.cost)}
            <span className="text-sm font-medium text-slate-500">/day</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          About {d.totalKwh} kWh a day at {(pricePerKwh * 100).toFixed(2)}p —
          roughly {money(summary.monthlyCost)} a month, and{" "}
          {money(summary.annualCost.low)}–{money(summary.annualCost.high)} across
          a year depending on how cold it gets.
          {summary.perSessionCost !== null
            ? ` That's about ${money(summary.perSessionCost)} a soak.`
            : ""}
        </p>
      </div>

      {/* Where the energy actually goes */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Where it goes each day
        </p>
        <dl className="mt-1.5 space-y-1 text-sm">
          <Row label="Keeping it warm (covers on)" value={`${d.standingKwh} kWh`} />
          <Row label="Lid off while you're in it" value={`${d.soakKwh} kWh`} />
          <Row label="Filtration pump" value={`${d.filterKwh} kWh`} />
        </dl>
        <p className="mt-1.5 text-xs text-slate-400">
          Standing loss usually dominates, which is why insulation matters more
          than anything else you can change.
        </p>
      </div>

      {/* Hold it hot, or let it cool? */}
      {keepWarm ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            You soak about {keepWarm.soaksPerWeek}&times; a week
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <Row label="Leave it hot" value={`${money(keepWarm.keepWarmWeekly)}/wk`} />
            <Row
              label="Let it cool, reheat each time"
              value={`${money(keepWarm.letCoolWeekly)}/wk`}
            />
          </dl>
          <p className="mt-1.5 text-sm font-medium text-slate-800">
            {`Letting it cool saves about ${money(keepWarm.savingWeekly)} a week. It only drops to about ${keepWarm.coolsToC}° between soaks, so you'd switch on roughly ${Math.max(1, Math.round(keepWarm.reheatHours * 2) / 2)} h before each one.`}
          </p>
        </div>
      ) : null}

      {/* Shutting down for winter */}
      {seasonal ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Running all year vs {seasonal.monthsRunning} months
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <Row
              label="All year"
              value={`${money(seasonal.yearRoundCost)}${
                seasonal.yearRoundPerSession !== null
                  ? ` · ${money(seasonal.yearRoundPerSession)}/soak`
                  : ""
              }`}
            />
            <Row
              label={`${seasonal.monthsRunning} months`}
              value={`${money(seasonal.partYearCost)}${
                seasonal.partYearPerSession !== null
                  ? ` · ${money(seasonal.partYearPerSession)}/soak`
                  : ""
              }`}
            />
          </dl>
          <p className="mt-1.5 text-sm text-slate-700">
            Shutting down for the cold months saves about{" "}
            <strong>{money(seasonal.saving)}</strong> a year — though you also
            get fewer soaks out of it, so the saving is on the bill rather than
            on value for money.
          </p>
        </div>
      ) : null}

      {/* The figure everything above rests on */}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon name="snowflake" size={16} className="text-brand-600" />
          Insulation
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Losing about <strong>{standingLossCPerH} °C an hour</strong> standing
          with the covers on, which works out at roughly{" "}
          <strong>{impliedU.toFixed(2)} W/m²K</strong>.
        </p>
        <p className="mt-1.5 text-xs text-slate-400">{BASIS_NOTE[basis]}</p>
        <p className="mt-1.5 text-xs text-slate-400">
          Every number on this card follows from that one, so it&apos;s worth
          being right. Manufacturers&apos; published cover figures generally come
          without independent validation or stated test conditions — a
          measurement of your own tub beats any of them.
        </p>
        <InsulationInput
          deltaTK={deltaTK}
          volumeLitres={volumeLitres}
          hasSaved={basis === "setting"}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="num-tabular font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
