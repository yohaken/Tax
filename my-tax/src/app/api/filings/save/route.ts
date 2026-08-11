import { NextResponse } from "next/server";
import { saveFilingsTable } from "@/lib/filings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** บันทึกตาราง (สรุป AI + ยอด + โน้ต) ลง Firestore ถาวร */
export async function POST() {
  try {
    const result = await saveFilingsTable();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "บันทึกตารางไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
