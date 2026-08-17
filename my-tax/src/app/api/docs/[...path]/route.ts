import { NextResponse } from "next/server";
import { loadDocBuffer } from "@/lib/filings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_request: Request, context: Ctx) {
  const { path: parts } = await context.params;
  const rel = ["docs", ...parts].join("/");
  try {
    const data = await loadDocBuffer(rel);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const lower = rel.toLowerCase();
    const type = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".txt")
        ? "text/plain; charset=utf-8"
        : "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${parts.at(-1) || "file"}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
