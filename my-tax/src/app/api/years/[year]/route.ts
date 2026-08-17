import { NextResponse } from "next/server";
import { getYearSummary } from "@/lib/filings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ year: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { year } = await context.params;
  const n = Number(year);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }
  const summary = await getYearSummary(n);
  return NextResponse.json(summary);
}
