import { redirect } from "next/navigation";

/** รวมเข้าหน้าแรกแล้ว — เก็บ route นี้ไว้เพื่อลิงก์เก่า */
export default function FilingsPage() {
  redirect("/");
}
