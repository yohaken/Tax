/**
 * Amount-range filter + selection helpers regression.
 * Run: node scripts/regress-amount-drag.mjs
 */
import {
  filterByAmountRanges,
  parseAmountBound,
} from "../public/js/storage.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

const txs = [
  { id: "1", direction: "in", amount: 100 },
  { id: "2", direction: "in", amount: 5000 },
  { id: "3", direction: "out", amount: 200 },
  { id: "4", direction: "out", amount: 8000 },
  { id: "5", direction: "in", amount: 1500 },
  { id: "6", direction: "out", amount: 1500 },
];

assert(parseAmountBound("") === null, "empty bound null");
assert(parseAmountBound("1,500") === 1500, "comma stripped");
assert(parseAmountBound("abc") === null, "invalid null");

{
  const r = filterByAmountRanges(txs, { inMin: 1000, inMax: 6000 });
  assert(r.map((t) => t.id).join(",") === "2,5", `เข้า 1000-6000 → ${r.map((t) => t.id)}`);
}
{
  const r = filterByAmountRanges(txs, { outMin: 100, outMax: 500 });
  assert(r.map((t) => t.id).join(",") === "3", `ออก 100-500 → ${r.map((t) => t.id)}`);
}
{
  const r = filterByAmountRanges(txs, { valMin: 1400, valMax: 1600 });
  assert(r.map((t) => t.id).join(",") === "5,6", `มูลค่า 1400-1600`);
}
{
  // both in+out → OR
  const r = filterByAmountRanges(txs, { inMin: 4000, inMax: 9000, outMin: 100, outMax: 300 });
  assert(r.map((t) => t.id).join(",") === "2,3", `เข้า+ออก OR → ${r.map((t) => t.id)}`);
}
{
  // value AND direction
  const r = filterByAmountRanges(txs, { inMin: 0, inMax: 99999, valMin: 1000, valMax: 2000 });
  assert(r.map((t) => t.id).join(",") === "5", `เข้า + มูลค่า narrow → ${r.map((t) => t.id)}`);
}
{
  const r = filterByAmountRanges(txs, {});
  assert(r.length === txs.length, "no ranges = passthrough");
}
{
  // inverted bounds auto-swap (6000–4000 → 4000–6000)
  const r = filterByAmountRanges(txs, { valMin: 6000, valMax: 4000 });
  assert(r.map((t) => t.id).join(",") === "2", `swapped bounds → ${r.map((t) => t.id)}`);
}

// Simulate drag select paint on/off
{
  const selected = new Set();
  function apply(id, mode) {
    if (mode === "on") selected.add(id);
    else selected.delete(id);
  }
  // start on row1 (off→on), drag across 2,3
  apply("1", "on");
  apply("2", "on");
  apply("3", "on");
  assert([...selected].join(",") === "1,2,3", "drag paint on");
  // start on row2 (on→off), drag 2,3
  apply("2", "off");
  apply("3", "off");
  assert([...selected].join(",") === "1", "drag paint off leaves others");
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll amount/drag regressions passed");
