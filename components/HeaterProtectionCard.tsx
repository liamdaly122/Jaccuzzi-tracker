// =============================================================================
//  components/HeaterProtectionCard.tsx
//  The one card that judges the water as a SYSTEM rather than as four separate
//  numbers. pH, alkalinity, calcium and temperature can each read "in range"
//  while the combination quietly plates scale onto the heating element — the
//  most expensive thing to replace on an inflatable spa.
//
//  Dependency-free inline SVG, same tokens as components/TrendChart.tsx and
//  components/setup/WaterBalanceGauge.tsx. The band is encoded three ways —
//  marker position, colour, AND an icon + word — so nothing depends on colour
//  alone.
// =============================================================================

import Link from "next/link";
import { Card } from "./ui";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";
import type { LsiBand, LsiSnapshot } from "@/lib/balance";

const TRACK = "#e2e8f0"; // slate-200
const MUTED = "#94a3b8"; // slate-400
const INK = "#334155"; // slate-700
const GOOD = "#0ca30c";
const WARNING = "#fab219";
const CRITICAL = "#d03b3b";
const BAND = "rgba(12,163,12,0.14)";
const BAND_EDGE = "rgba(12,163,12,0.40)";

// The axis. Beyond ±1 the number stops meaning anything more than "badly out".
const FLOOR = -1;
const CEILING = 1;
const IDEAL_MIN = -0.3;
const IDEAL_MAX = 0.3;

const BAND_STYLE: Record<
  LsiBand,
  { tone: string; icon: IconName; text: string; surface: string }
> = {
  corrosive: {
    tone: CRITICAL,
    icon: "alert-triangle",
    text: "text-red-800",
    surface: "bg-red-50",
  },
  "slightly-corrosive": {
    tone: WARNING,
    icon: "alert-triangle",
    text: "text-amber-800",
    surface: "bg-amber-50",
  },
  balanced: {
    tone: GOOD,
    icon: "check-circle",
    text: "text-emerald-800",
    surface: "bg-emerald-50",
  },
  "slightly-scaling": {
    tone: WARNING,
    icon: "alert-triangle",
    text: "text-amber-800",
    surface: "bg-amber-50",
  },
  scaling: {
    tone: CRITICAL,
    icon: "alert-triangle",
    text: "text-red-800",
    surface: "bg-red-50",
  },
};

function BalanceScale({ lsi, tone }: { lsi: number; tone: string }) {
  const W = 300;
  const H = 34;
  const padX = 6;
  const trackY = 14;
  const plotW = W - padX * 2;
  const x = (v: number) =>
    padX + Math.min(1, Math.max(0, (v - FLOOR) / (CEILING - FLOOR))) * plotW;

  const bandX = x(IDEAL_MIN);
  const bandW = x(IDEAL_MAX) - bandX;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Saturation index ${lsi.toFixed(2)}. Balanced is between ${IDEAL_MIN} and ${IDEAL_MAX}; below that the water is corrosive, above it the water forms scale.`}
    >
      <rect x={padX} y={trackY - 3} width={plotW} height={6} rx={3} fill={TRACK} />
      <rect x={bandX} y={trackY - 6} width={bandW} height={12} rx={3} fill={BAND} />
      <line x1={bandX} x2={bandX} y1={trackY - 7} y2={trackY + 7} stroke={BAND_EDGE} />
      <line
        x1={bandX + bandW}
        x2={bandX + bandW}
        y1={trackY - 7}
        y2={trackY + 7}
        stroke={BAND_EDGE}
      />
      <circle
        cx={x(lsi)}
        cy={trackY}
        r={6}
        fill={tone}
        stroke="#ffffff"
        strokeWidth={2}
        className="anim-marker"
      />
      {/* What each end of the track actually means, in words. */}
      <text x={padX} y={H - 2} fontSize={9} fill={MUTED}>
        eats metal
      </text>
      <text x={bandX + bandW / 2} y={H - 2} fontSize={9} fill={INK} textAnchor="middle">
        balanced
      </text>
      <text x={padX + plotW} y={H - 2} fontSize={9} fill={MUTED} textAnchor="end">
        furs up
      </text>
    </svg>
  );
}

export default function HeaterProtectionCard({
  snapshot,
}: {
  snapshot: LsiSnapshot;
}) {
  const { lsi, verdict, calcium, calciumIsStale, temperatureC, temperatureIsMeasured } =
    snapshot;

  // Nothing to show until there's at least a water test — the dashboard already
  // has a "get started" hero for that case.
  if (snapshot.ph === null || snapshot.alkalinityPpm === null) return null;

  if (lsi === null || verdict === null) {
    // The user's normal state between strip tests: the probe measures pH, ORP
    // and temperature but has no calcium pad, so ask for the one missing piece.
    return (
      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
          <Icon name="thermometer" size={18} className="text-brand-600" />
          Heater protection
        </h2>
        <p className="text-sm text-slate-600">
          Scale on the heating element is the expensive failure on a spa, and
          whether it forms depends on pH, alkalinity, calcium and temperature
          <em> together</em> — not on any one of them. I have everything except{" "}
          <strong>calcium hardness</strong>, which your probe can&apos;t measure.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Dip a strip that tests calcium (most 6-in-1 strips do), pop the number
          in, and this comes alive. It only needs doing every few weeks —
          calcium barely moves between water changes.
        </p>
        <Link
          href="/readings/new"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600"
        >
          <Icon name="flask" size={16} />
          Add a calcium reading
        </Link>
      </Card>
    );
  }

  const style = BAND_STYLE[verdict.band];

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
        <Icon name="thermometer" size={18} className="text-brand-600" />
        Heater protection
      </h2>

      <div className={`rounded-xl p-3 ${style.surface}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`flex items-center gap-2 font-semibold ${style.text}`}>
            <Icon name={style.icon} size={17} />
            {verdict.headline}
          </p>
          <span className={`num-tabular text-sm font-semibold ${style.text}`}>
            {lsi > 0 ? "+" : ""}
            {lsi.toFixed(2)}
          </span>
        </div>
        <p className={`mt-1 text-sm ${style.text}`}>{verdict.detail}</p>
      </div>

      <div className="mt-3">
        <BalanceScale lsi={lsi} tone={style.tone} />
      </div>

      {verdict.actions.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Do this first
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{verdict.actions[0]}</p>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-slate-400">
        Worked out from your last test (pH {snapshot.ph.toFixed(1)}, alkalinity{" "}
        {Math.round(snapshot.alkalinityPpm)} ppm), calcium {calcium?.valuePpm} ppm
        {calcium && calcium.ageDays > 0
          ? ` measured ${calcium.ageDays} day${calcium.ageDays === 1 ? "" : "s"} ago`
          : ""}
        , at {temperatureC.toFixed(temperatureIsMeasured ? 1 : 0)} °C
        {temperatureIsMeasured ? " from your probe" : " (assumed — no probe reading)"}.
      </p>

      {calciumIsStale ? (
        <p className="mt-1 text-xs text-amber-700">
          That calcium reading is over a month old. Top-ups shift it slowly, so
          it&apos;s worth a fresh strip test.
        </p>
      ) : null}

      <p className="mt-1 text-xs text-slate-400">
        Guidance, not gospel: without a stabiliser (CYA) test this errs slightly
        towards warning about scale early — the safe direction for a heater.
      </p>
    </Card>
  );
}
