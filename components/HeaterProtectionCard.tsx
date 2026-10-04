// =============================================================================
//  components/HeaterProtectionCard.tsx
//  Judges the water as a system: pH, alkalinity, calcium and temperature can
//  each read "in range" while the combination plates scale onto the heater.
//  The band shows three ways (marker position, colour, and the word in the
//  chip), so nothing depends on colour alone. The reasoning sits behind "Why?".
// =============================================================================

import { Callout, Card, Chip, LinkButton, type Tone } from "./ui";
import WhyButton from "./WhyButton";
import type { LsiBand, LsiSnapshot } from "@/lib/balance";

const IDEAL_MIN = -0.3;
const IDEAL_MAX = 0.3;

const BAND: Record<LsiBand, { word: string; tone: Tone }> = {
  corrosive: { word: "Corrosive", tone: "bad" },
  "slightly-corrosive": { word: "Slightly aggressive", tone: "warn" },
  balanced: { word: "Balanced", tone: "good" },
  "slightly-scaling": { word: "Drifting to scale", tone: "warn" },
  scaling: { word: "Scaling", tone: "bad" },
};

function Scale({ lsi }: { lsi: number }) {
  const W = 300;
  const L = 10;
  const R = 10;
  const x = (v: number) => L + ((Math.max(-1, Math.min(1, v)) + 1) / 2) * (W - L - R);
  return (
    <svg
      viewBox={`0 0 ${W} 50`}
      className="mt-2.5 block h-auto w-full"
      role="img"
      aria-label={`Saturation index ${lsi.toFixed(2)}. Balanced is between ${IDEAL_MIN} and ${IDEAL_MAX}; below, the water corrodes the heater, above, it scales it up.`}
    >
      <rect className="fill-bad-soft" x={x(-1)} y={14} width={x(IDEAL_MIN) - x(-1) - 1} height={10} rx={5} />
      <rect className="fill-good-soft" x={x(IDEAL_MIN) + 1} y={14} width={x(IDEAL_MAX) - x(IDEAL_MIN) - 2} height={10} />
      <rect className="fill-bad-soft" x={x(IDEAL_MAX) + 1} y={14} width={x(1) - x(IDEAL_MAX) - 1} height={10} rx={5} />
      <circle className="fill-accent stroke-surface" strokeWidth={2} cx={x(lsi)} cy={19} r={7} />
      <text className="fill-ink-3 text-[11px] font-semibold" x={L} y={44}>Eats metal</text>
      <text className="fill-ink-3 text-[11px] font-semibold" x={W / 2} y={44} textAnchor="middle">Balanced</text>
      <text className="fill-ink-3 text-[11px] font-semibold" x={W - R} y={44} textAnchor="end">Scales up</text>
    </svg>
  );
}

function WhyText() {
  return (
    <WhyButton title="What's heater protection?" label="What's this?">
      <p>
        Whether water forms scale or eats metal depends on pH, alkalinity,
        calcium and temperature together. The saturation index rolls them into
        one number.
      </p>
      <p>
        Between −0.3 and +0.3 is balanced. Above it, scale builds up on the
        heater, the most expensive part to replace. Below it, the water starts
        to corrode it.
      </p>
      <p>
        Stabiliser from dichlor shows up as alkalinity on a strip but does
        nothing for balance, so when you&apos;ve measured it, it&apos;s taken
        out first.
      </p>
    </WhyButton>
  );
}

export default function HeaterProtectionCard({ snapshot }: { snapshot: LsiSnapshot }) {
  const {
    lsi,
    verdict,
    calcium,
    calciumIsStale,
    cya,
    cyaIsStale,
    cyaCorrected,
    carbonateAlkalinityPpm,
    overStabilised,
    temperatureC,
    temperatureIsMeasured,
  } = snapshot;

  if (snapshot.ph === null || snapshot.alkalinityPpm === null) return null;

  if (overStabilised) {
    return (
      <Card>
        <Callout tone="bad" icon="alert-triangle">
          <strong>Change the water.</strong> Your stabiliser ({cya?.valuePpm} ppm)
          accounts for all of your alkalinity reading, and only fresh water removes it.
        </Callout>
      </Card>
    );
  }

  if (lsi === null || verdict === null) {
    return (
      <Card>
        <p className="font-bold">Needs a calcium reading</p>
        <p className="mt-1 text-sm text-ink-2">
          Your probe can&apos;t measure calcium. A strip every few weeks is enough;
          it barely moves between water changes.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <LinkButton href="/readings/new" variant="line" size="sm">
            Add a calcium reading
          </LinkButton>
          <WhyText />
        </div>
      </Card>
    );
  }

  const band = BAND[verdict.band];
  const carbonate =
    cyaCorrected && carbonateAlkalinityPpm !== null
      ? ` (${Math.round(carbonateAlkalinityPpm)} after stabiliser)`
      : "";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="num-tabular text-[30px] font-extrabold leading-none tracking-tight">
          {lsi > 0 ? "+" : ""}
          {lsi.toFixed(2)}
        </span>
        <Chip tone={band.tone}>{band.word}</Chip>
      </div>
      <Scale lsi={lsi} />
      {verdict.band !== "balanced" && verdict.actions[0] ? (
        <Callout tone={band.tone} icon="alert-triangle" className="mt-2">
          {verdict.actions[0]}
        </Callout>
      ) : null}
      <p className="mt-2 text-[13.5px] leading-snug text-ink-2">
        From pH {snapshot.ph.toFixed(1)}, alkalinity {Math.round(snapshot.alkalinityPpm)}
        {carbonate}, calcium {calcium?.valuePpm}
        {cya ? ` and stabiliser ${cya.valuePpm}` : ""}, at{" "}
        {temperatureC.toFixed(temperatureIsMeasured ? 1 : 0)}°
        {temperatureIsMeasured ? "" : " (your soak temperature)"}.
      </p>
      {calciumIsStale || cyaIsStale ? (
        <Callout tone="warn" className="mt-2">
          {calciumIsStale ? "Your calcium reading is over a month old. " : ""}
          {cyaIsStale ? "Your stabiliser reading is over two weeks old. " : ""}A
          fresh strip keeps this right.
        </Callout>
      ) : null}
      <div className="mt-2">
        <WhyText />
      </div>
    </Card>
  );
}
