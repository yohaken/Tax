#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjs = await import(pathToFileURL(path.join(pdfjsPath, "build/pdf.mjs")).href);

const parserUrl = pathToFileURL(path.resolve("public/js/parser.js")).href;
const {
  parsePdfLines,
  dedupeTransactions,
  reconcileDirectionsFromBalances,
  parseMoney,
} = await import(parserUrl);

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
  return { lines, numPages: doc.numPages };
}

function extractStatementSummary(lines, numPages) {
  const summary = {
    pageCount: numPages,
    pageLabelMax: null,
    pageLabelTotal: null,
    closingBalance: null,
    withdrawCount: null,
    withdrawTotal: null,
    depositCount: null,
    depositTotal: null,
    periodFrom: null,
    periodTo: null,
    incompleteFile: false,
  };
  for (const line of lines) {
    const t = String(line || "");
    let m = t.match(/หน้าที่\s*\(PAGE\/OF\)\s*(\d+)\s*\/\s*(\d+)/i);
    if (m) {
      const cur = Number(m[1]);
      const total = Number(m[2]);
      if (summary.pageLabelMax == null || cur > summary.pageLabelMax) summary.pageLabelMax = cur;
      summary.pageLabelTotal = total;
    }
    m = t.match(/ยอดยกไป\s+([\d,]+\.\d{2})/);
    if (m) summary.closingBalance = parseMoney(m[1]);
    m = t.match(/รวมถอนเงิน\s+([\d,]+)\s+รายการ\s+([\d,]+\.\d{2})/);
    if (m) {
      summary.withdrawCount = Number(String(m[1]).replace(/,/g, ""));
      summary.withdrawTotal = parseMoney(m[2]);
    }
    m = t.match(/รวมฝากเงิน\s+([\d,]+)\s+รายการ\s+([\d,]+\.\d{2})/);
    if (m) {
      summary.depositCount = Number(String(m[1]).replace(/,/g, ""));
      summary.depositTotal = parseMoney(m[2]);
    }
    m = t.match(/รอบระหว่างวันที่\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if (m) {
      summary.periodFrom = m[1];
      summary.periodTo = m[2];
    }
  }
  if (
    summary.pageLabelTotal &&
    summary.pageCount &&
    summary.pageCount < summary.pageLabelTotal
  ) {
    summary.incompleteFile = true;
  }
  return summary;
}

const pdfPath = process.argv[2] || "public/telltea_2024-2025_full.pdf";
const outPath = process.argv[3] || "public/data/telltea_2024-2025.json";
const fileName = path.basename(pdfPath);
const buffer = new Uint8Array(fs.readFileSync(pdfPath));
console.log("pages extract…", pdfPath, buffer.byteLength);
const { lines, numPages } = await extractLines(buffer);
console.log("pages", numPages, "lines", lines.length);
const statementSummary = extractStatementSummary(lines, numPages);
console.log("statement summary", statementSummary);

let txs = parsePdfLines(lines, fileName);
txs = dedupeTransactions(txs);
const reconciled = reconcileDirectionsFromBalances(txs);
txs = reconciled.transactions;
console.log("direction fixes from balance", reconciled.fixed);
console.log("transactions", txs.length);

const money = txs.filter((t) => t.amount > 0);
const inns = money.filter((t) => t.direction === "in");
const outs = money.filter((t) => t.direction === "out");
const sum = (arr) => arr.reduce((s, t) => s + t.amount, 0);
const parsed = {
  movementCount: money.length,
  depositCount: inns.length,
  depositTotal: Number(sum(inns).toFixed(2)),
  withdrawCount: outs.length,
  withdrawTotal: Number(sum(outs).toFixed(2)),
  lastBalance: money.filter((t) => t.balance != null).slice(-1)[0]?.balance ?? null,
};
console.log("parsed totals", parsed);
if (statementSummary.depositTotal != null) {
  console.log(
    "delta vs statement header",
    "in",
    parsed.depositCount - statementSummary.depositCount,
    (parsed.depositTotal - statementSummary.depositTotal).toFixed(2),
    "out",
    parsed.withdrawCount - statementSummary.withdrawCount,
    (parsed.withdrawTotal - statementSummary.withdrawTotal).toFixed(2)
  );
}

const payload = {
  source: fileName,
  generatedAt: new Date().toISOString(),
  count: txs.length,
  statementSummary,
  parsedTotals: parsed,
  transactions: txs,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log("wrote", outPath);
