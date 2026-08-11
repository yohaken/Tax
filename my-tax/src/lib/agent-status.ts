import { promises as fs } from "fs";
import path from "path";
import type {
  AgentActor,
  AgentState,
  AgentStatus,
  AgentStatusUpdate,
} from "./types";

const DOC_PATH = "agentHandoff/current";
const LOCAL_FALLBACK = path.join(process.cwd(), "data", "agent-status.json");
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "mynote-f1bbc";

const REQUIRED_REFS = [
  "P940004519103",
  "P900016086817",
  "P940004518812",
  "P900015588262",
  "P940003923546",
  "P900015273022",
];

const LIVE = "https://my-tax-570843838870.asia-southeast1.run.app";

export const DEFAULT_LOCAL_COMMAND = `# งาน Local Mac — อัปโหลด PDF เข้า LIVE ให้ถาวร (GCS)
Live: ${LIVE}/?agent=1

## สถานะตอนนี้
Cloud ตรวจ live แล้วยังไม่มีไฟล์เปิดได้ในเว็บ (metadata อย่างเดียว / RD link)
ต้องอัปโหลดใหม่เข้า LIVE — อย่าอัปขึ้น localhost อย่างเดียว

## ทำทันที
1) รวม PDF ที่ดาวน์โหลดแล้วไว้โฟลเดอร์เดียว (เช่น ~/Downloads)
   ต้องการประมาณ 12 ไฟล์: แบบ + ใบเสร็จ ของทุกเลขอ้างอิง
2) จาก repo my-tax บน Mac รัน:

MY_TAX_BASE=${LIVE} \\
MY_TAX_PDF_DIR="$HOME/Downloads" \\
npm run import:pdfs

3) สคริปต์จะ:
   - POST ไฟล์เข้า /api/filings/{ref}/documents
   - บังคับเก็บ GCS (durable)
   - ตรวจว่าเปิด /api/docs/... ได้
   - โพสต์สถานะกลับ /api/agent-status อัตโนมัติ

## รายการที่ต้องครบ
${REQUIRED_REFS.join(", ")}

## เกณฑ์ DONE
- ทุกเลขอ้างอิงมีไฟล์เปิดในเว็บได้
- response มี gcsPath / durable=true
- GET ${LIVE}/api/filings แล้ว documents[].filePath ไม่ว่าง
`;

function nowIso() {
  return new Date().toISOString();
}

export function emptyAgentStatus(): AgentStatus {
  return {
    state: "waiting_local",
    by: "cloud",
    summary:
      "รอ Local อัปโหลด PDF เข้า LIVE แบบถาวร (GCS) — ตอนนี้บน production ยังเปิดไฟล์ไม่ได้",
    command: DEFAULT_LOCAL_COMMAND,
    refsDone: [],
    refsMissing: [...REQUIRED_REFS],
    history: [],
    updatedAt: nowIso(),
  };
}

function normalizeState(value: unknown): AgentState {
  const allowed: AgentState[] = [
    "idle",
    "waiting_local",
    "working",
    "done",
    "blocked",
  ];
  if (typeof value === "string" && allowed.includes(value as AgentState)) {
    return value as AgentState;
  }
  return "waiting_local";
}

function normalizeActor(value: unknown): AgentActor {
  return value === "local" ? "local" : "cloud";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function normalizeAgentStatus(raw: unknown): AgentStatus {
  if (!raw || typeof raw !== "object") return emptyAgentStatus();
  const data = raw as Partial<AgentStatus>;
  return {
    state: normalizeState(data.state),
    by: normalizeActor(data.by),
    summary:
      typeof data.summary === "string" && data.summary.trim()
        ? data.summary
        : emptyAgentStatus().summary,
    command:
      typeof data.command === "string" && data.command.trim()
        ? data.command
        : DEFAULT_LOCAL_COMMAND,
    detail: typeof data.detail === "string" ? data.detail : undefined,
    refsDone: asStringArray(data.refsDone),
    refsMissing: asStringArray(data.refsMissing),
    history: Array.isArray(data.history)
      ? data.history
          .filter((item) => item && typeof item === "object")
          .slice(0, 20)
          .map((item) => ({
            at: typeof item.at === "string" ? item.at : nowIso(),
            by: normalizeActor(item.by),
            state: normalizeState(item.state),
            summary:
              typeof item.summary === "string" ? item.summary : "(ไม่มีข้อความ)",
          }))
      : [],
    updatedAt:
      typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
  };
}

async function getFirestore() {
  try {
    const [{ getApps, initializeApp, applicationDefault }, { getFirestore }] =
      await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/firestore"),
      ]);
    if (!getApps().length) {
      initializeApp({
        credential: applicationDefault(),
        projectId: PROJECT_ID,
      });
    }
    return getFirestore();
  } catch {
    return null;
  }
}

async function readLocalFile(): Promise<AgentStatus | null> {
  try {
    const raw = await fs.readFile(LOCAL_FALLBACK, "utf8");
    return normalizeAgentStatus(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocalFile(status: AgentStatus) {
  await fs.mkdir(path.dirname(LOCAL_FALLBACK), { recursive: true });
  await fs.writeFile(
    LOCAL_FALLBACK,
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8",
  );
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const db = await getFirestore();
  if (db) {
    try {
      const snap = await db.doc(DOC_PATH).get();
      if (snap.exists) return normalizeAgentStatus(snap.data());
      const seeded = emptyAgentStatus();
      await db.doc(DOC_PATH).set(seeded);
      await writeLocalFile(seeded).catch(() => undefined);
      return seeded;
    } catch {
      // fall through
    }
  }

  const local = await readLocalFile();
  if (local) return local;
  const seeded = emptyAgentStatus();
  await writeLocalFile(seeded).catch(() => undefined);
  return seeded;
}

export async function updateAgentStatus(
  patch: AgentStatusUpdate,
): Promise<AgentStatus> {
  const current = await getAgentStatus();
  const by = normalizeActor(patch.by);
  const state = patch.state ? normalizeState(patch.state) : current.state;
  const summary =
    typeof patch.summary === "string" && patch.summary.trim()
      ? patch.summary.trim()
      : current.summary;
  const command =
    typeof patch.command === "string" && patch.command.trim()
      ? patch.command
      : current.command;

  const next: AgentStatus = {
    ...current,
    state,
    by,
    summary,
    command,
    detail:
      typeof patch.detail === "string"
        ? patch.detail
        : patch.detail === null
          ? undefined
          : current.detail,
    refsDone:
      patch.refsDone !== undefined
        ? asStringArray(patch.refsDone)
        : current.refsDone,
    refsMissing:
      patch.refsMissing !== undefined
        ? asStringArray(patch.refsMissing)
        : current.refsMissing,
    updatedAt: nowIso(),
    history: [
      {
        at: nowIso(),
        by,
        state,
        summary,
      },
      ...current.history,
    ].slice(0, 20),
  };

  const db = await getFirestore();
  if (db) {
    try {
      await db.doc(DOC_PATH).set(next);
    } catch {
      // still write local fallback
    }
  }
  await writeLocalFile(next).catch(() => undefined);
  return next;
}

export { stateLabel } from "./agent-labels";
