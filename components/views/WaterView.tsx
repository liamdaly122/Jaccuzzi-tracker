// =============================================================================
//  Water — everything about the water itself: the probe's live numbers, the
//  last strip test, heater protection, how old the water is, trends and the
//  latest history. Each fact appears once, here.
// =============================================================================

import Link from "next/link";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import ProbeTiles from "@/components/ProbeTiles";
import HeaterProtectionCard from "@/components/HeaterProtectionCard";
import ApplyIntervalButton from "@/components/ApplyIntervalButton";
import TrendExplorer from "@/components/TrendExplorer";
import type { TrendPoint, TrendSeries } from "@/components/TrendChart";
import { Card, Chip, LinkButton, Meter, Row, Section, type Tone } from "@/components/ui";
import type { TubState } from "@/lib/tubState";
import { ukClock } from "@/lib/clock";
import { downsampleDaily } from "@/lib/probe";
import { lsiSeries } from "@/lib/balance";
import { linearTrend } from "@/lib/predict";
import { CHEMICAL_LABELS } from "@/lib/types";
import { chemicalName } from "@/lib/todo";
import type { IconName } from "@/lib/icons";
import type { WaterVerdictStatus } from "@/lib/water";

const DAY_MS = 24 * 60 * 60 * 1000;

const VERDICT: Record<WaterVerdictStatus, { word: string; tone: Tone }> = {
  fresh: { word: "Fresh", tone: "good" },
  ok: { word: "Good", tone: "good" },
  watch: { word: "Getting there", tone: "neutral" },
  change_soon: { word: "Change soon", tone: "warn" },
  change_now: { word: "Change it", tone: "bad" },
};

function direction(points: TrendPoint[], decimals: number, unit: string): string {
  const t = linearTrend(points);
  if (!t) return "";
  const rate = Math.abs(t.slopePerDay);
  if (rate < 10 ** -decimals / 2) return " · steady";
  return ` · ${t.slopePerDay < 0 ? "falling" : "rising"} ~${rate.toFixed(decimals)}${unit} a day`;
}

/** "Chlorine granules (dichlor)" → "chlorine granules (dichlor)"; "pH up" stays. */
const lowerFirst = (t: string) => (t.startsWith("pH") ? t : t.charAt(0).toLowerCase() + t.slice(1));

function rangeTone(v: number, lo: number, hi: number): [string, Tone] {
  if (v < lo) return ["Low", "warn"];
  if (v > hi) return ["High", "warn"];
  return ["OK", "good"];
}

