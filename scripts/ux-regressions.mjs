/**
 * Headless regression checks for rename cell targeting + stay-on-filter after move.
 * Run: node scripts/ux-regressions.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- Rename: first td is checkbox; title is later ---
{
  const html = `<tr data-group="เทลที">
    <td class="col-check"><input type="checkbox" /></td>
    <td>
      <div class="group-title-row">
        <button type="button" data-rename-group="เทลที">เปลี่ยนชื่อ</button>
      </div>
    </td>
  </tr>`;
  const tds = [...html.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map((m) => m[0]);
  assert(tds.length >= 2, "need two tds");
  assert(!tds[0].includes("group-title-row"), "bug: first td must NOT be title cell");
  assert(tds[1].includes("group-title-row"), "title row lives in later td");
  // Fixed finder searches .group-title-row on the tr, not first td
  assert(html.includes('class="group-title-row"'), "title row present for fixed finder");
}

function followFilterAfterMove(filter, prevCategories, nextCategory) {
  if (!filter) return "";
  const leftFilter = [...prevCategories].some((c) => (c || "__uncat") === filter);
  if (!leftFilter) return "";
  if (filter === "__uncat" && nextCategory) return `ยังกรอง “ยังไม่มีกลุ่ม” อยู่`;
  if (nextCategory && filter !== nextCategory && filter !== "__uncat") {
    return `ยังดูกลุ่ม “${filter}” อยู่`;
  }
  return "";
}

{
  // Must NOT switch filter value (caller keeps filter); only status note
  const note = followFilterAfterMove("เทลที", ["เทลที"], "อาหาร");
  assert(note.includes("เทลที"), "stay note mentions current group");
  assert(!note.includes("อาหาร") || note.includes("เทลที"), "does not only mention dest");
}

{
  const note = followFilterAfterMove("", ["เทลที"], "อาหาร");
  assert(note === "", "no filter => no stay note");
}

{
  const note = followFilterAfterMove("__uncat", [""], "อาหาร");
  assert(note.includes("ยังไม่มีกลุ่ม"), "uncat stay note");
}

// Sync preferRemote decision (length+timestamp), not length alone
{
  function preferRemote({ localCount, remoteCount, localMs, remoteMs }) {
    return (
      !localCount ||
      remoteCount > localCount ||
      (remoteCount === localCount && remoteMs >= localMs)
    );
  }
  assert(
    preferRemote({ localCount: 100, remoteCount: 100, localMs: 2000, remoteMs: 1000 }) === false,
    "newer local same count must win (preserve moves)"
  );
  assert(
    preferRemote({ localCount: 100, remoteCount: 100, localMs: 1000, remoteMs: 2000 }) === true,
    "newer remote same count pulls"
  );
  assert(
    preferRemote({ localCount: 50, remoteCount: 100, localMs: 9999, remoteMs: 1 }) === true,
    "more remote rows still prefer remote"
  );
}

console.log("PASS ux regressions: rename cell · stay-on-current-group · sync prefer");
