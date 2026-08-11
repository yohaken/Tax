import { NextResponse } from "next/server";
import { summarizeFiling } from "@/lib/filings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const { id } = await context.params;
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  const result = await summarizeFiling(id, { force });
  if (!result) {
    return NextResponse.json({ error: "Filing not found" }, { status: 404 });
  }
  if (result.mode === "none") {
    return NextResponse.json(
      { error: result.error || "ไม่มีไฟล์ให้สรุป", mode: result.mode },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    mode: result.mode,
    error: result.error,
    filing: result.filing,
    petit: result.filing.petit,
  });
}
