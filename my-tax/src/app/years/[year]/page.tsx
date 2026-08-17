import { redirect } from "next/navigation";

type Props = { params: Promise<{ year: string }> };

/** รวมเข้าหน้าแรกแล้ว — กรองด้วย ?year= */
export default async function YearPage({ params }: Props) {
  const { year } = await params;
  redirect(`/filings?year=${encodeURIComponent(year)}`);
}
