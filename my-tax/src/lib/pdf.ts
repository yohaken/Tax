import path from "path";
import { pathToFileURL } from "url";

let workerReady = false;

function ensureDomMatrix() {
  const g = globalThis as typeof globalThis & { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix !== "undefined") return;

  // pdf-parse/pdfjs checks for DOMMatrix at module load in Node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
    is2D = true;
    isIdentity = true;
    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a;
        this.m12 = this.b;
        this.m21 = this.c;
        this.m22 = this.d;
        this.m41 = this.e;
        this.m42 = this.f;
        this.isIdentity =
          this.a === 1 &&
          this.b === 0 &&
          this.c === 0 &&
          this.d === 1 &&
          this.e === 0 &&
          this.f === 0;
      }
    }
  } as any;
}

async function loadPdfParse() {
  ensureDomMatrix();
  const mod = await import("pdf-parse");
  return mod.PDFParse;
}

async function ensureWorker(PDFParse: {
  setWorker: (url: string) => void;
}) {
  if (workerReady) return;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "pdf-parse",
    "web",
    "pdf.worker.mjs",
  );
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  workerReady = true;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const PDFParse = await loadPdfParse();
  await ensureWorker(PDFParse);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text || "").trim();
  } finally {
    await parser.destroy();
  }
}
