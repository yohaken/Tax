#!/usr/bin/env node
/**
 * อ่าน/เขียนกระดานส่งงาน Agent
 *
 * ตัวอย่าง:
 *   node scripts/agent-status.mjs get
 *   node scripts/agent-status.mjs set local working "กำลังดาวน์โหลด PDF"
 *   node scripts/agent-status.mjs set local done "แนบครบ 6 ไฟล์"
 */
const BASE =
  process.env.MY_TAX_BASE ||
  "https://my-tax-470549580687.asia-southeast1.run.app";

const [cmd = "get", by, state, ...summaryParts] = process.argv.slice(2);
const summary = summaryParts.join(" ").trim();

async function main() {
  if (cmd === "get") {
    const res = await fetch(`${BASE}/api/agent-status`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === "set") {
    if (!by || !state || !summary) {
      console.error(
        'ใช้: node scripts/agent-status.mjs set <local|cloud> <state> "<summary>"',
      );
      process.exit(1);
    }
    const body = { by, state, summary };
    const res = await fetch(`${BASE}/api/agent-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.error("คำสั่ง: get | set");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
