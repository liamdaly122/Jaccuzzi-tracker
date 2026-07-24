import { NextResponse } from "next/server";
import { getTasks } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tasks = await getTasks();
    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tasks" },
      { status: 500 },
    );
  }
}
