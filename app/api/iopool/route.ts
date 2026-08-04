import { NextResponse } from "next/server";
import { getIopoolReading } from "@/lib/iopool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live reading straight from the iopool probe. Passcode-protected by the
// existing middleware. Read-only — importing it into a saved reading still goes
// through the normal /api/readings path, because the probe can't measure
// alkalinity and we won't invent it.
export async function GET() {
  const result = await getIopoolReading();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, pool: result.pool });
}
