import ReadingForm from "@/components/ReadingForm";
import SetupNeeded from "@/components/SetupNeeded";
import { getSettings, toSpaConfig } from "@/lib/data";
import { isScanConfigured } from "@/lib/gemini";
import { isIopoolConfigured } from "@/lib/iopool";

export const dynamic = "force-dynamic";

export default async function NewReadingPage() {
  try {
    const settings = await getSettings();
    const config = toSpaConfig(settings);
    return (
      <ReadingForm
        sanitizerType={config.sanitizerType}
        targetRanges={config.targetRanges}
        scanEnabled={isScanConfigured()}
        sanitizerUnit={config.sanitizerUnit}
        iopoolEnabled={isIopoolConfigured()}
      />
    );
  } catch (err) {
    return <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />;
  }
}
