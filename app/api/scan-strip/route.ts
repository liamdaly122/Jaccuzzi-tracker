import { NextResponse, type NextRequest } from "next/server";
import { getSettings, toSpaConfig } from "@/lib/data";
import { readTestStrip } from "@/lib/gemini";
import { normalizeScan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roughly 8 MB of base64 (~6 MB image) — enough for a phone photo, small enough
// to reject anything abusive before we forward it to Gemini.
const MAX_BASE64_CHARS = 8_000_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const imageBase64 =
    body && typeof body.imageBase64 === "string" ? body.imageBase64 : null;
  const mimeType =
    body && typeof body.mimeType === "string" ? body.mimeType : null;

  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "No photo received. Please try again." },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: "That image type isn't supported — try a normal photo." },
      { status: 400 },
    );
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "That photo is too large — try again a bit further back." },
      { status: 413 },
    );
  }

  let sanitizerType;
  try {
    const settings = await getSettings();
    sanitizerType = toSpaConfig(settings).sanitizerType;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Settings unavailable" },
      { status: 500 },
    );
  }

  const result = await readTestStrip(imageBase64, mimeType, sanitizerType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const values = normalizeScan(result.values, { sanitizerType });
  return NextResponse.json({ ok: true, values });
}
