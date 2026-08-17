import { promises as fs } from "fs";
import path from "path";
import { GCP_PROJECT_ID, MY_TAX_BUCKET } from "./gcp";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUIRE_GCS =
  process.env.MY_TAX_REQUIRE_GCS === "1" ||
  process.env.NODE_ENV === "production";

async function getBucket() {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({ projectId: GCP_PROJECT_ID });
  return storage.bucket(MY_TAX_BUCKET);
}

export async function saveDocBytes(
  relPath: string,
  buffer: Buffer,
  contentType = "application/pdf",
): Promise<{ filePath: string; gcsPath?: string }> {
  const normalized = relPath.replace(/^\/+/, "");
  const abs = path.join(DATA_DIR, normalized);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);

  try {
    const bucket = await getBucket();
    const object = normalized;
    await bucket.file(object).save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" },
      validation: "crc32c",
    });
    return {
      filePath: normalized,
      gcsPath: `gs://${MY_TAX_BUCKET}/${object}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (REQUIRE_GCS) {
      throw new Error(
        `บันทึก GCS ไม่สำเร็จ (${MY_TAX_BUCKET}/${normalized}): ${message}`,
      );
    }
    console.warn("[docs-storage] GCS save failed, local only:", message);
    return { filePath: normalized };
  }
}

export async function readDocBytes(
  relPath: string,
  gcsPath?: string,
): Promise<Buffer | null> {
  const normalized = relPath.replace(/^\/+/, "");
  const abs = path.join(DATA_DIR, normalized);
  try {
    return await fs.readFile(abs);
  } catch {
    // continue to GCS
  }

  try {
    const bucket = await getBucket();
    const object = gcsPath?.replace(/^gs:\/\/[^/]+\//, "") || normalized;
    const [buf] = await bucket.file(object).download();
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function readDocText(
  relPath?: string,
  gcsPath?: string,
): Promise<string | null> {
  if (!relPath && !gcsPath) return null;
  const buf = await readDocBytes(relPath || "", gcsPath);
  if (!buf) return null;
  return buf.toString("utf8");
}
