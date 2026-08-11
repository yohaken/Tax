# Tax (monorepo)

รวมงานภาษีส่วนตัว 2 แอป ใน repo เดียว — เจ้าของ `yohaken@gmail.com`

| แอป | โฟลเดอร์ | ลิงก์ | ทำอะไร |
|---|---|---|---|
| **TaxTag** | `public/` | https://mynote-tax.web.app | จัดหมวดรายการโอน Peerland / TellTea จาก statement |
| **my-tax** | `my-tax/` | https://my-tax-470549580687.asia-southeast1.run.app | คลังยื่นแบบ ภ.ง.ด. จาก RD form-status + PDF + สรุปพิทเทิ้ล |

เดิม my-tax อยู่ที่ https://github.com/yohaken/my-tax — ย้ายเข้า repo นี้แล้ว (ต้นทางยัง public ชั่วคราวได้)

---

## TaxTag

โฮสต์ Firebase MyNote (`mynote-f1bbc`) · site `mynote-tax`

```bash
npm start          # http://localhost:4173
npm run deploy     # Firebase Hosting
```

รายละเอียด: ดูด้านล่าง / ประวัติใน git

**ลิงก์คงที่:** https://mynote-tax.web.app  
สำรอง: https://mynote-tax.firebaseapp.com

## my-tax

Next.js + Cloud Run · Firebase โปรเจกต์ `mypeer-501909` (ของเดิม — ย้ายไป mynote ทีหลังได้)

```bash
cd my-tax
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

คู่มือเต็ม: [`my-tax/README.md`](my-tax/README.md)

Deploy Cloud Run: push ที่แตะ `my-tax/**` หรือ workflow `Deploy my-tax Cloud Run`

---

## Deploy สรุป

| แอป | Trigger | Secret |
|---|---|---|
| TaxTag Hosting | push `main` → `Deploy TaxTag to Google Firebase` | `GCP_SA_KEY` |
| my-tax Cloud Run | push `main` ที่เปลี่ยน `my-tax/**` | `GCP_SA_KEY` |

โปรเจกต์ Firebase TaxTag: `mynote-f1bbc` · Hosting site: `mynote-tax`
