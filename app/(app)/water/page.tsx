// Water: the probe's live numbers, the last strip test, heater protection,
// how old the water is, trends and recent history. Drawn by WaterView.
import SetupNeeded from "@/components/SetupNeeded";
import WaterView from "@/components/views/WaterView";
import { loadTubState } from "@/lib/tubState";

export const dynamic = "force-dynamic";

export default async function WaterPage() {
  const res = await loadTubState();
  if (!res.ok) return <SetupNeeded message={res.error} />;
  return <WaterView s={res.state} />;
}
