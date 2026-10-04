// Care: jobs (or the same as a calendar), the winter plan, guides and help.
// Drawn by CareView.
import SetupNeeded from "@/components/SetupNeeded";
import CareView from "@/components/views/CareView";
import { loadTubState } from "@/lib/tubState";

export const dynamic = "force-dynamic";

export default async function CarePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const res = await loadTubState();
  if (!res.ok) return <SetupNeeded message={res.error} />;
  const view = (await searchParams).view === "calendar" ? "calendar" : "jobs";
  return <CareView s={res.state} view={view} />;
}
