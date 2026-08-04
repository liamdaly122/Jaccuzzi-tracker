// =============================================================================
//  components/ProbeCard.tsx
//  Live readings straight from the iopool probe, shown on the dashboard. This
//  is the nicest thing about owning the probe: the water's real state without
//  dipping anything.
//
//  Presentational only — the server component fetches and passes the values in.
// =============================================================================

import { Card } from "./ui";
import Icon from "./Icon";
import type { IopoolPool } from "@/lib/iopool-parse";
import type { TargetRanges } from "@/lib/chemistry";

const GOOD = "text-emerald-700";
const WARN = "text-amber-700";

function freshness(ageMinutes: number | null): string {
  if (ageMinutes === null) return "just now";
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const h = Math.round(ageMinutes / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function ProbeCard({
  pool,
  ranges,
}: {
  pool: IopoolPool;
  ranges: TargetRanges;
}) {
  const m = pool.measure;
  const orpMin = ranges.orpMin ?? 650;
  const orpMax = ranges.orpMax ?? 750;

  const phState =
    m.ph === null
      ? null
      : m.ph >= ranges.phIdealMin && m.ph <= ranges.phIdealMax;
  const orpState =
    m.orpMv === null ? null : m.orpMv >= orpMin && m.orpMv <= orpMax;

  // Very stale data usually means the probe is out of the water or offline.
  const stale = m.ageMinutes !== null && m.ageMinutes > 6 * 60;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <Icon name="bolt" size={18} className="text-emerald-600" />
          Live from your probe
        </h2>
        <span className="text-xs text-slate-400">{freshness(m.ageMinutes)}</span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 py-2">
          <div
            className={`num-tabular text-lg font-bold ${
              phState === null ? "text-slate-800" : phState ? GOOD : WARN
            }`}
          >
            {m.ph ?? "—"}
          </div>
          <div className="text-xs text-slate-500">pH</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-2">
          <div
            className={`num-tabular text-lg font-bold ${
              orpState === null ? "text-slate-800" : orpState ? GOOD : WARN
            }`}
          >
            {m.orpMv ?? "—"}
          </div>
          <div className="text-xs text-slate-500">ORP mV</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-2">
          <div className="num-tabular text-lg font-bold text-slate-800">
            {m.temperatureC !== null ? `${m.temperatureC}°` : "—"}
          </div>
          <div className="text-xs text-slate-500">Temp</div>
        </div>
      </dl>

      {!m.isValid ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Your probe says this reading is still settling — give it a little
          longer before trusting it.
        </p>
      ) : null}

      {stale ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Icon name="alert-triangle" size={13} className="mt-px shrink-0" />
          This reading is a while old — check the probe is still floating in the
          water and has signal.
        </p>
      ) : null}

      {pool.filtrationHours !== null ? (
        <p className="mt-3 text-xs text-slate-500">
          iopool suggests about{" "}
          <strong className="num-tabular">{pool.filtrationHours} h</strong> of
          filtration a day at this temperature.
        </p>
      ) : null}

      <p className="mt-2 text-xs text-slate-400">
        The probe doesn&apos;t measure alkalinity — use a strip for that.
      </p>
    </Card>
  );
}
