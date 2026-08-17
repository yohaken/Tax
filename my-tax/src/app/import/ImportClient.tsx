"use client";

import { useState } from "react";
import { Button, Heading, Stack, Text, Textarea } from "moduix";

const SAMPLE = `{
  "filings": [
    {
      "id": "P940004519103",
      "formType": "PND94",
      "formTypeLabel": "ภ.ง.ด.94",
      "taxYear": 2568,
      "filingSequence": "additional",
      "additionalRound": 1,
      "status": "ยื่นแบบสำเร็จ (ออกใบเสร็จรับเงินแล้ว)",
      "statusUpdatedAt": "2569-07-21T11:05:00+07:00",
      "statusUpdatedAtRaw": "21/07/2569 11:05",
      "taxpayerName": "นาย พีระพงษ์ โยหาเคน",
      "tin": "1-42990-0078-74-2",
      "documents": []
    }
  ]
}`;

export function ImportClient() {
  const [jsonText, setJsonText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importJson() {
    setBusy(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch("/api/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "import failed");
      setMessage(`นำเข้าสำเร็จ · ${data.count} รายการ`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="app-panel">
        <Stack gap={3}>
          <Heading as="h2" size="md" weight="medium">
            จาก Chrome (Mac)
          </Heading>
          <Text size="sm" tone="muted">
            1. เปิด form-status ใน Chrome
          </Text>
          <Text size="sm" tone="muted">
            2. npm run scrape:form-status
          </Text>
          <Text size="sm" tone="muted">
            3. npm run import:seed
          </Text>
          <Text size="sm" tone="muted">
            4. npm run import:pdfs
          </Text>
        </Stack>
      </div>

      <div className="app-panel">
        <Stack gap={3}>
          <Heading as="h2" size="md" weight="medium">
            วาง JSON
          </Heading>
          <Textarea
            value={jsonText}
            onValueChange={setJsonText}
            rows={14}
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={importJson}>
              {busy ? "กำลังนำเข้า..." : "นำเข้า JSON"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setJsonText(SAMPLE)}
            >
              ตัวอย่าง
            </Button>
          </div>
          {message ? (
            <Text size="sm" tone="muted">
              {message}
            </Text>
          ) : null}
        </Stack>
      </div>
    </div>
  );
}
