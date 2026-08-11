"use client";

import { useState } from "react";
import { Button, Text, Textarea } from "moduix";

/** เครื่องมือนำเข้า/สรุป AI/บันทึกตาราง — หุบได้ */
export function HomeTools() {
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState<"json" | "ai" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function importJson() {
    setBusy("json");
    setMessage(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch("/api/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "นำเข้าไม่สำเร็จ");
      setMessage(`นำเข้า JSON สำเร็จ · ${data.count} รายการ`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function summarizeAll(force = false) {
    setBusy("ai");
    setMessage(null);
    try {
      const res = await fetch("/api/filings/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สรุปไม่สำเร็จ");
      setMessage(
        force
          ? `สรุปใหม่แล้ว · AI ${data.aiCount} · สำรอง ${data.regexCount} · ไม่มีไฟล์ ${data.missing}`
          : `สรุปแล้ว · ใหม่ ${data.aiCount} · ใช้ของเดิม ${data.cachedCount} · สำรอง ${data.regexCount} · ไม่มีไฟล์ ${data.missing}`,
      );
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "สรุปไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function saveTable() {
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch("/api/filings/save", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      const when = data.savedAt
        ? new Date(data.savedAt).toLocaleString("th-TH")
        : "";
      setMessage(
        `บันทึกตารางแล้ว · ${data.count} รายการ · มีสรุป AI ${data.aiCount}${when ? ` · ${when}` : ""}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="home-tools">
      <div className="home-tools-bar">
        <button
          type="button"
          className="home-tool-btn"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "ปิดนำเข้า" : "นำเข้า"}
        </button>
        <button
          type="button"
          className="home-tool-btn is-primary"
          disabled={busy !== null}
          onClick={() => void summarizeAll(false)}
          title="สรุปเฉพาะรายการที่ยังไม่มีสรุป AI — ของเดิมจะไม่ถูกรันซ้ำ"
        >
          {busy === "ai" ? "สรุป…" : "สรุป AI"}
        </button>
        <button
          type="button"
          className="home-tool-btn is-save"
          disabled={busy !== null}
          onClick={() => void saveTable()}
          title="บันทึกสรุป/ยอด/โน้ตลง Firestore — เปิดรอบหน้าโหลดของเดิมได้เลย"
        >
          {busy === "save" ? "บันทึก…" : "บันทึกตาราง"}
        </button>
      </div>

      {open ? (
        <div className="home-tools-panel">
          <Text size="sm" tone="muted">
            วาง JSON จาก scrape หรืออัปโหลด PDF ในแถวรายละเอียด แล้วสรุป AI
            · กดบันทึกตารางเพื่อเก็บถาวร
          </Text>
          <Textarea
            value={jsonText}
            onValueChange={setJsonText}
            rows={5}
            placeholder='{"filings":[...]}'
            className="font-mono text-xs"
          />
          <div className="home-tools-panel-actions">
            <Button size="sm" disabled={busy !== null} onClick={importJson}>
              {busy === "json" ? "กำลังนำเข้า..." : "นำเข้า JSON"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void summarizeAll(true)}
            >
              สรุป AI ใหม่ทั้งหมด
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <Text size="sm" tone="muted" className="home-tools-msg">
          {message}
        </Text>
      ) : null}
    </div>
  );
}
