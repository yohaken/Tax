import { redirect } from "next/navigation";

/** Canonical filings route is /filings (TaxTag owns / on mynote-tax.web.app). */
export default function Home() {
  redirect("/filings");
}
