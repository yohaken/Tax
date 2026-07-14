import { parseFile, dedupeTransactions } from "./parser.js";
import {
  loadState,
  saveState,
  clearState,
  extractKeywords,
  upsertRule,
  applyRules,
  smartSearch,
  formatMoney,
  formatDateTh,
  exportWorkbook,
} from "./storage.js";

const state = loadState();
const selectedIds = new Set();
let tagTargetIds = [];

const els = {
  empty: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  fileInput: document.getElementById("file-input"),
  dropzone: document.getElementById("dropzone"),
  search: document.getElementById("search-input"),
  dateFrom: document.getElementById("date-from"),
  dateTo: document.getElementById("date-to"),
  filterCategory: document.getElementById("filter-category"),
  filterDirection: document.getElementById("filter-direction"),
  txBody: document.getElementById("tx-body"),
  resultLabel: document.getElementById("result-label"),
  checkAll: document.getElementById("check-all"),
  categoryForm: document.getElementById("category-form"),
  newCategory: document.getElementById("new-category"),
  categoryList: document.getElementById("category-list"),
  ruleList: document.getElementById("rule-list"),
  categoryDatalist: document.getElementById("category-datalist"),
  tagDialog: document.getElementById("tag-dialog"),
  tagForm: document.getElementById("tag-form"),
  tagPreview: document.getElementById("tag-preview"),
  tagCategory: document.getElementById("tag-category"),
  tagNote: document.getElementById("tag-note"),
  tagLearn: document.getElementById("tag-learn"),
  tagCancel: document.getElementById("tag-cancel"),
  btnExport: document.getElementById("btn-export"),
  btnClear: document.getElementById("btn-clear"),
  btnApplyRules: document.getElementById("btn-apply-rules"),
  btnBulkTag: document.getElementById("btn-bulk-tag"),
  btnDemo: document.getElementById("btn-demo"),
  btnPeerland: document.getElementById("btn-peerland"),
  toast: document.getElementById("toast"),
  statCount: document.getElementById("stat-count"),
  statUncat: document.getElementById("stat-uncat"),
  statIn: document.getElementById("stat-in"),
  statOut: document.getElementById("stat-out"),
};

function persist() {
  saveState(state);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  const q = String(query || "").trim();
  if (!q || /^[><=]?\s*\d/.test(q) || q.includes("-")) return safe;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return safe;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return safe.replace(re, '<mark class="mark">$1</mark>');
}

function getFiltered() {
  let list = state.transactions;

  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  if (from) list = list.filter((t) => t.date && t.date >= from);
  if (to) list = list.filter((t) => t.date && t.date <= to);

  const cat = els.filterCategory.value;
  if (cat === "__uncat") list = list.filter((t) => !t.category);
  else if (cat) list = list.filter((t) => t.category === cat);

  const dir = els.filterDirection.value;
  if (dir) list = list.filter((t) => t.direction === dir);

  const searched = smartSearch(list, els.search.value);
  return searched
    .map((r) => r.item)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.amount || 0) - (a.amount || 0));
}

function updateStats(visible) {
  const uncat = state.transactions.filter((t) => !t.category).length;
  const sumIn = visible.filter((t) => t.direction === "in").reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut = visible.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0);
  els.statCount.textContent = String(state.transactions.length);
  els.statUncat.textContent = String(uncat);
  els.statIn.textContent = formatMoney(sumIn);
  els.statOut.textContent = formatMoney(sumOut);
  els.resultLabel.textContent = `แสดง ${visible.length} จาก ${state.transactions.length} รายการ`;
}

function renderCategories() {
  els.categoryList.innerHTML = state.categories
    .map(
      (c) => `<li><span>${escapeHtml(c)}</span><button type="button" class="mini-btn" data-del-cat="${escapeHtml(c)}" aria-label="ลบหมวด">ลบ</button></li>`
    )
    .join("");

  els.categoryDatalist.innerHTML = state.categories
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");

  const current = els.filterCategory.value;
  els.filterCategory.innerHTML =
    `<option value="">ทั้งหมด</option><option value="__uncat">ยังไม่ติดป้าย</option>` +
    state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if ([...els.filterCategory.options].some((o) => o.value === current)) {
    els.filterCategory.value = current;
  }
}

