# TaxTag

จัดหมวดรายการโอนแบบ minimal — พิมพ์หมวด/คอมเมนต์แล้ว**เซฟเอง** ไม่ต้องกดบันทึก  
ล็อกอิน Google ด้วย **yohaken@gmail.com** ครั้งเดียว (จำในเครื่องยาวๆ) + ซิงค์ Firebase

## ปุ่มหลัก
- **เข้าสู่ระบบ Google** — เฉพาะ `yohaken@gmail.com`
- **Peerland** — โหลด statement 2024–2025 (2,378 รายการ)
- **Export XLSX** — ส่งออกแถวที่กรองอยู่

## ลิงก์
- แอปทดสอบ: ดู tunnel / GitHub Pages `?peerland=1`
- PDF: https://raw.githubusercontent.com/yohaken/Tax/gh-pages/peerland_2024-2025_full.pdf

## Deploy Firebase (โปรเจกต์ mypeer-501909)
```bash
npx firebase-tools login
npx firebase-tools use mypeer-501909
npx firebase-tools deploy --only firestore:rules,hosting
```

ใน Firebase Console:
1. Authentication → Sign-in method → เปิด Google
2. Authentication → Settings → Authorized domains ใส่โดเมนที่โฮสต์แอป
3. Firestore → สร้าง database (ถ้ายังไม่มี) แล้ว deploy rules ตาม `firestore.rules`
