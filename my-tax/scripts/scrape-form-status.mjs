#!/usr/bin/env node
/**
 * Mac-only: อ่านตารางจากแท็บ Chrome ที่เปิด form-status อยู่
 * Usage: npm run scrape:form-status
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "data", "seed");
const OUT_FILE = path.join(OUT_DIR, "form-status.json");

if (process.platform !== "darwin") {
  console.error("สคริปต์นี้ใช้บน macOS กับ Google Chrome เท่านั้น");
  process.exit(1);
}

const js = `
(function(){
  function clean(s){ return (s||'').replace(/\\s+/g,' ').trim(); }
  const body = clean(document.body.innerText);
  const rows = Array.from(document.querySelectorAll('table tr'));
  const filings = [];
  let pending = null;
  for (const r of rows) {
    const cells = Array.from(r.querySelectorAll('td,th')).map(c => clean(c.innerText)).filter(Boolean);
    if (cells.length >= 4 && /ภ\\.ง\\.ด\\.|PND/i.test(cells[0]) && /^P\\d+/.test(cells[1])) {
      pending = {
        formTypeLabel: cells[0],
        id: cells[1],
        status: cells[2],
        statusUpdatedAtRaw: cells[3]
      };
      continue;
    }
    if (pending && cells.length === 1 && /ปีภาษี/.test(cells[0])) {
      const t = cells[0];
      const year = Number((t.match(/ปีภาษี\\s*(\\d{4})/) || [])[1]);
      const additional = /ยื่นเพิ่มเติม/.test(t);
      const round = Number((t.match(/ครั้งที่\\s*(\\d+)/) || [])[1] || 0) || undefined;
      const formType = pending.formTypeLabel.includes('94') ? 'PND94'
        : pending.formTypeLabel.includes('90') ? 'PND90' : pending.formTypeLabel;
      filings.push({
        id: pending.id,
        formType,
        formTypeLabel: pending.formTypeLabel,
        taxYear: year || null,
        filingSequence: additional ? 'additional' : 'normal',
        additionalRound: additional ? (round || 1) : undefined,
        status: pending.status,
        statusUpdatedAtRaw: pending.statusUpdatedAtRaw,
        statusUpdatedAt: pending.statusUpdatedAtRaw,
        taxpayerName: 'นาย พีระพงษ์ โยหาเคน',
        tin: '1-42990-0078-74-2',
        documents: [],
        detail: {
          importedFrom: 'chrome-scrape-form-status',
          rawMeta: { sequenceLabel: t, pageUrl: location.href }
        }
      });
      pending = null;
    }
  }
  const nameMatch = body.match(/นาย[^\\n]+|นางสาว[^\\n]+|นาง[^\\n]+/);
  return JSON.stringify({
    scrapedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    taxpayerNameGuess: nameMatch ? clean(nameMatch[0]) : null,
    filings
  }, null, 2);
})();
`;

const apple = `
tell application "Google Chrome"
  set targetTab to missing value
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t as text) contains "rd-efiling-web/form-status" then
        set targetTab to t
        exit repeat
      end if
    end repeat
    if targetTab is not missing value then exit repeat
  end repeat
  if targetTab is missing value then
    return "ERROR::NO_TAB"
  end if
  tell targetTab
    return execute javascript ${JSON.stringify(js)}
  end tell
end tell
`;

try {
  const raw = execFileSync("osascript", ["-e", apple], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim();

  if (raw === "ERROR::NO_TAB") {
    console.error(
      "ไม่พบแท็บ form-status — เปิด https://efiling.rd.go.th/rd-efiling-web/form-status ก่อน",
    );
    process.exit(1);
  }

  const parsed = JSON.parse(raw);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(parsed, null, 2) + "\n");
  console.log(`บันทึก ${parsed.filings?.length || 0} รายการ -> ${OUT_FILE}`);
  console.log("ถัดไป: npm run import:seed");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
