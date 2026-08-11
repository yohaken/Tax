"use client";

import { useState } from "react";
import { Button, Heading, Text } from "moduix";

export function UploadPanel({ filingId }: { filingId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/filings/${filingId}/documents`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      setMessage(`นำเข้าแล้ว · ${data.extractedChars || 0} ตัวอักษ`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Heading as="h2" size="md" weight="medium">
        นำเข้า PDF
      </Heading>
      <Text size="sm" tone="muted">
        อ่านข้อความแล้วอัปเดตสรุปพิทเทิ้ล
      </Text>
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(e) => onUpload(e.target.files?.[0] || null)}
      />
      {busy ? <Button size="sm" disabled>กำลังนำเข้า...</Button> : null}
      {message ? (
        <Text size="sm" tone="muted">
          {message}
        </Text>
      ) : null}
    </div>
  );
}
