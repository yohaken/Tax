import { NextResponse } from "next/server";
import { summarizeAllFilings } from "@/lib/filings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  const result = await summarizeAllFilings({ force });
  const aiCount = result.results.filter((r) => r.mode === "ai").length;
  const regexCount = result.results.filter((r) => r.mode === "regex").length;
  const cachedCount = result.results.filter((r) => r.mode === "cached").length;
  const missing = result.results.filter((r) => r.mode === "none").length;
  return NextResponse.json({
    ok: true,
    force,
    aiCount,
    regexCount,
    cachedCount,
    missing,
    results: result.results,
    count: result.results.length,
  });
}
