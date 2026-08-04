import { NextResponse, type NextRequest } from "next/server";
import { getIopoolReading } from "@/lib/iopool";
import { captureProbeReading } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live reading straight from the iopool probe. Passcode-protected by the
// existing middleware. Read-only — importing it into a saved reading still goes
// through the normal /api/readings path, because the probe can't measure
// alkalinity and we won't invent it.
export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const result = await getIopoolReading({ fresh });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Keep the measurement. Deduped on the probe's own timestamp, so repeat
  // reads of an unchanged value cost nothing.
  await captureProbeReading(result.pool.measure);

  return NextResponse.json({ ok: true, pool: result.pool });
}
