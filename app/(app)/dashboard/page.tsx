// =============================================================================
//  Today — what to do now, and nothing else. Three numbers about the water,
//  one ranked list of things to do (each a single line with its reasons one
//  tap away), and the four things you might want to log. Everything else lives
//  on Water, Heat and Care.
// =============================================================================

import SetupNeeded from "@/components/SetupNeeded";
import TodayFromState from "@/components/views/TodayFromState";
import { loadTubState } from "@/lib/tubState";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const res = await loadTubState();
  if (!res.ok) return <SetupNeeded message={res.error} />;
  return <TodayFromState s={res.state} />;
}
