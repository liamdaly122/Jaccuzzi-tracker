import ReadingForm from "@/components/ReadingForm";
import SetupNeeded from "@/components/SetupNeeded";
import { getSettings, toSpaConfig } from "@/lib/data";
import { isScanConfigured } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export default async function NewReadingPage() {
  try {
    const settings = await getSettings();
    const config = toSpaConfig(settings);
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold text-slate-800">Test the water</h1>
        <ReadingForm
          sanitizerType={config.sanitizerType}
          targetRanges={config.targetRanges}
          scanEnabled={isScanConfigured()}
        />
      </div>
    );
  } catch (err) {
    return (
      <SetupNeeded
        message={err instanceof Error ? err.message : "Unknown error"}
      />
    );
  }
}
