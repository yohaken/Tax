# Tax (monorepo)

รวมงานภาษีส่วนตัว 2 แอป ใน repo เดียว — เจ้าของ `yohaken@gmail.com`

| แอป | โฟลเดอร์ | ลิงก์ | ทำอะไร |
|---|---|---|---|
| **TaxTag** | `public/` | https://mynote-tax.web.app | จัดหมวด statement — **ศูนย์กลาง + bottom nav** |
| **my-tax** | `my-tax/` | https://mynote-mytax.web.app | คลังยื่นแบบ ภ.ง.ด. + คำนวณภาษี + สรุปพิทเทิ้ล |

เช็คลิส rollout: [`PHASES.md`](PHASES.md)

ทั้งคู่โฮสต์บน Firebase **`mynote-f1bbc`**

---

## TaxTag

```bash
npm start          # http://localhost:4173
npm run deploy     # Firebase Hosting site mynote-tax
```

**ลิงก์:** https://mynote-tax.web.app (เมนูด้านล่าง → ยื่นแบบ / คำนวณภาษี)

## my-tax

Next.js บน Cloud Run + Firebase Hosting rewrite (`mynote-mytax`)

```bash
cd my-tax
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

คู่มือเต็ม: [`my-tax/README.md`](my-tax/README.md)

Deploy: push ที่แตะ `my-tax/**` → workflow `Deploy my-tax (Cloud Run + Hosting)`

Smoke test production: `npm run test:smoke-hub`

---

## Deploy

| แอป | Trigger | Secret |
|---|---|---|
| TaxTag | push `main` → Deploy TaxTag | `GCP_SA_KEY` |
| my-tax | push `main` ที่เปลี่ยน `my-tax/**` | `GCP_SA_KEY` |
