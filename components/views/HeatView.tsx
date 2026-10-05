// =============================================================================
//  Heat — when to switch on, what it costs to run, and the weather that
//  drives both.
// =============================================================================

import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import HeatingPlanCard from "@/components/HeatingPlanCard";
import RunningCostsCard from "@/components/RunningCostsCard";
import Icon from "@/components/Icon";
import { Callout, Card, Section } from "@/components/ui";
import type { TubState } from "@/lib/tubState";
import { impliedUValue } from "@/lib/thermal";
import type { IconName } from "@/lib/icons";

// Advice text also goes out in push notifications, where it leads with an
// emoji. On screen the icon does that job, so strip it.
const stripEmoji = (s: string) => s.replace(/^[\p{Extended_Pictographic}️\s]+/u, "");

function dayIcon(d: { tempMin: number; precipMm: number | null; uvMax: number | null }): IconName {
  if (d.tempMin <= 2) return "snowflake";
  if ((d.precipMm ?? 0) >= 2) return "cloud";
  if ((d.uvMax ?? 0) >= 3) return "sun";
  return "cloud";
}

export default function HeatView({ s }: { s: TubState }) {

  const patternNote =
    s.readySource === "pattern" && s.pattern
      ? `Guessed from the ${s.pattern.soaks} soaks you've logged. Save it to keep it.`
      : null;
  const days = s.weather?.days.slice(0, 3) ?? [];

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Heat" subtitle="Heating, costs and weather" />

      <HeatingPlanCard
        currentC={s.waterC}
        targetC={s.soakTargetC}
        ambientC={s.ambientC}
        watts={s.heater.watts}
        measured={s.heater.measured}
        samples={s.heater.samples}
        volumeLitres={s.config.volumeLitres}
        uaWPerK={s.heatLoss.uaWPerK}
        pricePerKwh={s.pricePerKwh}
        defaultReadyAtIso={s.readyAt.toISOString()}
        nowIso={s.now.toISOString()}
        patternNote={patternNote}
        schedule={s.schedule}
        keepWarm={s.keepWarm}
      />

      <Section title="Running costs">
        <RunningCostsCard
          summary={s.costs}
          seasonal={s.seasonal}
          basis={s.heatLoss.basis}
          standingLossCPerH={s.heatLoss.standingLossCPerH}
          impliedU={impliedUValue(s.heatLoss.uaWPerK, s.config.volumeLitres)}
          pricePerKwh={s.pricePerKwh}
          deltaTK={Math.max(1, (s.waterC ?? s.soakTargetC) - s.ambientC)}
          volumeLitres={s.config.volumeLitres}
          ambientC={s.ambientC}
        />
      </Section>

      {s.weather && days.length ? (
        <Section title="Weather" aside={s.settings.location_name ?? undefined}>
          <Card>
            <div className="grid grid-cols-3 gap-2 text-center">
              {days.map((d, i) => (
                <div key={d.date} className="grid justify-items-center gap-1 rounded-ctl bg-surface-2 px-1 py-2.5">
                  <span className="text-[12.5px] font-bold text-ink-3">
                    {i === 0 ? "Today" : format(new Date(`${d.date}T12:00:00`), "EEE")}
                  </span>
                  <Icon name={dayIcon(d)} size={20} className="text-ink-2" />
                  <b className="text-lg">{Math.round(d.tempMax)}°</b>
                  <span className="text-[13px] text-ink-2">{Math.round(d.tempMin)}° low</span>
                </div>
              ))}
            </div>
            {s.advisories.length ? (
              <div className="mt-3 grid gap-2">
                {s.advisories.map((a) => (
                  <Callout key={a.code} tone={a.severity === "warning" ? "bad" : "warn"} icon={a.code === "frost" ? "snowflake" : a.code === "heat" ? "sun" : "cloud"}>
                    {stripEmoji(a.message)}
                  </Callout>
                ))}
              </div>
            ) : (
              <p className="mt-2.5 text-[13.5px] text-ink-2">Nothing in the next few days to worry about.</p>
            )}
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
