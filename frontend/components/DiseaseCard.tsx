import Link from "next/link";
import RiskBadge from "./RiskBadge";
import type { DiseaseSummary } from "@/lib/api";

export default function DiseaseCard({ d }: { d: DiseaseSummary }) {
  return <Link href={`/disease/${d.slug}`} className="group block rounded-2xl border border-line/70 bg-white/75 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sage/40 hover:shadow-xl hover:shadow-ink/5 focus-visible:outline-offset-4">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-sage-dark">{d.name}</h3>
      <RiskBadge band={d.risk_band} />
    </div>
    <div className="mt-6 flex items-end justify-between border-t border-line/60 pt-4">
      <div><p className="text-xs text-muted">Translation risk</p><p className="mt-1 text-[11px] text-muted">Evidence coverage {d.evidence_coverage ?? "—"}{d.evidence_coverage != null ? "%" : ""}</p></div>
      <span className="font-mono text-2xl font-medium tabular-nums text-ink">{d.trs != null ? d.trs.toFixed(1) : "—"}<span className="ml-1 text-xs text-muted">/100</span></span>
    </div>
  </Link>;
}