function renderRules() {
  if (!state.rules.length) {
    els.ruleList.innerHTML = `<li><span class="hint" style="margin:0">ยังไม่มีกฎ — ติดป้ายรายการแล้วติ๊ก “จำคำสำคัญ”</span></li>`;
    return;
  }
  els.ruleList.innerHTML = state.rules
    .slice(0, 20)
    .map(
      (r) => `<li>
        <span><strong>${escapeHtml(r.category)}</strong><br /><small>${escapeHtml(r.keywords.join(" · "))}</small></span>
        <button type="button" class="mini-btn" data-del-rule="${escapeHtml(r.id)}">ลบ</button>
      </li>`
    )
    .join("");
}

function renderTable() {
  const hasData = state.transactions.length > 0;
  els.empty.classList.toggle("is-hidden", hasData);
  els.workspace.classList.toggle("is-hidden", !hasData);

  renderCategories();
  renderRules();

  const visible = getFiltered();
  updateStats(visible);
  els.btnBulkTag.disabled = selectedIds.size === 0;

  els.txBody.innerHTML = visible
    .map((t) => {
      const checked = selectedIds.has(t.id) ? "checked" : "";
      const catLabel = t.category || "+ ติดป้าย";
      const catClass = t.category ? "has-tag" : "";
      return `<tr data-id="${t.id}">
        <td class="col-check"><input type="checkbox" data-check="${t.id}" ${checked} /></td>
        <td>${escapeHtml(formatDateTh(t.date))}</td>
        <td class="desc-cell">
          <div class="desc-main">${highlight(t.description, els.search.value)}</div>
          <div class="desc-sub">${escapeHtml(t.source || "")}${t.autoTagged ? " · อัตโนมัติ" : ""}</div>
        </td>
        <td class="num amount-in">${t.direction === "in" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td class="num amount-out">${t.direction === "out" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td class="category-cell"><button type="button" class="${catClass}" data-tag="${t.id}">${escapeHtml(catLabel)}</button></td>
        <td><input class="note-input" data-note="${t.id}" value="${escapeHtml(t.note || "")}" placeholder="หมายเหตุ" /></td>
      </tr>`;
    })
    .join("");

  const visibleIds = new Set(visible.map((t) => t.id));
  els.checkAll.checked = visible.length > 0 && visible.every((t) => selectedIds.has(t.id));
  els.checkAll.indeterminate = [...selectedIds].some((id) => visibleIds.has(id)) && !els.checkAll.checked;
}

