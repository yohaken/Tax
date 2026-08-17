# Tax Hub — Phase Checklist

ศูนย์กลาง: **https://mynote-tax.web.app** (TaxTag)  
เมนูด้านล่างสลับไป: **TaxTag · ยื่นแบบ · คำนวณภาษี**

---

## Phase 1 — Restore my-tax ✅

- [x] คืนโฟลเดอร์ `my-tax/` จาก git history (filings, calc, API, PDF)
- [x] คืน workflow `Deploy my-tax (Cloud Run + Hosting)`
- [x] คืน Firebase Hosting rewrite → `mynote-mytax.web.app`
- [x] `npm run build` ใน my-tax ผ่าน

## Phase 2 — Bottom nav hub (TaxTag เป็นหลัก) ✅

- [x] แถบเมนูด้านล่างบน `mynote-tax.web.app` — TaxTag · ยื่นแบบ · คำนวณภาษี
- [x] เอาเมนูด้านบน (app-switch) ออก — ใช้ bottom nav อย่างเดียว
- [x] ปรับ padding toast / progress ไม่ทับเมนู
- [x] Build bump → **v68**

## Phase 3 — Bottom nav บน my-tax ✅

- [x] `TaxHubNav` ใน my-tax — เมนูเดียวกัน 3 แท็บ
- [x] ลิงก์ TaxTag → `mynote-tax.web.app`
- [x] ยื่นแบบ / คำนวณภาษี → route ภายใน my-tax

## Phase 4 — Deploy & verify ⬜

- [ ] Merge PR → `main`
- [ ] CI: Deploy TaxTag → https://mynote-tax.web.app
- [ ] CI: Deploy my-tax Cloud Run → https://mynote-mytax.web.app
- [ ] ทดสอบ bottom nav ทั้ง 3 แท็บ (มือถือ + desktop)
- [ ] Login Google ทั้งสองโดเมน (`mynote-tax` + `mynote-mytax`)

## Phase 5 — ข้อมูล & workflow (ถัดไป) ⬜

- [ ] Scrape form-status จาก RD (Mac + Chrome)
- [ ] Import PDF แบบ/ใบเสร็จเข้าคลัง
- [ ] สรุปพิทเทิ้ล AI ครบทุกแบบ
- [ ] ซิงค์ค่าลดหย่อนจาก calc → ยื่นแบบ (ถ้าต้องการ)

---

## หน้า my-tax (mynote-mytax.web.app)

| Route | หน้า |
|---|---|
| `/` | คลังยื่นแบบ ภ.ง.ด. |
| `/filings` | redirect → `/` |
| `/filings/[id]` | รายละเอียด + PDF |
| `/calc` | คำนวณภาษี |
| `/years/[year]` | มุมมองรายปี |
