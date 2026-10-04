// =============================================================================
//  Today — what to do now, and nothing else. Three numbers about the water,
//  one ranked list of things to do (each a single line with its reasons one
//  tap away), and the four things you might want to log. Everything else lives
//  on Water, Heat and Care.
// =============================================================================

import { format } from "date-fns";
import SetupNeeded from "@/components/SetupNeeded";
import TodayView, { HibernatingView } from "@/components/TodayView";
import { loadTubState } from "@/lib/tubState";
import { buildTodos, waterPills } from "@/lib/todo";
import { ukClock } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const res = await loadTubState();
  if (!res.ok) return <SetupNeeded message={res.error} />;
  const s = res.state;
  const date = format(ukClock(s.now), "EEEE d MMMM");

  // Packed away for the winter: nothing here is about water that exists.
  if (s.hibernation.hibernating) {
    return (
      <HibernatingView
        date={date}
        since={s.hibernation.since}
        reopen={s.hibernation.reopen}
        stillOutdoors={s.hibernation.stillOutdoors}
      />
    );
  }

  // A reading the probe is still settling on doesn't count yet.
  const m = s.probe?.measure;
  const probe =
    m && m.isValid && m.measuredAt ? { ph: m.ph, orpMv: m.orpMv, measuredAt: m.measuredAt } : null;
  const latest = s.latest;
  const chlorine = s.config.sanitizerType === "chlorine";

  const todo = buildTodos({
    now: s.now,
    config: s.config,
    strip:
      latest && s.calc
        ? {
            calc: s.calc,
            recordedAt: latest.recorded_at,
            alkalinityPpm: Number(latest.total_alkalinity_ppm),
          }
        : null,
    probe,
    dosing: s.dosing,
    jobs: s.jobs,
    forecasts: s.forecasts,
    drift: s.drift,
    verdict: s.verdict,
    winter: {
      countdown: s.countdown,
      deadline: s.window?.deadline ?? null,
      decided: s.hibernation.keepingItRunning,
    },
  });

  const sanitiser = latest ? (chlorine ? latest.free_chlorine_ppm : latest.bromine_ppm) : null;
  const pills =
    latest || probe
      ? waterPills({
          config: s.config,
          safety: todo.safety,
          waterC: s.waterC,
          probe,
          strip: latest
            ? {
                ph: Number(latest.ph),
                sanitiserPpm: sanitiser === null ? null : Number(sanitiser),
                orpMv: latest.orp_mv === null ? null : Number(latest.orp_mv),
                recordedAt: latest.recorded_at,
              }
            : null,
        })
      : null;

  return (
    <TodayView
      date={date}
      safety={todo.safety}
      pills={pills}
      items={todo.items}
      later={todo.later}
      heater={
        s.waterC === null
          ? null
          : {
              currentC: s.waterC,
              targetC: s.soakTargetC,
              ambientC: s.ambientC,
              watts: s.heater.watts,
              volumeLitres: s.config.volumeLitres,
              uaWPerK: s.heatLoss.uaWPerK,
              schedule: s.schedule,
              defaultReadyAtIso: s.readyAt.toISOString(),
            }
      }
      lastCheckIso={s.lastNotification?.created_at ?? null}
    />
  );
}
