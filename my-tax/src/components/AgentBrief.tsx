import { Heading, Text } from "moduix";

/**
 * คำอธิบายสั้นๆ ใต้กระดาน — รายละเอียดงานอยู่ใน #agent-board / command แล้ว
 */
export function AgentBrief() {
  return (
    <section className="app-panel space-y-2" id="agent-brief">
      <Heading as="h2" size="sm" weight="semibold">
        วิธีใช้กระดาน (อ่านครั้งเดียว)
      </Heading>
      <Text size="sm" tone="muted">
        1) เปิดไอคอน AI มุมขวาบน หรือ /?agent=1 หรือ GET /api/agent-status ·
        2) ดูสถานะ · 3) Local ทำตามคำสั่งแล้ว POST สถานะกลับ · 4) Cloud อ่านสถานะแล้วบอกผู้ใช้
      </Text>
    </section>
  );
}
