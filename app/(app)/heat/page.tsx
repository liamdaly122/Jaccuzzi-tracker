// Heat: when to switch on, what it costs, and the weather. Drawn by HeatView.
import SetupNeeded from "@/components/SetupNeeded";
import HeatView from "@/components/views/HeatView";
import { loadTubState } from "@/lib/tubState";

export const dynamic = "force-dynamic";

export default async function HeatPage() {
  const res = await loadTubState();
  if (!res.ok) return <SetupNeeded message={res.error} />;
  return <HeatView s={res.state} />;
}
