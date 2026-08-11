import { promises as fs } from "fs";
import path from "path";
import type { FilingsStore } from "./types";
import { GCP_PROJECT_ID } from "./gcp";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "filings.json");
const FIRESTORE_DOC = "myTax/filingsStore";

type FirestoreDb = {
  doc: (path: string) => {
    get: () => Promise<{ exists: boolean; data: () => FilingsStore | undefined }>;
    set: (data: FilingsStore) => Promise<void>;
  };
  settings: (settings: { ignoreUndefinedProperties?: boolean }) => void;
};

type GlobalFs = typeof globalThis & {
  __myTaxFirestore?: FirestoreDb;
  __myTaxFirestoreSettingsApplied?: boolean;
};

/** Firestore ห้ามมี undefined — เก็บเฉพาะค่าที่ serialize ได้ */
function sanitizeStore(store: FilingsStore): FilingsStore {
  return JSON.parse(JSON.stringify(store)) as FilingsStore;
}

async function getFirestore(): Promise<FirestoreDb | null> {
  const g = globalThis as GlobalFs;
  if (g.__myTaxFirestore) return g.__myTaxFirestore;

  try {
    const [{ getApps, initializeApp, applicationDefault }, { getFirestore }] =
      await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/firestore"),
      ]);
    if (!getApps().length) {
      initializeApp({
        credential: applicationDefault(),
        projectId: GCP_PROJECT_ID,
      });
    }
    const db = getFirestore() as unknown as FirestoreDb;
    if (!g.__myTaxFirestoreSettingsApplied) {
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // Next.js / hot reload: settings เรียกซ้ำไม่ได้ แต่ db ใช้ต่อได้
      }
      g.__myTaxFirestoreSettingsApplied = true;
    }
    g.__myTaxFirestore = db;
    return db;
  } catch (err) {
    console.error("[filings-store] getFirestore failed", err);
    return null;
  }
}

async function readLocal(): Promise<FilingsStore> {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as FilingsStore;
}

async function writeLocal(store: FilingsStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    STORE_PATH,
    `${JSON.stringify(sanitizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

async function writeFirestoreWithRetry(db: FirestoreDb, store: FilingsStore) {
  const clean = sanitizeStore(store);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.doc(FIRESTORE_DOC).set(clean);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[filings-store] Firestore set attempt ${attempt} failed`, err);
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("บันทึก Firestore ไม่สำเร็จ");
}

export async function readStore(): Promise<FilingsStore> {
  const db = await getFirestore();
  if (db) {
    try {
      const snap = await db.doc(FIRESTORE_DOC).get();
      if (snap.exists) {
        const data = snap.data() as FilingsStore;
        if (data?.filings && Array.isArray(data.filings)) {
          await writeLocal(data).catch(() => undefined);
          return data;
        }
      }
      const local = await readLocal();
      await writeFirestoreWithRetry(db, local);
      return local;
    } catch (err) {
      console.error("[filings-store] read Firestore failed", err);
    }
  }
  return readLocal();
}

export async function writeStore(store: FilingsStore): Promise<void> {
  const clean = sanitizeStore(store);
  await writeLocal(clean);
  const db = await getFirestore();
  if (!db) {
    throw new Error(
      "Firestore ไม่พร้อม — สรุป/อัปโหลดจะไม่ติดถาวร (ตรวจ service account / firebase-admin)",
    );
  }
  await writeFirestoreWithRetry(db, clean);
}
