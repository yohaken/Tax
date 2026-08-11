#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const seedPath = path.join(process.cwd(), "data", "seed", "form-status.json");
const fallback = path.join(process.cwd(), "data", "filings.json");
const base = process.env.MY_TAX_BASE || "http://localhost:3000";

const source = existsSync(seedPath) ? seedPath : fallback;
const raw = JSON.parse(readFileSync(source, "utf8"));
const filings = raw.filings || [];

if (!filings.length) {
  console.error("ไม่พบ filings ใน", source);
  process.exit(1);
}

const res = await fetch(`${base}/api/filings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ filings }),
});

const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}
console.log(`นำเข้าจาก ${source} สำเร็จ · รวม ${data.count} รายการ`);
