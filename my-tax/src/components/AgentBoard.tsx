import { Heading, Text } from "moduix";
import { stateLabel } from "@/lib/agent-labels";
import type { AgentStatus } from "@/lib/types";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function toneForState(state: AgentStatus["state"]) {
  switch (state) {
    case "done":
      return "ok";
    case "blocked":
      return "bad";
    case "working":
      return "busy";
    case "waiting_local":
      return "wait";
    default:
      return "idle";
  }
}

/** กระดานส่งงาน — เปิดหน้านี้แล้วอ่านรู้เรื่องทันที ไม่ต้องพิมพ์สั่งยาว */
export function AgentBoard({ status }: { status: AgentStatus }) {
  const tone = toneForState(status.state);
  const latestLocal = status.history.find((item) => item.by === "local");

  return (
    <section className="app-panel agent-board space-y-4" id="agent-board">
      <div className="space-y-1">
        <Heading as="h2" size="md" weight="semibold">
          กระดานส่งงาน Agent
        </Heading>
        <Text size="sm" tone="muted">
          Cloud / Local เปิดหน้านี้หรือ GET /api/agent-status แล้วทำตามสถานะ —
          ผู้ใช้ไม่ต้องพิมพ์สั่งซ้ำ
        </Text>
      </div>

      <div
        className={`agent-status-pill agent-status-${tone}`}
        data-state={status.state}
      >
        <div className="agent-status-label">{stateLabel(status.state)}</div>
        <div className="agent-status-meta">
          อัปเดตโดย {status.by === "local" ? "Local Mac" : "Cloud"} ·{" "}
          {formatWhen(status.updatedAt)}
        </div>
        <p className="agent-status-summary">{status.summary}</p>
      </div>

      <div className="agent-board-grid">
        <div className="space-y-2">
          <Heading as="h3" size="sm" weight="semibold">
            คำสั่งปัจจุบัน (Local อ่านแล้วทำ)
          </Heading>
          <pre className="agent-brief-pre" id="agent-command">
            {status.command}
          </pre>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Heading as="h3" size="sm" weight="semibold">
              รายงานล่าสุดจาก Local
            </Heading>
            {latestLocal ? (
              <div className="agent-report">
                <Text size="sm">
                  {formatWhen(latestLocal.at)} · {stateLabel(latestLocal.state)}
                </Text>
                <Text size="sm">{latestLocal.summary}</Text>
              </div>
            ) : (
              <Text size="sm" tone="muted">
                ยังไม่มีรายงานจาก Local — แปลว่างานยังไม่เสร็จหรือยังไม่ได้เริ่ม
              </Text>
            )}
          </div>

          <div className="space-y-1">
            <Heading as="h3" size="sm" weight="semibold">
              ความคืบหน้าเลขอ้างอิง
            </Heading>
            <Text size="sm">
              เสร็จแล้ว:{" "}
              {status.refsDone.length
                ? status.refsDone.join(", ")
                : "— ยังไม่มี"}
            </Text>
            <Text size="sm" tone="muted">
              ยังขาด:{" "}
              {status.refsMissing.length
                ? status.refsMissing.join(", ")
                : "— ครบแล้ว"}
            </Text>
          </div>

          <div className="space-y-1">
            <Heading as="h3" size="sm" weight="semibold">
              โปรโตคอลสั้นๆ
            </Heading>
            <pre className="agent-proto-pre">{`# Cloud ต้องการงาน Local
POST /api/agent-status
{"by":"cloud","state":"waiting_local","summary":"...","command":"..."}

# Local เริ่มทำ
{"by":"local","state":"working","summary":"กำลังดาวน์โหลด PDF"}

# Local เสร็จ
{"by":"local","state":"done","summary":"แนบครบ N ไฟล์","refsDone":[...],"refsMissing":[]}

# Local ติด
{"by":"local","state":"blocked","summary":"Chrome ไม่มีแท็บ form-status"}

# Cloud อ่านผล
GET /api/agent-status
ถ้า state=done และไม่มีผิดปกติ → แจ้งผู้ใช้ว่าเสร็จ
`}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}
