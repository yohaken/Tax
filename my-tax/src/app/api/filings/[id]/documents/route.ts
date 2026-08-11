import { NextResponse } from "next/server";
import { attachDocument } from "@/lib/filings";
import type { DocumentKind } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const { id } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  const kind = (form.get("kind") as DocumentKind | null) || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let extractedText: string | undefined;

  if (
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type === "application/pdf"
  ) {
    try {
      const { extractPdfText } = await import("@/lib/pdf");
      extractedText = await extractPdfText(buffer);
    } catch (err) {
      extractedText = `<<extract-failed: ${
        err instanceof Error ? err.message : "unknown"
      }>>`;
    }
  }

  try {
    const filing = await attachDocument(
      id,
      { name: file.name, buffer, kind },
      extractedText,
    );

    if (!filing) {
      return NextResponse.json({ error: "Filing not found" }, { status: 404 });
    }

    const latest = filing.documents.find((d) => d.label === file.name);

    return NextResponse.json({
      ok: true,
      filing,
      petit: filing.petit,
      extractedChars: extractedText?.length || 0,
      filePath: latest?.filePath,
      gcsPath: latest?.gcsPath,
      durable: Boolean(latest?.gcsPath),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "upload failed",
      },
      { status: 500 },
    );
  }
}
