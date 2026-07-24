import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getRecentDosing } from "@/lib/data";
import { dosingSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const dosing = await getRecentDosing(50);
    return NextResponse.json({ dosing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dosing log" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = dosingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid dosing entry", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("dosing_log")
    .insert({
      reading_id: parsed.data.readingId ?? null,
      chemical: parsed.data.chemical,
      amount_grams: parsed.data.amountGrams,
      note: parsed.data.note ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ dosing: data });
}
