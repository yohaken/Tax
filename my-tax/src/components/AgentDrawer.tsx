"use client";

import { useEffect, useState } from "react";
import { Button, Heading, Text } from "moduix";
import { AgentBoard } from "@/components/AgentBoard";
import { AgentBrief } from "@/components/AgentBrief";
import type { AgentStatus } from "@/lib/types";

function shouldAutoOpen() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("agent") === "1" ||
    window.location.hash === "#agent-board" ||
    window.location.hash === "#agent-brief"
  );
}

function toneDot(state: AgentStatus["state"] | undefined) {
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

/** ไอคอนมุมขวาบน — แผงคำสั่ง AI ปิดเป็นค่าเริ่มต้น ไม่บังสายตา */
export function AgentDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shouldAutoOpen()) setOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/agent-status", { cache: "no-store" });
        if (!res.ok) throw new Error("โหลดสถานะไม่สำเร็จ");
        const data = (await res.json()) as AgentStatus;
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "โหลดสถานะไม่สำเร็จ");
        }
      }
    }

    load();
    if (!open) return;
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`agent-icon-btn agent-dot-${toneDot(status?.state)}`}
        aria-label="เปิดกระดานส่งงาน Agent"
        title="กระดานส่งงาน Agent"
        onClick={() => setOpen(true)}
      >
        <span className="agent-icon-glyph" aria-hidden>
          AI
        </span>
        <span className="agent-icon-dot" aria-hidden />
      </button>

      {open ? (
        <div className="agent-drawer-root" role="dialog" aria-modal="true">
          <button
            type="button"
            className="agent-drawer-backdrop"
            aria-label="ปิดกระดาน Agent"
            onClick={() => setOpen(false)}
          />
          <aside className="agent-drawer-panel">
            <div className="agent-drawer-toolbar">
              <div>
                <Heading as="h2" size="sm" weight="semibold">
                  คำสั่ง AI / Agent
                </Heading>
                <Text size="sm" tone="muted">
                  ปิดไว้เป็นค่าเริ่มต้น · เปิดเมื่อต้องการส่งงาน
                </Text>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                ปิด
              </Button>
            </div>

            <div className="agent-drawer-body space-y-4">
              {error ? <Text className="text-red-700">{error}</Text> : null}
              {status ? <AgentBoard status={status} /> : <Text tone="muted">กำลังโหลดสถานะ...</Text>}
              <AgentBrief />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
