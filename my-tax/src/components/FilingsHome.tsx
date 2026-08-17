import Link from "next/link";
import { getNoteColumnCount, getTaxpayer, listFilings } from "@/lib/filings";
import { FilingsTable } from "@/app/filings/FilingsTable";
import { HomeTools } from "@/components/HomeTools";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ year?: string; agent?: string }>;
};

export async function FilingsHome({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const [filings, taxpayer, noteColumnCount] = await Promise.all([
    listFilings(),
    getTaxpayer(),
    getNoteColumnCount(),
  ]);
  const years = Array.from(new Set(filings.map((f) => f.taxYear))).sort(
    (a, b) => b - a,
  );
  const initialYear =
    params.year && years.includes(Number(params.year)) ? params.year : "";

  return (
    <div className="home-page">
      <header className="home-topbar">
        <div className="home-topbar-id">
          <span className="home-brand">my-tax</span>
          <span className="home-meta">
            {taxpayer.name} · {taxpayer.tin}
          </span>
          <span className="home-count">{filings.length} รายการ</span>
        </div>

        <div className="home-topbar-controls">
          <div className="home-year-row" aria-label="กรองปีภาษี">
            <Link
              href="/filings"
              className={`year-chip ${!initialYear ? "is-active" : ""}`}
            >
              ทุกปี
            </Link>
            {years.map((y) => (
              <Link
                key={y}
                href={`/filings?year=${y}`}
                className={`year-chip ${initialYear === String(y) ? "is-active" : ""}`}
              >
                {y}
              </Link>
            ))}
          </div>
          <HomeTools />
        </div>
      </header>

      <FilingsTable
        filings={filings}
        initialYear={initialYear}
        initialNoteColumnCount={noteColumnCount}
      />
    </div>
  );
}
