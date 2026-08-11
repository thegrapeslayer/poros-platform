import { listDiseases } from "@/lib/api";
import DiseaseCard from "@/components/DiseaseCard";

export const metadata = { title: "Portfolio — RDTI" };

export default async function PortfolioPage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    diseases = [];
  }

  const sorted = [...diseases].sort((a, b) => (b.trs ?? -1) - (a.trs ?? -1));

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Full portfolio</p>
      <h1 className="font-display text-3xl text-ink mb-8">
        {diseases.length} disease{diseases.length === 1 ? "" : "s"}, ranked by Translation Risk
      </h1>
      {sorted.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((d) => (
            <DiseaseCard key={d.slug} d={d} />
          ))}
        </div>
      ) : (
        <div className="border hairline rounded-xl p-10 text-center text-muted bg-card">
          No scored diseases yet. Run{" "}
          <code className="font-mono">POST /api/admin/refresh</code> against the backend.
        </div>
      )}
    </div>
  );
}
