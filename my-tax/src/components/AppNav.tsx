"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/filings", label: "ยื่นแบบ" },
  { href: "/calc", label: "คำนวณภาษี" },
] as const;

export function AppNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="app-nav" aria-label="เมนูหลัก">
      {TABS.map((tab) => {
        const active =
          tab.href === "/filings"
            ? pathname === "/" ||
              pathname.startsWith("/filings") ||
              pathname.startsWith("/years") ||
              pathname.startsWith("/import")
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`app-nav-link ${active ? "is-active" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
      <a
        href="https://mynote-tax.web.app"
        className="app-nav-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        TaxTag
      </a>
    </nav>
  );
}