async function importFiles(fileList) {
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;

  toast(`กำลังอ่าน ${files.length} ไฟล์…`);
  let imported = [];
  const errors = [];

  for (const file of files) {
    try {
      const rows = await parseFile(file);
      imported = imported.concat(rows);
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message || "อ่านไม่สำเร็จ"}`);
    }
  }

  imported = dedupeTransactions(imported);
  if (!imported.length) {
    toast(errors[0] || "ไม่พบรายการในไฟล์ — ลอง Excel/CSV หรือ PDF ที่คัดลอกข้อความได้");
    return;
  }

  // Merge with existing, dedupe across
  state.transactions = dedupeTransactions([...imported, ...state.transactions]);
  const applied = applyRules(state.transactions, state.rules);
  state.transactions = applied.transactions;
  state.rules = applied.rules;
  persist();
  renderTable();
  toast(`นำเข้า ${imported.length} รายการ${applied.applied ? ` · ติดป้ายอัตโนมัติ ${applied.applied}` : ""}`);
  if (errors.length) toast(`บางไฟล์มีปัญหา: ${errors[0]}`);
}

async function startDemo({ replace = false } = {}) {
  toast("กำลังโหลดข้อมูลทดสอบ…");
  try {
    const res = await fetch(new URL("sample-statement.csv", window.location.href));
    if (!res.ok) throw new Error(`โหลดตัวอย่างไม่สำเร็จ (${res.status})`);
    const text = await res.text();
    const file = new File([text], "sample-statement.csv", { type: "text/csv" });
    if (replace) {
      state.transactions = [];
      state.rules = [];
      selectedIds.clear();
    }
    await importFiles([file]);

    // Seed a couple of tags so test users see smart rules immediately
    const coffee = state.transactions.find((t) => /ร้านกาแฟ|กาแฟบ้านสวน/i.test(t.description));
    const grab = state.transactions.find((t) => /grab food/i.test(t.description));
    const rent = state.transactions.find((t) => /ค่าเช่า/i.test(t.description));
    if (coffee && !coffee.category) {
      coffee.category = "ค่าอาหาร";
      coffee.note = "ตัวอย่างป้ายอัตโนมัติ";
      state.rules = upsertRule(state.rules, {
        keywords: extractKeywords(coffee.description),
        category: "ค่าอาหาร",
      });
    }
    if (grab && !grab.category) {
      grab.category = "ค่าอาหาร";
      grab.note = "ตัวอย่าง";
      state.rules = upsertRule(state.rules, {
        keywords: extractKeywords(grab.description),
        category: "ค่าอาหาร",
      });
    }
    if (rent && !rent.category) {
      rent.category = "ค่าเช่า";
      rent.note = "ตัวอย่าง";
      state.rules = upsertRule(state.rules, {
        keywords: extractKeywords(rent.description),
        category: "ค่าเช่า",
      });
    }
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
    persist();
    renderTable();

    const params = new URLSearchParams(window.location.search);
    params.set("demo", "1");
    params.delete("peerland");
    const next = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
    const banner = document.getElementById("test-banner");
    if (banner) {
      banner.textContent = "โหมดทดสอบสั้น — โหลดข้อมูลตัวอย่างแล้ว";
      banner.classList.remove("is-hidden");
    }
    toast("โหมดทดสอบพร้อมแล้ว — ลองค้นหาหรือติดป้ายได้เลย");
  } catch (err) {
    console.error(err);
    toast(err.message || "เริ่มทดสอบไม่สำเร็จ");
  }
}

async function startPeerland({ replace = true } = {}) {
  toast("กำลังโหลด Peerland 2024–2025…");
  try {
    const res = await fetch(new URL("data/peerland_2024-2025.json", window.location.href));
    if (!res.ok) throw new Error(`โหลด Peerland ไม่สำเร็จ (${res.status})`);
    const payload = await res.json();
    const rows = Array.isArray(payload.transactions) ? payload.transactions : [];
    if (!rows.length) throw new Error("ไม่พบรายการในไฟล์ Peerland");

    if (replace) {
      state.transactions = [];
      state.rules = [];
      selectedIds.clear();
    }

    // Ensure categories useful for this statement
    const peerlandCats = [
      "รายได้ลูกค้า / QR",
      "Shopee / Lazada",
      "ชำระบัตรกสิกร",
      "โอนภายใน / ส่วนตัว",
      "ค่าธรรมเนียม",
      "สินค้า / ซูเปอร์มาร์เก็ต",
      "หลักทรัพย์ / ออม",
      "อื่นๆ",
    ];
    for (const c of peerlandCats) {
      if (!state.categories.includes(c)) state.categories.push(c);
    }

    state.transactions = dedupeTransactions([
      ...rows.map((t) => ({
        ...t,
        category: t.category || "",
        note: t.note || "",
        source: t.source || "peerland_2024-2025_full.pdf",
      })),
      ...state.transactions,
    ]);

    // Light starter rules from common merchants/channels in this statement
    const starter = [
      { keywords: ["ช้อปปี้เพย์", "shopee"], category: "Shopee / Lazada" },
      { keywords: ["lazada"], category: "Shopee / Lazada" },
      { keywords: ["บัตรกสิกรไทย"], category: "ชำระบัตรกสิกร" },
      { keywords: ["ค่าธรรมเนียม"], category: "ค่าธรรมเนียม" },
      { keywords: ["my qr", "รับโอนเงินผ่าน qr"], category: "รายได้ลูกค้า / QR" },
      { keywords: ["ซีพี แอ็กซ์ตร้า", "cp axtra"], category: "สินค้า / ซูเปอร์มาร์เก็ต" },
      { keywords: ["ksecurities", "หลักทรัพย์"], category: "หลักทรัพย์ / ออม" },
      { keywords: ["phiraphong yohakh", "พีระพงษ์ โยหาเ"], category: "โอนภายใน / ส่วนตัว" },
    ];
    for (const rule of starter) {
      state.rules = upsertRule(state.rules, rule);
    }
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
    persist();
    renderTable();

    const params = new URLSearchParams(window.location.search);
    params.set("peerland", "1");
    params.delete("demo");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    const banner = document.getElementById("test-banner");
    if (banner) {
      const count = state.transactions.length.toLocaleString("th-TH");
      const period = payload.meta?.period || "2024–2025";
      banner.textContent = `Peerland ${period} — โหลดแล้ว ${count} รายการ · ติดป้ายอัตโนมัติ ${applied.applied.toLocaleString("th-TH")} รายการ`;
      banner.classList.remove("is-hidden");
    }
    toast(`โหลด Peerland ${rows.length.toLocaleString("th-TH")} รายการแล้ว`);
  } catch (err) {
    console.error(err);
    toast(err.message || "โหลด Peerland ไม่สำเร็จ");
  }
}

function shouldAutostartDemo() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1" || params.get("test") === "1") return true;
  if (window.location.hash === "#demo") return true;
  return false;
}

function shouldAutostartPeerland() {
  const params = new URLSearchParams(window.location.search);
  return params.get("peerland") === "1" || window.location.hash === "#peerland";
}

function openTagDialog(ids) {
  tagTargetIds = ids;
  const samples = state.transactions.filter((t) => ids.includes(t.id));
  if (!samples.length) return;
  const first = samples[0];
  els.tagPreview.textContent =
    samples.length === 1
      ? `${formatDateTh(first.date)} · ${first.description} · ${formatMoney(first.amount)}`
      : `ติดป้าย ${samples.length} รายการที่เลือก`;
  els.tagCategory.value = first.category || "";
  els.tagNote.value = samples.length === 1 ? first.note || "" : "";
  els.tagLearn.checked = true;
  els.tagDialog.showModal();
  els.tagCategory.focus();
}

function commitTags(category, note, learn) {
  const cat = category.trim();
  if (!cat) return;
  if (!state.categories.includes(cat)) state.categories.unshift(cat);

  for (const id of tagTargetIds) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) continue;
    tx.category = cat;
    if (note != null) tx.note = note;
    tx.autoTagged = false;

    if (learn) {
      const keywords = extractKeywords(tx.description);
      state.rules = upsertRule(state.rules, { keywords, category: cat });
    }
  }

  // Suggest same category on similar untagged rows immediately
  if (learn) {
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
  }

  selectedIds.clear();
  persist();
  renderTable();
  toast(`บันทึกหมวด “${cat}” แล้ว`);
}

function wireEvents() {
  els.fileInput.addEventListener("change", (e) => {
    importFiles(e.target.files);
    e.target.value = "";
  });

  const dz = els.dropzone;
  const onDrag = (e) => {
    e.preventDefault();
    dz.classList.add("is-drag");
  };
  const onLeave = (e) => {
    e.preventDefault();
    dz.classList.remove("is-drag");
  };
  dz.addEventListener("dragenter", onDrag);
  dz.addEventListener("dragover", onDrag);
  dz.addEventListener("dragleave", onLeave);
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("is-drag");
    importFiles(e.dataTransfer.files);
  });
  dz.addEventListener("click", () => els.fileInput.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  // Also allow drop on whole window when workspace open
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    if (e.target.closest?.("#dropzone")) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files);
  });

  ["input", "change"].forEach((evt) => {
    els.search.addEventListener(evt, renderTable);
    els.dateFrom.addEventListener(evt, renderTable);
    els.dateTo.addEventListener(evt, renderTable);
    els.filterCategory.addEventListener(evt, renderTable);
    els.filterDirection.addEventListener(evt, renderTable);
  });

  els.categoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.newCategory.value.trim();
    if (!name) return;
    if (!state.categories.includes(name)) {
      state.categories.unshift(name);
      persist();
      renderTable();
      toast(`เพิ่มหมวด “${name}”`);
    }
    els.newCategory.value = "";
  });

  els.categoryList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-cat]");
    if (!btn) return;
    const name = btn.getAttribute("data-del-cat");
    state.categories = state.categories.filter((c) => c !== name);
    persist();
    renderTable();
  });

  els.ruleList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-rule]");
    if (!btn) return;
    const id = btn.getAttribute("data-del-rule");
    state.rules = state.rules.filter((r) => r.id !== id);
    persist();
    renderTable();
  });

  els.txBody.addEventListener("click", (e) => {
    const tagBtn = e.target.closest("[data-tag]");
    if (tagBtn) {
      openTagDialog([tagBtn.getAttribute("data-tag")]);
      return;
    }
  });

  els.txBody.addEventListener("change", (e) => {
    const check = e.target.closest("[data-check]");
    if (check) {
      const id = check.getAttribute("data-check");
      if (check.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      els.btnBulkTag.disabled = selectedIds.size === 0;
      return;
    }
  });

  els.txBody.addEventListener("change", (e) => {
    const note = e.target.closest("[data-note]");
    if (!note) return;
    const id = note.getAttribute("data-note");
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    tx.note = note.value;
    persist();
  });

  els.checkAll.addEventListener("change", () => {
    const visible = getFiltered();
    if (els.checkAll.checked) visible.forEach((t) => selectedIds.add(t.id));
    else visible.forEach((t) => selectedIds.delete(t.id));
    renderTable();
  });

  els.btnBulkTag.addEventListener("click", () => {
    if (!selectedIds.size) return;
    openTagDialog([...selectedIds]);
  });

  els.btnApplyRules.addEventListener("click", () => {
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
    persist();
    renderTable();
    toast(applied.applied ? `ติดป้ายอัตโนมัติ ${applied.applied} รายการ` : "ไม่มีรายการใหม่ที่เข้ากฎ");
  });

  els.tagCancel.addEventListener("click", () => els.tagDialog.close());

  els.tagForm.addEventListener("submit", (e) => {
    e.preventDefault();
    commitTags(els.tagCategory.value, els.tagNote.value, els.tagLearn.checked);
    els.tagDialog.close();
  });

  els.btnExport.addEventListener("click", () => {
    if (!state.transactions.length) {
      toast("ยังไม่มีข้อมูลให้ส่งออก");
      return;
    }
    exportWorkbook(getFiltered().length ? getFiltered() : state.transactions);
    toast("ส่งออกไฟล์ Excel แล้ว");
  });

  els.btnClear.addEventListener("click", () => {
    if (!confirm("ล้างรายการทั้งหมดที่เก็บในเครื่องนี้?")) return;
    clearState();
    state.transactions = [];
    state.categories = loadState().categories;
    state.rules = [];
    selectedIds.clear();
    renderTable();
    toast("ล้างข้อมูลแล้ว");
  });

  els.btnDemo?.addEventListener("click", () => startDemo({ replace: true }));
  els.btnPeerland?.addEventListener("click", () => startPeerland({ replace: true }));
}

wireEvents();
renderTable();

if (shouldAutostartPeerland()) {
  startPeerland({ replace: true });
} else if (!state.transactions.length && shouldAutostartDemo()) {
  startDemo({ replace: true });
}
