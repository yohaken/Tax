# Tax (monorepo)

**URL เดียว:** https://mynote-tax.web.app — TaxTag · ยื่นแบบ · คำนวณภาษี (bottom nav)

| แอป | โฟลเดอร์ | Path | ทำอะไร |
|---|---|---|---|
| **TaxTag** | `public/` | `/` | จัดหมวด statement |
| **my-tax** | `my-tax/` | `/filings`, `/calc` | คลังยื่นแบบ + คำนวณภาษี (Cloud Run rewrite) |

`mynote-mytax.web.app` → redirect 301 มาที่ hub เดียวกัน

เช็คลิส: [`PHASES.md`](PHASES.md)

---

## TaxTag

```bash
npm start          # http://localhost:4173
npm run deploy     # Firebase Hosting site mynote-tax
```

## my-tax

```bash
cd my-tax && npm install && npm run dev   # http://localhost:3000
```

Deploy Cloud Run: push ที่แตะ `my-tax/**` หรือ `firebase.json`

Smoke test: `npm run test:smoke-hub`
