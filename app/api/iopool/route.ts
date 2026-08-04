import { NextResponse, type NextRequest } from "next/server";
import { getIopoolReading } from "@/lib/iopool";

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
  return NextResponse.json({ ok: true, pool: result.pool });
}
