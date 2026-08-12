import { listDiseases } from "@/lib/api";
import DiseaseTable from "@/components/DiseaseTable";
import PortfolioRefresh from "@/components/PortfolioRefresh";
import CohortBadge from "@/components/CohortBadge";

export const metadata = { title: "Diseases — POROS" };

export default async function DiseasesPage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    apiError = true;
  }

  const scored = diseases.filter((d) => d.trs != null);

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Portfolio</p>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="font-display text-3xl text-ink">
          {diseases.length} disease{diseases.length === 1 ? "" : "s"}
        </h1>
        <CohortBadge status="validated" />
      </div>
      <p className="text-sm text-muted mb-8">
        {scored.length} scored, ranked by Translation Risk
        {diseases.length > scored.length ? ` · ${diseases.length - scored.length} not yet scored` : ""}. Every
        disease below is a member of POROS&rsquo;s frozen 100-disease manuscript cohort — search or filter to
        find one, or score the whole portfolio at once.
      </p>

      {apiError && (
        <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">
          Couldn&rsquo;t reach the POROS API. This is a backend/network issue, not an empty portfolio — check
          that the backend is running and reachable at <code className="font-mono">NEXT_PUBLIC_API_URL</code>.
        </div>
      )}

      {!apiError && <PortfolioRefresh unscoredCount={diseases.length - scored.length} />}

      <DiseaseTable diseases={diseases} />
    </div>
  );
}
