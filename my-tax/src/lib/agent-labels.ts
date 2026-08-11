import type { AgentState } from "./types";

export function stateLabel(state: AgentState): string {
  switch (state) {
    case "idle":
      return "ว่าง — ไม่มีงานค้าง";
    case "waiting_local":
      return "รอ Local Mac ทำงาน";
    case "working":
      return "Local Mac กำลังทำอยู่";
    case "done":
      return "Local Mac รายงานว่าเสร็จแล้ว";
    case "blocked":
      return "ติดปัญหา — ต้องช่วยดู";
    default:
      return state;
  }
}
