"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAXTAG_URL, type TaxHubTab } from "@/lib/tax-hub-urls";

function activeTab(pathname: string): TaxHubTab {
  if (pathname === "/calc" || pathname.startsWith("/calc/")) return "calc";
  if (
    pathname === "/" ||
    pathname.startsWith("/filings") ||
    pathname.startsWith("/years") ||
    pathname.startsWith("/import")
  ) {
    return "filings";
  }
  return "filings";
}

export function TaxHubNav() {
  const pathname = usePathname() || "/";
  const active = activeTab(pathname);

  return (
    <nav className="tax-hub-nav" aria-label="เมนูภาษี">
      <a
        className={`tax-hub-nav-link ${active === "taxtag" ? "is-active" : ""}`}
        href={TAXTAG_URL}
      >
        <span className="tax-hub-nav-label">TaxTag</span>
        <span className="tax-hub-nav-hint">Statement</span>
      </a>
      <Link
        className={`tax-hub-nav-link ${active === "filings" ? "is-active" : ""}`}
        href="/filings"
        aria-current={active === "filings" ? "page" : undefined}
      >
        <span className="tax-hub-nav-label">ยื่นแบบ</span>
        <span className="tax-hub-nav-hint">ภ.ง.ด.</span>
      </Link>
      <Link
        className={`tax-hub-nav-link ${active === "calc" ? "is-active" : ""}`}
        href="/calc"
        aria-current={active === "calc" ? "page" : undefined}
      >
        <span className="tax-hub-nav-label">คำนวณภาษี</span>
        <span className="tax-hub-nav-hint">ประมาณการ</span>
      </Link>
    </nav>
  );
}
