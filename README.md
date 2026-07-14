# TaxTag

เว็บแอปส่วนตัวสำหรับนำเข้า **statement ธนาคาร** (PDF / Excel / CSV) ค้นหารายการโอนอย่างฉลาด แล้วติดป้ายว่าแต่ละรายการเกี่ยวกับอะไร

- ทำงานในเบราว์เซอร์ — ข้อมูลเก็บในเครื่องของคุณ (localStorage)
- ค้นหาแบบ fuzzy + กรองวันที่ / หมวด / เงินเข้า-ออก / ยอดเงิน (`1500`, `>1000`, `1000-5000`)
- เรียนรู้คำสำคัญตอนติดป้าย แล้วแนะนำหมวดให้อัตโนมัติ
- ส่งออก Excel หลังจัดหมวดแล้ว
- พร้อมโฮสต์ฟรีบน **Firebase Hosting** (Google)

## ทดลองในเครื่อง

```bash
npm start
```

เปิด http://localhost:4173

## Deploy ฟรีบน Firebase Hosting

1. สร้างโปรเจกต์ที่ [Firebase Console](https://console.firebase.google.com/) (แผน Spark ฟรีได้)
2. เปิด **Hosting** ในโปรเจกต์นั้น
3. ติดตั้ง CLI แล้วล็อกอิน:

```bash
npx firebase-tools login
npx firebase-tools use --add
```

แก้ชื่อโปรเจกต์ใน `.firebaserc` ให้ตรงกับโปรเจกต์ของคุณ แล้ว:

```bash
npm run deploy
```

จะได้ลิงก์ประมาณ:

`https://<project-id>.web.app`

## ไฟล์สำคัญ

| path | ความหมาย |
|------|-----------|
| `public/index.html` | หน้าแอป |
| `public/js/parser.js` | อ่าน PDF / Excel / CSV |
| `public/js/storage.js` | บันทึกในเครื่อง + ค้นหาฉลาด + กฎอัตโนมัติ |
| `public/js/app.js` | UI |
| `firebase.json` | ค่า Hosting |

## ความเป็นส่วนตัว

ไฟล์ statement และป้ายหมวด **ไม่ถูกอัปโหลดไปเซิร์ฟเวอร์** — ประมวลผลและเก็บในเบราว์เซอร์ของคุณเท่านั้น (ยกเว้นตอนคุณส่งออกไฟล์เอง)
