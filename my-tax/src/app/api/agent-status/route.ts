import { NextResponse } from "next/server";
import { getAgentStatus, updateAgentStatus } from "@/lib/agent-status";
import type { AgentStatusUpdate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getAgentStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  let body: AgentStatusUpdate;
  try {
    body = (await request.json()) as AgentStatusUpdate;
  } catch {
    return NextResponse.json(
      { error: "JSON body ไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "ต้องส่ง object" }, { status: 400 });
  }

  if (!body.by || (body.by !== "local" && body.by !== "cloud")) {
    return NextResponse.json(
      { error: 'ต้องระบุ by: "local" หรือ "cloud"' },
      { status: 400 },
    );
  }

  const status = await updateAgentStatus(body);
  return NextResponse.json(status);
}