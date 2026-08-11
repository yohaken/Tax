import Link from "next/link";
import { notFound } from "next/navigation";
import { Heading, List, ListItem, Separator, Stack, Text } from "moduix";
import { getFiling } from "@/lib/filings";
import { PetitCard } from "@/components/PetitCard";
import { UploadPanel } from "./UploadPanel";
import { NotesForm } from "./NotesForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function FilingDetailPage({ params }: Props) {
  const { id } = await params;
  const filing = await getFiling(id);
  if (!filing) notFound();

  return (
    <Stack gap={6}>
      <div className="space-y-2">
        <Link href="/" className="app-link">
          <Text as="span" size="sm">
            ← รายการ
          </Text>
        </Link>
        <Heading as="h1" size="xl" weight="semibold">
          {filing.formTypeLabel} · {filing.id}
        </Heading>
        <Text tone="muted">
          ปี {filing.taxYear} ·{" "}
          {filing.filingSequence === "additional"
            ? `เพิ่มเติม #${filing.additionalRound ?? 1}`
            : "ปกติ"}
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="app-panel space-y-4">
          <Heading as="h2" size="md" weight="medium">
            รายละเอียด
          </Heading>
          <List size="sm">
            <ListItem>
              <Text size="sm" tone="muted">
                สถานะ
              </Text>
              <Text size="sm">{filing.status}</Text>
            </ListItem>
            <ListItem>
              <Text size="sm" tone="muted">
                อัปเดต
              </Text>
              <Text size="sm">
                {filing.statusUpdatedAtRaw || filing.statusUpdatedAt}
              </Text>
            </ListItem>
            <ListItem>
              <Text size="sm" tone="muted">
                ผู้เสียภาษี
              </Text>
              <Text size="sm">
                {filing.taxpayerName} · {filing.tin}
              </Text>
            </ListItem>
          </List>

          {filing.amounts ? (
            <List size="sm" tone="muted">
              {filing.amounts.taxPayable !== undefined ? (
                <ListItem>
                  ภาษีที่ต้องชำระ:{" "}
                  {filing.amounts.taxPayable.toLocaleString("th-TH")} บาท
                </ListItem>
              ) : null}
              {filing.amounts.taxRefund !== undefined ? (
                <ListItem>
                  ขอคืน/ชำระเกิน:{" "}
                  {filing.amounts.taxRefund.toLocaleString("th-TH")} บาท
                </ListItem>
              ) : null}
              {filing.amounts.netIncome !== undefined ? (
                <ListItem>
                  เงินได้สุทธิ:{" "}
                  {filing.amounts.netIncome.toLocaleString("th-TH")} บาท
                </ListItem>
              ) : null}
              {filing.amounts.withholding !== undefined ? (
                <ListItem>
                  หัก ณ ที่จ่าย:{" "}
                  {filing.amounts.withholding.toLocaleString("th-TH")} บาท
                </ListItem>
              ) : null}
            </List>
          ) : null}

          {filing.detail?.pdfTextPreview ? (
            <details>
              <summary>
                <Text as="span" size="sm">
                  ข้อความดิบจาก PDF
                </Text>
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)]">
                {filing.detail.pdfTextPreview}
              </pre>
            </details>
          ) : null}

          <NotesForm id={filing.id} initialNotes={filing.notes || ""} />
        </div>

        <Stack gap={4}>
          {filing.petit ? <PetitCard petit={filing.petit} /> : null}
          <div className="app-panel">
            <UploadPanel filingId={filing.id} />
          </div>
        </Stack>
      </div>

      <Separator />

      <Heading as="h2" size="md" weight="medium">
        เอกสาร
      </Heading>
      <div className="app-panel">
        {filing.documents.length === 0 ? (
          <Text size="sm" tone="muted">
            ยังไม่มีไฟล์
          </Text>
        ) : (
          <List size="sm">
            {filing.documents.map((doc) => (
              <ListItem key={doc.id}>
                <div className="flex items-center justify-between gap-3">
                  <Text size="sm">
                    {doc.label} · {doc.kind}
                  </Text>
                  <div className="flex gap-3">
                    {doc.filePath ? (
                      <a
                        href={`/api/${doc.filePath}`}
                        target="_blank"
                        rel="noreferrer"
                        className="app-link"
                      >
                        เปิดไฟล์
                      </a>
                    ) : null}
                    {doc.sourceUrl ? (
                      <a
                        href={doc.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="app-link"
                      >
                        แหล่ง RD
                      </a>
                    ) : null}
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </div>
    </Stack>
  );
}
