import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const body = Sarabun({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "my-tax",
  description: "ติดตามภาษีส่วนตัว · form-status + PDF + สรุปพิทเทิ้ล",
};

/* มือถือใช้ความกว้างจริง แต่ตารางยังคอลัมเต็ม + เลื่อนแนวนอน */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
