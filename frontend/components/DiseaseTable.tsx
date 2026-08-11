"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RiskBadge from "./RiskBadge";
import type { DiseaseSummary, RiskBand } from "@/lib/api";

const BANDS: (RiskBand | "ALL")[] = ["ALL", "HIGH", "MODERATE", "LOW", "UNSCORED"];

export default function DiseaseTable({ diseases }: { diseases: DiseaseSummary[] }) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<RiskBand | "ALL">("ALL");

  const filtered = useMemo(() => {
    return diseases
      .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
      .filter((d) => band === "ALL" || d.risk_band === band)
      .sort((a, b) => (b.trs ?? -1) - (a.trs ?? -1));
  }, [diseases, query, band]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="flex-1 rounded-lg border hairline bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage/40"
        />
        <div className="flex gap-2">
          {BANDS.map((b) => (
            <button
              key={b}
              onClick={() => setBand(b)}
              className={`px-3 py-2 rounded-lg text-xs eyebrow border hairline transition-colors ${
                band === b ? "bg-sage text-white border-sage" : "bg-card text-muted hover:text-ink"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="border hairline rounded-xl overflow-hidden bg-card card-shadow">
        <table className="w-full text-sm">
          <thead className="bg-paper2/70 text-muted eyebrow">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Disease</th>
              <th className="text-left px-5 py-3 font-medium">Risk</th>
              <th className="text-right px-5 py-3 font-medium">TRS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.slug} className="border-t hairline hover:bg-sage-soft/40 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/disease/${d.slug}`} className="text-ink hover:text-sage-dark">
                    {d.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <RiskBadge band={d.risk_band} />
                </td>
                <td className="px-5 py-3 text-right font-mono">
                  {d.trs != null ? d.trs.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-muted">
                  No diseases match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
