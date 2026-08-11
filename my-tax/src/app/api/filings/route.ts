import { NextResponse } from "next/server";
import {
  getNoteColumnCount,
  getTaxpayer,
  listFilings,
  readStore,
  setNoteColumnCount,
  upsertFilings,
} from "@/lib/filings";
import { buildPetitSummary } from "@/lib/petit";
import type { Filing } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const [filings, taxpayer, store, noteColumnCount] = await Promise.all([
    listFilings(),
    getTaxpayer(),
    readStore(),
    getNoteColumnCount(),
  ]);
  return NextResponse.json({
    taxpayer,
    source: store.source,
    filings,
    noteColumnCount,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (typeof body.noteColumnCount === "number") {
    const noteColumnCount = await setNoteColumnCount(body.noteColumnCount);
    return NextResponse.json({ ok: true, noteColumnCount });
  }
  return NextResponse.json({ error: "unsupported patch" }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const incoming = (body.filings || body) as Filing[];

  if (!Array.isArray(incoming)) {
    return NextResponse.json(
      { error: "Expected { filings: Filing[] }" },
      { status: 400 },
    );
  }

  const normalized = incoming.map((f) => ({
    ...f,
    documents: f.documents || [],
    petit: f.petit || buildPetitSummary(f),
    importedAt: f.importedAt || new Date().toISOString(),
  }));

  const store = await upsertFilings(normalized);
  return NextResponse.json({ ok: true, count: store.filings.length, store });
}
