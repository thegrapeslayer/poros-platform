"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/research", label: "Overview" },
  { href: "/research/cohort", label: "Cohort & analyses" },
  { href: "/research/validation", label: "Extractor validation" },
  { href: "/research/counterfactual", label: "Counterfactuals" },
  { href: "/research/export", label: "Export" },
];

export default function ResearchNav() {
  const pathname = usePathname();
  return (
    <div className="border-b hairline mb-10 overflow-x-auto">
      <div className="flex gap-6 min-w-max">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`pb-3 pt-1 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active ? "border-sage-dark text-ink font-medium" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
