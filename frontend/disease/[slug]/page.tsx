import { notFound } from "next/navigation";
import { getDisease } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";
import DomainBars from "@/components/DomainBars";
import EvidenceSection from "@/components/EvidenceSection";

export default async function DiseaseDetailPage({ params }: { params: { slug: string } }) {
  let disease;
  try {
    disease = await getDisease(params.slug);
  } catch (e) {
    notFound();
  }
  if (!disease) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Disease profile</p>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <h1 className="font-display text-4xl text-ink">{disease.name}</h1>
        <RiskBadge band={disease.risk_band} />
      </div>

      {/* TRS headline */}
      <div className="grid sm:grid-cols-[auto_1fr] gap-8 items-start border hairline rounded-2xl bg-card card-shadow p-8 mb-10">
        <div>
          <p className="eyebrow text-muted mb-1">Translation Risk</p>
          <p className="font-display text-5xl text-ink">
            {disease.trs != null ? disease.trs.toFixed(1) : "—"}
            <span className="text-lg text-muted"> / 100</span>
          </p>
          <p className="text-xs text-muted mt-2">
            Ascertainment {disease.ascertainment_completeness ?? "—"}% · Evidence coverage{" "}
            {disease.evidence_coverage ?? "—"}%
          </p>
        </div>
        <DomainBars domains={disease.domains ?? {}} />
      </div>

      {/* Primary barriers */}
      {disease.primary_barriers?.length > 0 && (
        <div className="mb-10">
          <p className="eyebrow text-muted mb-3">Primary barriers</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {disease.primary_barriers.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-ink/85">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain breakdown + evidence */}
      <EvidenceSection breakdown={disease.domain_breakdown} provenance={disease.provenance} />
    </div>
  );
}
