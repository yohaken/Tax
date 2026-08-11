import { NextResponse } from "next/server";
import { getFiling, updateFilingNotes } from "@/lib/filings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const filing = await getFiling(id);
  if (!filing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ filing });
}

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  const body = await request.json();
  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes required" }, { status: 400 });
  }
  const noteColumn = body.noteColumn ?? body.column ?? "1";
  const filing = await updateFilingNotes(id, body.notes, noteColumn);
  if (!filing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ filing });
}
