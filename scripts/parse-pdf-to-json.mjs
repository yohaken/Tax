#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjs = await import(pathToFileURL(path.join(pdfjsPath, "build/pdf.mjs")).href);

// Import TaxTag PDF line parser pieces by duplicating light logic via dynamic import of browser module with mocks is hard.
// So we extract lines then reuse parsePdfLines from public/js/parser.js via temporary patch of import.
const parserUrl = pathToFileURL(path.resolve("public/js/parser.js")).href;

// Parser imports nothing for parsePdfLines/extract - but extractPdfTextLines uses CDN. We'll extract here and call parsePdfLines.
const { parsePdfLines, dedupeTransactions } = await import(parserUrl);

async function extractLines(buffer) {
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      const str = item.str;
      if (!str) continue;
      const y = Math.round((item.transform?.[5] ?? 0) * 2) / 2;
      const key = String(y);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: item.transform?.[4] ?? 0, str });
    }
    const sortedY = [...rows.keys()].map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const parts = rows
        .get(String(y))
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str);
      lines.push(parts.join(" "));
    }
  }
  await doc.destroy?.();
  return lines;
}

const pdfPath = process.argv[2] || "public/telltea_2024-2025_full.pdf";
const outPath = process.argv[3] || "public/data/telltea_2024-2025.json";
const fileName = path.basename(pdfPath);
const buffer = new Uint8Array(fs.readFileSync(pdfPath));
console.log("pages extract…", pdfPath, buffer.byteLength);
const lines = await extractLines(buffer);
console.log("lines", lines.length);
let txs = parsePdfLines(lines, fileName);
txs = dedupeTransactions(txs);
console.log("transactions", txs.length);
const payload = {
  source: fileName,
  generatedAt: new Date().toISOString(),
  count: txs.length,
  transactions: txs,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload));
// also write a sample of first lines for debug
fs.writeFileSync(outPath.replace(/\.json$/, ".lines.txt"), lines.slice(0, 80).join("\n"));
console.log("wrote", outPath);
