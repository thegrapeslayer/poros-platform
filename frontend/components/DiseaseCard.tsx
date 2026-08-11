import Link from "next/link";
import RiskBadge from "./RiskBadge";
import type { DiseaseSummary } from "@/lib/api";

export default function DiseaseCard({ d }: { d: DiseaseSummary }) {
  return (
    <Link
      href={`/disease/${d.slug}`}
      className="block card-shadow bg-card border hairline rounded-xl p-5 hover:-translate-y-0.5 hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg leading-snug text-ink">{d.name}</h3>
        <RiskBadge band={d.risk_band} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="eyebrow text-muted">Translation Risk</span>
        <span className="font-mono text-2xl text-ink/90">
          {d.trs != null ? d.trs.toFixed(1) : "—"}
          <span className="text-sm text-muted"> /100</span>
        </span>
      </div>
    </Link>
  );
}
