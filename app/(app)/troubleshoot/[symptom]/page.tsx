import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import {
  diagnose,
  type TroubleshootReading,
  type Diagnosis,
} from "@/lib/troubleshoot";
import { getLatestReading, getSettings, toSpaConfig } from "@/lib/data";
import {
  DEFAULT_TARGET_RANGES,
  DEFAULT_DOSING_CONSTANTS,
  type SpaConfig,
} from "@/lib/chemistry";

export const dynamic = "force-dynamic";

type Params = Promise<{ symptom: string }>;

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
      };
    }
  } catch {
    // No DB yet — generic guidance still works.
  }

  const diagnosis: Diagnosis | null = diagnose(symptom, reading, config);
  if (!diagnosis) notFound();

  const anyFlagged = diagnosis.causes.some((c) => c.flagged);

  return (
    <div className="space-y-4">
      <Link href="/troubleshoot" className="text-sm font-medium text-brand-600">
        ← Other problems
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          {diagnosis.symptom.emoji} {diagnosis.symptom.title}
        </h1>
        <p className="text-sm text-slate-500">{diagnosis.symptom.blurb}</p>
      </div>

      {diagnosis.hasReading ? (
        anyFlagged ? (
          <Card className="border-amber-200 bg-amber-50">
            <p className="text-sm text-amber-800">
              💡 Based on your latest test, the most likely causes are marked{" "}
              <strong>Likely for you</strong> and shown first.
            </p>
          </Card>
        ) : (
          <Card className="border-emerald-200 bg-emerald-50">
            <p className="text-sm text-emerald-800">
              Your latest test looks in range, so this probably isn&apos;t a
              chemical-balance issue. Work through the causes below.
            </p>
          </Card>
        )
      ) : (
        <Card className="border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-600">
            Log a{" "}
            <Link href="/readings/new" className="font-medium text-brand-600">
              test reading
            </Link>{" "}
            and I&apos;ll point straight at the most likely cause. For now,
            here&apos;s the general list.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {diagnosis.causes.map((c, i) => (
          <Card
            key={i}
            className={c.flagged ? "border-amber-300 ring-1 ring-amber-200" : ""}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-800">{c.cause}</p>
              {c.flagged ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Likely for you
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.why}</p>
            <p className="mt-2 text-sm text-slate-800">
              <span className="font-medium">Fix: </span>
              {c.fix}
            </p>
            {c.guideKey ? (
              <Link
                href={`/guides/${c.guideKey}`}
                className="mt-2 inline-block text-sm font-medium text-brand-600"
              >
                Open the step-by-step guide →
              </Link>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/readings/new"
          className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Test the water
        </Link>
        <Link
          href="/guides"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Guides &amp; help
        </Link>
      </div>

      <p className="text-center text-xs text-slate-400">
        General guidance only — always follow your own product instructions.
      </p>
    </div>
  );
}