export default function WaterView({ s }: { s: TubState }) {
  const r = s.config.targetRanges;
  const isChlorine = s.config.sanitizerType === "chlorine";
  const nowMs = s.now.getTime();

  // --- Probe, last 24 hours (oldest first) -------------------------------------
  const lastDay = [...s.probeRows]
    .filter((p) => p.is_valid && nowMs - new Date(p.measured_at).getTime() <= DAY_MS)
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  const pick = (k: "temperature_c" | "ph" | "orp_mv") =>
    lastDay.map((p) => p[k]).filter((v): v is number => v !== null).map(Number);

  // --- Trends ------------------------------------------------------------------
  const daily = downsampleDaily(s.probeRows);
  const strips = [...s.recentReadings].reverse();
  const stripPoints = (f: (x: (typeof strips)[number]) => number | null): TrendPoint[] =>
    strips.map((x) => ({ date: x.recorded_at, value: f(x) }));
  const series: TrendSeries[] = [];
  const add = (sr: TrendSeries) => {
    if (sr.points.filter((p) => p.value !== null).length >= 2) series.push(sr);
  };
  const phPoints =
    daily.length >= 2
      ? daily.map((d) => ({ date: d.date, value: d.ph }))
      : stripPoints((x) => Number(x.ph));
  add({
    key: "ph", label: "pH", unit: "", decimals: 2, band: [r.phIdealMin, r.phIdealMax], points: phPoints,
    source: `${daily.length >= 2 ? "Probe, daily middle reading" : "Strip tests"}${direction(phPoints, 2, "")}`,
  });
  const orpPoints = daily.map((d) => ({ date: d.date, value: d.orpMv }));
  add({
    key: "orp", label: "ORP", unit: " mV", decimals: 0, band: [r.orpMin ?? 650, r.orpMax ?? 750], points: orpPoints,
    source: `Probe, daily middle reading${direction(orpPoints, 0, " mV")}`,
  });
  const taPoints = stripPoints((x) => Number(x.total_alkalinity_ppm));
  add({
    key: "ta", label: "Alkalinity", unit: " ppm", decimals: 0, band: [r.taMin, r.taMax], points: taPoints,
    source: `Strip tests${direction(taPoints, 0, " ppm")}`,
  });
  const sanPoints = stripPoints((x) => {
    const v = isChlorine ? x.free_chlorine_ppm : x.bromine_ppm;
    return v === null ? null : Number(v);
  });
  add({
    key: "san", label: isChlorine ? "Chlorine" : "Bromine", unit: " ppm", decimals: 1,
    band: isChlorine ? [r.fcMin, r.fcMax] : [r.brMin, r.brMax], points: sanPoints,
    source: `Strip tests${direction(sanPoints, 1, " ppm")}`,
  });
  const lsiPoints = lsiSeries(
    strips,
    daily.map((d) => ({ measured_at: d.date, temperature_c: d.temperatureC })),
    s.drainTask?.last_completed_at ?? null,
  );
  add({
    key: "lsi", label: "Balance", unit: "", decimals: 2, band: [-0.3, 0.3], points: lsiPoints,
    source: "Heater protection index, from your strip tests",
  });
  const tempPoints =
    lastDay.length >= 2
      ? lastDay.map((p) => ({ date: p.measured_at, value: p.temperature_c === null ? null : Number(p.temperature_c) }))
      : daily.map((d) => ({ date: d.date, value: d.temperatureC }));
  add({
    key: "temp", label: "Temp", unit: "°", decimals: 1, target: s.soakTargetC, points: tempPoints,
    source: lastDay.length >= 2 ? "Probe, last 24 hours" : "Probe, daily middle reading",
    dateFormat: lastDay.length >= 2 ? "time" : "day",
  });

  // --- Water age ---------------------------------------------------------------
  const refilledAt = s.drainTask?.last_completed_at ? new Date(s.drainTask.last_completed_at) : null;
  const changeAround = refilledAt
    ? new Date(refilledAt.getTime() + s.waterChange.intervalDays * DAY_MS)
    : null;
  const verdict = VERDICT[s.verdict.status];
  const intervalDiffers =
    s.drainTask !== null && s.drainTask.frequency_days !== s.waterChange.intervalDays;

  // --- Recent history ----------------------------------------------------------
  type Event = { key: string; at: string; icon: IconName; title: string; sub?: string };
  const events: Event[] = [
    ...s.recentReadings.slice(0, 5).map((x) => ({
      key: `test-${x.id}`,
      at: x.recorded_at,
      icon: "flask" as IconName,
      title: "Strip test",
      sub: [
        `pH ${Number(x.ph).toFixed(1)}`,
        `alkalinity ${x.total_alkalinity_ppm}`,
        isChlorine && x.free_chlorine_ppm !== null ? `chlorine ${x.free_chlorine_ppm}` : null,
        !isChlorine && x.bromine_ppm !== null ? `bromine ${x.bromine_ppm}` : null,
        x.orp_mv !== null ? `ORP ${x.orp_mv}` : null,
      ].filter(Boolean).join(" · "),
    })),
    ...s.dosing.slice(0, 5).map((d) => ({
      key: `dose-${d.id}`,
      at: d.logged_at,
      icon: "droplet" as IconName,
      title: `Added ${lowerFirst(chemicalName(d.chemical) ?? CHEMICAL_LABELS[d.chemical] ?? d.chemical)}${Number(d.amount_grams) > 0 ? `, ${Number(d.amount_grams)}\u00a0g` : ""}`,
    })),
    ...s.usageRows.slice(0, 5).map((u) => ({
      key: `soak-${u.id}`,
      at: u.used_at,
      icon: "bath" as IconName,
      title: `Soak, ${u.bathers} ${u.bathers === 1 ? "person" : "people"}`,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  const latest = s.latest;
  const sanitiserValue = latest
    ? isChlorine
      ? latest.free_chlorine_ppm
      : latest.bromine_ppm
    : null;

  return (
    <div className="grid gap-[22px]">
      <PageHeader title="Water" subtitle="Your probe and strip tests" />

      {s.probe ? (
        <ProbeTiles
          pool={s.probe}
          ranges={r}
          soakTargetC={s.soakTargetC}
          history={{ temp: pick("temperature_c"), ph: pick("ph"), orp: pick("orp_mv") }}
        />
      ) : null}

      <Section
        title="Last strip test"
        aside={latest ? format(ukClock(latest.recorded_at), "d MMM") : undefined}
      >
        <Card flush>
          {latest ? (
            <>
              {!s.probe ? (
                <TestRow name="pH" value={Number(latest.ph).toFixed(1)} chip={rangeTone(Number(latest.ph), r.phIdealMin, r.phIdealMax)} />
              ) : null}
              <TestRow name="Alkalinity" value={`${latest.total_alkalinity_ppm} ppm`} chip={rangeTone(Number(latest.total_alkalinity_ppm), r.taMin, r.taMax)} />
              {sanitiserValue !== null ? (
                <TestRow
                  name={isChlorine ? "Free chlorine" : "Bromine"}
                  value={`${Number(sanitiserValue).toFixed(1)} ppm`}
                  chip={rangeTone(Number(sanitiserValue), isChlorine ? r.fcMin : r.brMin, isChlorine ? r.fcMax : r.brMax)}
                />
              ) : null}
              {latest.calcium_hardness_ppm !== null ? (
                <TestRow name="Calcium" value={`${latest.calcium_hardness_ppm} ppm`} chip={rangeTone(Number(latest.calcium_hardness_ppm), r.chMin, r.chMax)} />
              ) : null}
              {latest.cyanuric_acid_ppm !== null ? (
                <TestRow name="Stabiliser" value={`${latest.cyanuric_acid_ppm} ppm`} chip={rangeTone(Number(latest.cyanuric_acid_ppm), r.cyaMin ?? 20, r.cyaMax ?? 50)} />
              ) : null}
            </>
          ) : (
            <p className="px-3.5 py-4 text-sm text-ink-2">No strip tests yet.</p>
          )}
          <div className="border-t border-line p-3.5">
            <LinkButton href="/readings/new" variant="quiet" block>
              Test now
            </LinkButton>
          </div>
        </Card>
      </Section>

      {latest ? (
        <Section title="Heater protection">
          <HeaterProtectionCard snapshot={s.balance} />
        </Section>
      ) : null}

      <Section title="Water age">
        <Card>
          {s.waterAgeDays !== null && refilledAt ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[30px] font-extrabold leading-none tracking-tight">
                  Day {s.waterAgeDays}
                </span>
                <Chip tone={verdict.tone}>{verdict.word}</Chip>
              </div>
              {s.usageStatus ? (
                <>
                  <Meter
                    className="mt-3"
                    value={s.usageStatus.fractionUsed}
                    tone={s.usageStatus.changeDue ? "bad" : "accent"}
                    label={`${s.usageStatus.used} of about ${s.usageStatus.capacity} person-soaks used`}
                  />
                  <p className="mt-2 text-[13.5px] text-ink-2">
                    <b className="num-tabular">{s.usageStatus.used}</b> of about{" "}
                    {s.usageStatus.capacity} person-soaks used since you refilled on{" "}
                    {format(refilledAt, "d MMM")}.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[13.5px] text-ink-2">
                  Refilled on {format(refilledAt, "d MMM")}.
                </p>
              )}
              <p className="mt-1 text-[13.5px] text-ink-2">{s.verdict.detail}</p>
              {changeAround ? (
                <p className="mt-1 text-[13.5px] text-ink-2">
                  At your usual use, change it around {format(changeAround, "EEE d MMM")}.
                </p>
              ) : null}
              {intervalDiffers && s.drainTask ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-line pt-3">
                  <span className="text-[13.5px] text-ink-2">
                    Your reminder says every {s.drainTask.frequency_days} days.
                  </span>
                  <ApplyIntervalButton taskId={s.drainTask.id} intervalDays={s.waterChange.intervalDays} />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-2">
              Mark a drain &amp; refill as done and this starts counting.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Trends">
        <Card>
          <TrendExplorer series={series} />
        </Card>
      </Section>

      <Section
        title="History"
        aside={
          <Link href="/history" className="-my-3 inline-block py-3 font-bold text-accent-ink">
            See all
          </Link>
        }
      >
        <Card flush>
          {events.length ? (
            events.map((e) => (
              <Row
                key={e.key}
                icon={e.icon}
                title={e.title}
                sub={`${format(ukClock(e.at), "EEE d MMM, HH:mm")}${e.sub ? ` · ${e.sub}` : ""}`}
              />
            ))
          ) : (
            <p className="px-3.5 py-4 text-sm text-ink-2">Nothing logged yet.</p>
          )}
        </Card>
      </Section>
    </div>
  );
}

function TestRow({ name, value, chip }: { name: string; value: string; chip: [string, Tone] }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 [&+&]:border-t [&+&]:border-line">
      <span className="min-w-0 flex-1 font-bold">{name}</span>
      <span className="num-tabular font-extrabold">{value}</span>
      <Chip tone={chip[1]}>{chip[0]}</Chip>
    </div>
  );
}
