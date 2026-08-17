# Tax Hub — Phase Checklist

**URL เดียว:** https://mynote-tax.web.app  
เมนูด้านล่าง: **TaxTag · ยื่นแบบ · คำนวณภาษี** (same-origin `/`, `/filings`, `/calc`)

---

## Phase 1–5 ✅ (monorepo + bottom nav + cleanup)

## Phase 6 — Single URL (unified hub) ✅

- [x] Firebase Hosting `mynote-tax` rewrite `/filings`, `/calc`, `/api`, `/_next` → Cloud Run
- [x] Bottom nav ใช้ path เดียวกัน (ไม่สลับโดเมน)
- [x] my-tax canonical route `/filings` (TaxTag ครอบ `/`)
- [x] `mynote-mytax.web.app` → 301 redirect ไป hub
- [x] Build bump → **v70**

## Phase 7 — Deploy & verify ✅

- [x] CI deploy TaxTag + my-tax rewrites (v70)
- [x] `npm run test:smoke-hub` (EXPECT_VERSION=70)
- [ ] ทดสอบ login Google บน `/filings` และ `/calc` (manual)

## Phase 8 — Fix personal tax calc (หักค่าใช้จ่าย) ✅

- [x] ลำดับถูก: เงินได้ → **ค่าใช้จ่าย** → ลดหย่อน → สุทธิ → ขั้นบันได
- [x] ครึ่งปี (ภ.ง.ด.94): เหมา 60% default · ลดหย่อน÷2 · อัตราขั้นบันไดชุดเดิม
- [x] Regression ข้อ 6–7: 400k เหมา60% ส่วนตัว30k → สุทธิ 130k → ภาษี 0
- [x] ทั้งปี: เงินเดือน 50% เพดาน 100k

## Phase 9 — Unified calc page (ครึ่งปี + ทั้งปี) ✅

- [x] หน้าเดียว: ครึ่งปีบน / ทั้งปีล่าง — ไม่สลับโหมด
- [x] ติ๊กค้าง「ใช้ครึ่งปี × 2」→ รายได้ทั้งปี derived · ลดหย่อนสิทธิเต็มปี · คิดขั้นบันไดใหม่
- [x] ช่องบาท/เดือน × 6 → รายได้ครึ่งปี (ประหยัดแนวนอน)
- [x] Regression: link midyear×2 ≠ tax×2

## Phase 10 — ข้อมูล & workflow (ถัดไป) ⬜

- [ ] Scrape form-status จาก RD
- [ ] Import PDF เข้าคลัง
- [ ] สรุปพิทเทิ้ล AI

---

## Routes (mynote-tax.web.app)

| Path | แอป |
|---|---|
| `/` | TaxTag |
| `/filings` | คลังยื่นแบบ |
| `/filings/[id]` | รายละเอียดแบบ |
| `/calc` | คำนวณภาษี |
| `/years/[year]` | redirect → `/filings?year=` |
