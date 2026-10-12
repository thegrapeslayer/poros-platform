"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RiskBadge from "./RiskBadge";
import ScoreDiseaseButton from "./ScoreDiseaseButton";
import type { DiseaseSummary, RiskBand } from "@/lib/api";

const FILTERS: { id: RiskBand | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" }, { id: "HIGH", label: "Higher risk" }, { id: "MODERATE", label: "Moderate" }, { id: "LOW", label: "Lower risk" }, { id: "UNSCORED", label: "Unscored" },
];

export default function DiseaseTable({ diseases }: { diseases: DiseaseSummary[] }) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<RiskBand | "ALL">("ALL");
  const filtered = useMemo(() => diseases.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).filter((d) => band === "ALL" || d.risk_band === band).sort((a, b) => (b.trs ?? -1) - (a.trs ?? -1)), [diseases, query, band]);

  return <section>
    <div className="rounded-3xl border border-line/70 bg-white/70 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-sm">
          <span className="sr-only">Search diseases</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4" strokeLinecap="round"/></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search diseases by name" className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-4 text-sm outline-none placeholder:text-muted/80 focus:border-sage focus:ring-4 focus:ring-sage/10" />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by translation risk">
          {FILTERS.map((filter) => <button key={filter.id} type="button" onClick={() => setBand(filter.id)} aria-pressed={band === filter.id} className={`min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium transition-colors ${band === filter.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/70 hover:border-sage/50 hover:bg-sage-soft/40"}`}>{filter.label}</button>)}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted" aria-live="polite">Showing {filtered.length} of {diseases.length} diseases{band !== "ALL" ? ` · ${FILTERS.find((filter) => filter.id === band)?.label}` : ""}</p>
    </div>

    <div className="mt-4 overflow-hidden rounded-3xl border border-line/70 bg-white/75 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">POROS rare disease portfolio with translation risk scores</caption>
          <thead className="bg-[#f3f5ef] text-left text-[10px] font-semibold uppercase tracking-[.13em] text-muted"><tr><th scope="col" className="px-5 py-3.5">Disease</th><th scope="col" className="px-5 py-3.5">Risk band</th><th scope="col" className="px-5 py-3.5 text-right">Translation risk</th><th scope="col" className="w-14 px-5 py-3.5" aria-label="Open profile" /></tr></thead>
          <tbody>{filtered.map((d) => <tr key={d.slug} className="border-t border-line/60 transition-colors hover:bg-sage-soft/25">
            <th scope="row" className="px-5 py-4 text-left font-semibold text-ink"><Link href={`/disease/${d.slug}`} className="rounded-sm hover:text-sage-dark hover:underline">{d.name}</Link><span className="mt-1 block text-[11px] font-normal text-muted">{d.trs == null ? "Evidence snapshot not scored" : `Evidence coverage ${d.evidence_coverage ?? "—"}${d.evidence_coverage != null ? "%" : ""}`}</span></th>
            <td className="px-5 py-4"><RiskBadge band={d.risk_band} /></td>
            <td className="px-5 py-4 text-right font-mono tabular-nums text-ink">{d.trs != null ? <>{d.trs.toFixed(1)}<span className="ml-1 text-xs text-muted">/100</span></> : <ScoreDiseaseButton name={d.name} className="inline-flex justify-end" />}</td>
            <td className="px-5 py-4 text-right"><Link aria-label={`Open ${d.name} profile`} href={`/disease/${d.slug}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-sage-soft hover:text-sage-dark">↗</Link></td>
          </tr>)}
          {!filtered.length && <tr><td colSpan={4} className="px-5 py-14 text-center"><p className="font-medium text-ink">No diseases match those filters.</p><button type="button" onClick={() => { setQuery(""); setBand("ALL"); }} className="mt-2 text-sm font-semibold text-sage-dark hover:underline">Clear filters</button></td></tr>}</tbody>
        </table>
      </div>
    </div>
  </section>;
}
