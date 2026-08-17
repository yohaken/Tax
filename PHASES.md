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

## Phase 7 — Deploy & verify ⬜

- [ ] CI deploy TaxTag + my-tax rewrites
- [ ] `npm run test:smoke-hub` (EXPECT_VERSION=70)
- [ ] ทดสอบ login Google บน `/filings` และ `/calc`

## Phase 8 — ข้อมูล & workflow (ถัดไป) ⬜

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
