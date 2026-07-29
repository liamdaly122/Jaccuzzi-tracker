import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getRecentUsage } from "@/lib/data";
import { usageSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const usage = await getRecentUsage(50);
    return NextResponse.json({ usage });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load usage" },
      { status: 500 },
    );
  }
}

// Log a soak (a use of the tub) with how many people were in it.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid usage entry", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("usage_log")
    .insert({
      bathers: parsed.data.bathers,
      used_at: parsed.data.usedAt ?? new Date().toISOString(),
      note: parsed.data.note ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ usage: data });
}
