import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { Callout, Card, Chip, LinkButton } from "@/components/ui";
import {
  diagnose,
  type TroubleshootReading,
  type Diagnosis,
} from "@/lib/troubleshoot";
import {
  getLatestReading,
  getSettings,
  toSpaConfig,
  getRecentProbeReadings,
} from "@/lib/data";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "@/lib/chemistry";

export const dynamic = "force-dynamic";

type Params = Promise<{ symptom: string }>;

// Best-effort: no probe, no probe table, no problem — the saturation check
// falls back to the assumed spa temperature.
async function latestProbeTemperature(): Promise<number | null> {
  try {
    const rows = await getRecentProbeReadings(1);
    const t = rows[0]?.temperature_c;
    return t === null || t === undefined ? null : Number(t);
  } catch {
    return null;
  }
}

export default async function SymptomPage({ params }: { params: Params }) {
  const { symptom } = await params;

  // Pull the latest reading + config so the diagnosis can be personalised. If
  // the DB isn't set up yet, fall back to generic (reading-less) guidance.
  let reading: TroubleshootReading | null = null;
  let config: SpaConfig = {
    volumeLitres: 1000,
    sanitizerType: "chlorine",
    targetRanges: DEFAULT_TARGET_RANGES,
    dosingConstants: DEFAULT_DOSING_CONSTANTS,
  };
  try {
    const settings = await getSettings();
    config = toSpaConfig(settings);
    const latest = await getLatestReading();
    if (latest) {
      reading = {
        ph: latest.ph === null ? null : Number(latest.ph),
        freeChlorinePpm:
          latest.free_chlorine_ppm === null ? null : Number(latest.free_chlorine_ppm),
        brominePpm:
          latest.bromine_ppm === null ? null : Number(latest.bromine_ppm),
        totalAlkalinityPpm:
          latest.total_alkalinity_ppm === null
            ? null
            : Number(latest.total_alkalinity_ppm),
        calciumHardnessPpm:
          latest.calcium_hardness_ppm === null
            ? null
            : Number(latest.calcium_hardness_ppm),
        cyanuricAcidPpm:
          latest.cyanuric_acid_ppm === null
            ? null
            : Number(latest.cyanuric_acid_ppm),
        // The probe's latest water temperature, for the saturation-index check.
        temperatureC: await latestProbeTemperature(),
      };
    }
  } catch {
    // No DB yet — generic guidance still works.
  }

  const diagnosis: Diagnosis | null = diagnose(symptom, reading, config);
  if (!diagnosis) notFound();

  const anyFlagged = diagnosis.causes.some((c) => c.flagged);

  return (
    <div className="grid gap-[18px]">
      <PageHeader
        title={diagnosis.symptom.title}
        subtitle={diagnosis.symptom.blurb}
        back={{ href: "/troubleshoot", label: "Other problems" }}
      />

      {diagnosis.hasReading ? (
        anyFlagged ? (
          <Callout tone="warn" icon="bulb">
            From your last test, the likeliest causes are marked and shown first.
          </Callout>
        ) : (
          <Callout tone="good" icon="check-circle">
            Your last test was in range, so this probably isn&apos;t the chemicals. Work through
            the causes below.
          </Callout>
        )
      ) : (
        <Callout tone="neutral" icon="flask">
          Save a test and the likeliest cause gets marked. For now, here&apos;s the general list.
        </Callout>
      )}

      <Card flush>
        {diagnosis.causes.map((c, i) => (
          <div key={i} className="px-3.5 py-3.5 [&+&]:border-t [&+&]:border-line">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold leading-snug">{c.cause}</p>
              {c.flagged ? <Chip tone="warn">Likely for you</Chip> : null}
            </div>
            <p className="mt-1 text-[14px] leading-snug text-ink-2">{c.why}</p>
            <p className="mt-2 text-[14.5px] leading-snug">
              <span className="font-bold">Fix: </span>
              {c.fix}
            </p>
            {c.guideKey ? (
              <LinkButton href={`/guides/${c.guideKey}`} variant="text" size="sm" className="-ml-3 mt-1">
                Step-by-step guide
              </LinkButton>
            ) : null}
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/readings/new" className="min-w-[140px] flex-1">
          Test the water
        </LinkButton>
        <LinkButton href="/guides" variant="line" className="min-w-[140px] flex-1">
          Guides
        </LinkButton>
      </div>

      <p className="text-center text-[13px] text-ink-3">
        General guidance only. Always follow your own products&apos; instructions.
      </p>
    </div>
  );
}
