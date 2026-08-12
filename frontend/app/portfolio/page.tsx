import { listDiseases } from "@/lib/api";
import DiseaseCard from "@/components/DiseaseCard";
import PortfolioRefresh from "@/components/PortfolioRefresh";

export const metadata = { title: "Portfolio — POROS" };

export default async function PortfolioPage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    apiError = true;
  }

  const scored = diseases.filter((d) => d.trs != null);
  const sorted = [...diseases].sort((a, b) => (b.trs ?? -1) - (a.trs ?? -1));

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Full portfolio</p>
      <h1 className="font-display text-3xl text-ink mb-2">
        {diseases.length} disease{diseases.length === 1 ? "" : "s"} in the portfolio
      </h1>
      <p className="text-sm text-muted mb-8">
        {scored.length} scored, ranked by Translation Risk
        {diseases.length > scored.length ? ` · ${diseases.length - scored.length} not yet scored` : ""}
      </p>

      {apiError && (
        <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">
          Couldn&rsquo;t reach the POROS API. This is a backend/network issue, not an empty portfolio — check
          that the backend is running and reachable at <code className="font-mono">NEXT_PUBLIC_API_URL</code>.
        </div>
      )}

      {!apiError && <PortfolioRefresh unscoredCount={diseases.length - scored.length} />}

      {sorted.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((d) => (
            <DiseaseCard key={d.slug} d={d} />
          ))}
        </div>
      ) : !apiError ? (
        <div className="border hairline rounded-xl p-10 text-center text-muted bg-card">
          No diseases in the portfolio yet. Click &ldquo;Refresh portfolio now&rdquo; above to fetch evidence.
        </div>
      ) : null}
    </div>
  );
}
