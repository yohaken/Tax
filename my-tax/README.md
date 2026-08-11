# my-tax

> อยู่ใน monorepo **[yohaken/Tax](https://github.com/yohaken/Tax)** โฟลเดอร์ `my-tax/`  
> Live: **https://my-tax-570843838870.asia-southeast1.run.app** · คู่กับ TaxTag: https://mynote-tax.web.app

ระบบจัดการข้อมูลภาษีส่วนตัว จากหน้า [RD form-status](https://efiling.rd.go.th/rd-efiling-web/form-status)

UI ใช้ [moduix](https://www.npmjs.com/package/moduix) แบบเรียบ/มินิมอล

ใช้บน Mac เพื่อ:

1. ดึงรายการยื่นแบบจาก Chrome ที่ login ไว้
2. นำเข้า PDF แบบ/ใบเสร็จที่เกี่ยวข้อง
3. อ่านข้อความใน PDF แล้วทำ **สรุปพิทเทิ้ล** ไว้ติดตาม

เข้าใช้ได้เฉพาะ `yohaken@gmail.com` (Firebase Auth + rules)

## เริ่มต้น

```bash
npm install
cp .env.example .env.local   # ใส่ Firebase config เมื่อพร้อม
npm run dev
```

เปิด http://localhost:3000

ถ้ายังไม่ตั้ง Firebase จะเข้าโหมด Local Mac ได้จากหน้า login

## Workflow บน Mac

```bash
# 1) เปิด form-status ใน Google Chrome (login ค้างไว้)
npm run scrape:form-status

# 2) เปิด dev server แล้ว merge เข้าคลัง
npm run import:seed

# 3) วาง TAX_FORM_*.pdf ไว้ใน ~/Downloads แล้ว
npm run import:pdfs
```

หรืออัปโหลดทีละไฟล์ที่หน้า `/filings/[เลขอ้างอิง]`

## กระดานส่งงาน Agent

เปิด `/filings` แล้วอ่านแผง **กระดานส่งงาน Agent** — สถานะ + คำสั่งอยู่บนเว็บเลย ไม่ต้องพิมพ์สั่งยาว

```bash
# อ่านสถานะ
npm run agent:status:get

# Local รายงานเสร็จ
node scripts/agent-status.mjs set local done "แนบครบ 6 ไฟล์"
```

API: `GET|POST /api/agent-status` (เก็บใน Firestore `agentHandoff/current`)

## โครงสร้างหลัก

- `data/filings.json` — คลังรายการยื่นแบบ + สรุปพิทเทิ้ล
- `data/docs/{referenceNo}/` — PDF ที่นำเข้า
- `scripts/scrape-form-status.mjs` — อ่านจาก Chrome
- `scripts/import-pdfs.mjs` — นำเข้า PDF จาก Downloads
- `scripts/agent-status.mjs` — อ่าน/เขียนกระดานส่งงาน Agent
- `firebase/*.rules` — จำกัดสิทธิ์เฉพาะ yohaken@gmail.com

## Firebase (ส่วนตัว)

1. สร้าง Firebase project
2. เปิด Google Auth
3. ใส่ค่าใน `.env.local` ตาม `.env.example`
4. Deploy rules:

```bash
npx firebase deploy --only firestore:rules,storage
```
