# TaxTag

เว็บแอปส่วนตัวสำหรับนำเข้า **statement ธนาคาร** (PDF / Excel / CSV) ค้นหารายการโอนอย่างฉลาด แล้วติดป้ายว่าแต่ละรายการเกี่ยวกับอะไร

## ลิงก์ทดสอบ (คลิกใช้ได้เลย)

เปิดลิงก์นี้แล้วระบบโหลดข้อมูลตัวอย่างให้อัตโนมัติ:

- โหมดทดสอบ: เพิ่ม `?demo=1` ต่อท้าย URL ของเว็บที่ deploy แล้ว
- ปุ่ม **เริ่มทดสอบทันที** บนหน้าแรกก็โหลดตัวอย่างให้เช่นกัน

หลังจาก merge/deploy ลิงก์ถาวรที่เป็นไปได้:

| โฮสต์ | URL |
|-------|-----|
| GitHub Pages (ฟรี) | `https://yohaken.github.io/Tax/?demo=1` |
| Firebase Hosting (Google / ฟรี) | `https://<project-id>.web.app/?demo=1` |

## ความสามารถ

- นำเข้า PDF, Excel (.xlsx/.xls), CSV
- ค้นหาแบบ fuzzy + กรองวันที่ / หมวด / เงินเข้า-ออก / ยอดเงิน (`1500`, `>1000`, `1000-5000`)
- เรียนรู้คำสำคัญตอนติดป้าย แล้วแนะนำหมวดให้อัตโนมัติ
- ส่งออก Excel หลังจัดหมวดแล้ว
- ข้อมูลเก็บในเครื่องของคุณเท่านั้น (localStorage)

## ทดลองในเครื่อง

```bash
npm start
```

เปิด http://localhost:4173/?demo=1

## Deploy อัตโนมัติ

### A) GitHub Pages (แนะนำสำหรับทดสอบถาวรฟรี)

Workflow: `.github/workflows/deploy-pages.yml`

1. merge เข้า `main`
2. เปิด **Settings → Pages → Build and deployment → GitHub Actions** ครั้งเดียว
3. ใช้ลิงก์ `https://yohaken.github.io/Tax/?demo=1`

### B) Firebase Hosting (เซิร์ฟเวอร์ Google ฟรี)

Workflow: `.github/workflows/deploy-firebase.yml`

1. สร้างโปรเจกต์ที่ [Firebase Console](https://console.firebase.google.com/) แล้วเปิด Hosting
2. สร้าง CI token: `npx firebase-tools login:ci`
3. ใส่ GitHub Secrets: `FIREBASE_TOKEN`, `FIREBASE_PROJECT_ID`
4. push/merge ไป `main` → ได้ `https://<project-id>.web.app`

หรือ deploy เอง:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run deploy
```

## ความเป็นส่วนตัว

ไฟล์ statement และป้ายหมวด **ไม่ถูกอัปโหลดไปเซิร์ฟเวอร์** — ประมวลผลและเก็บในเบราว์เซอร์ของคุณเท่านั้น
