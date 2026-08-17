"use client";

import { useState } from "react";
import { Button, Text, Textarea } from "moduix";

export function NotesForm({
  id,
  initialNotes,
}: {
  id: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setStatus("กำลังบันทึก...");
    const res = await fetch(`/api/filings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, noteColumn: "1" }),
    });
    setStatus(res.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ");
  }

  return (
    <div className="space-y-2">
      <Text size="sm" weight="medium">
        โน้ตติดตาม
      </Text>
      <Textarea
        value={notes}
        onValueChange={setNotes}
        rows={4}
        placeholder="สิ่งที่ต้องทำต่อ"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save}>
          บันทึก
        </Button>
        {status ? (
          <Text size="sm" tone="muted">
            {status}
          </Text>
        ) : null}
      </div>
    </div>
  );
}
