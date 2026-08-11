#!/usr/bin/env node
/**
 * หา TAX_FORM_*.pdf / ใบเสร็จ แล้วอัปโหลดเข้า live/local ให้เก็บถาวร (GCS)
 *
 * Usage:
 *   MY_TAX_BASE=https://my-tax-470549580687.asia-southeast1.run.app npm run import:pdfs
 *   MY_TAX_PDF_DIR=/path/to/pdfs MY_TAX_BASE=... npm run import:pdfs
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const base =
  process.env.MY_TAX_BASE ||
  "https://my-tax-470549580687.asia-southeast1.run.app";
const dir =
  process.env.MY_TAX_PDF_DIR || path.join(os.homedir(), "Downloads");

const REQUIRED = [
  "P940004519103",
  "P900016086817",
  "P940004518812",
  "P900015588262",
  "P940003923546",
  "P900015273022",
];

console.log("MY_TAX_BASE =", base);
console.log("PDF dir     =", dir);

if (!existsSync(dir)) {
  console.error("ไม่พบโฟลเดอร์", dir);
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((name) => /\.pdf$/i.test(name))
  .filter((name) => /TAX_FORM_|ใบเสร็จ|receipt|P90|P94/i.test(name))
  .map((name) => path.join(dir, name))
  .filter((p) => statSync(p).isFile());

if (!files.length) {
  console.log("ไม่พบ PDF ที่เกี่ยวข้องใน", dir);
  process.exit(0);
}

let ok = 0;
let durable = 0;
const refsDone = new Set();
const uploaded = [];

for (const filePath of files) {
  const name = path.basename(filePath);
  const ref = (name.match(/P\d{9,}/) || [])[0];
  if (!ref) {
    console.warn("ข้าม (ไม่พบเลขอ้างอิง):", name);
    continue;
  }

  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), name);
  form.append("kind", /ใบเสร็จ|receipt/i.test(name) ? "receipt" : "tax_form");

  const res = await fetch(`${base}/api/filings/${ref}/documents`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn("ล้มเหลว", name, data.error || data);
    continue;
  }

  ok += 1;
  if (data.durable || data.gcsPath) durable += 1;
  refsDone.add(ref);
  uploaded.push({ name, ref, gcsPath: data.gcsPath, filePath: data.filePath });

  // ตรวจว่าเปิดจาก live ได้
  if (data.filePath) {
    const check = await fetch(`${base}/api/${data.filePath}`);
    console.log(
      `✓ ${name} -> ${ref} · durable=${Boolean(data.gcsPath)} · open=${check.status} · ${data.petit?.headline || ""}`,
    );
  } else {
    console.log(`✓ ${name} -> ${ref} · (no filePath in response)`);
  }
}

const missing = REQUIRED.filter((r) => !refsDone.has(r));
console.log(`เสร็จ ${ok}/${files.length} ไฟล์ · durable ${durable} · refs ${refsDone.size}`);
if (missing.length) console.log("ยังขาดเลขอ้างอิง:", missing.join(", "));

// รายงานสถานะกลับกระดาน Agent
const summary = `อัปโหลด live แล้ว ${ok} ไฟล์ (durable ${durable}/${ok}) refs=${[...refsDone].join(",")}${
  missing.length ? ` missing=${missing.join(",")}` : ""
}`;

const statusRes = await fetch(`${base}/api/agent-status`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    by: "local",
    state: missing.length || durable < ok ? "blocked" : "done",
    summary,
    refsDone: [...refsDone],
    refsMissing: missing,
  }),
});
console.log("agent-status:", statusRes.status, summary);
