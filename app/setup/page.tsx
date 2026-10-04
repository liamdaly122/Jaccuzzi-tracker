import SetupWizard from "@/components/SetupWizard";
import SetupNeeded from "@/components/SetupNeeded";
import { getSettings, getTasks } from "@/lib/data";
import { isScanConfigured } from "@/lib/gemini";
import { isIopoolConfigured } from "@/lib/iopool";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let settings;
  let drainRefillTaskId: number | null = null;
  try {
    settings = await getSettings();
    try {
      const tasks = await getTasks();
      drainRefillTaskId =
        tasks.find((t) => t.task_key === "drain_refill")?.id ?? null;
    } catch {
      drainRefillTaskId = null;
    }
  } catch (err) {
    return (
      <div className="mx-auto max-w-[440px] p-4">
        <SetupNeeded
          message={err instanceof Error ? err.message : "Unknown error"}
        />
      </div>
    );
  }

  return (
    <SetupWizard
      settings={settings}
      drainRefillTaskId={drainRefillTaskId}
      scanEnabled={isScanConfigured()}
      iopoolEnabled={isIopoolConfigured()}
    />
  );
}
