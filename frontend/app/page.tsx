import Link from "next/link";
import { listDiseases } from "@/lib/api";
import DiseaseCard from "@/components/DiseaseCard";
import SearchBar from "@/components/SearchBar";

export default async function HomePage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try {
    const data = await listDiseases();
    diseases = data.diseases;
  } catch {
    apiError = true;
  }

  const scored = diseases.filter((d) => d.trs != null);
  const trialsIndexed = null; // surfaced once /api aggregates trial counts across the portfolio
  const highRisk = scored.filter((d) => d.risk_band === "HIGH").slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <p className="eyebrow text-sage-dark mb-4">Rare Disease Translation Initiative</p>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.1] max-w-3xl text-ink">
          Identifying where promising rare disease therapies stall between
          biological discovery and patient access.
        </h1>
        <p className="mt-6 max-w-2xl text-ink/70 leading-relaxed">
          POROS scores each disease&rsquo;s translation pathway from structured trial,
          funding, and regulatory records alongside documentary evidence in the
          literature &mdash; then traces every score back to its source.
        </p>
        <div className="mt-8 max-w-xl">
          <SearchBar diseases={diseases.map((d) => ({ name: d.name, slug: d.slug }))} />
        </div>
      </section>

      {apiError && (
        <section className="max-w-6xl mx-auto px-6 pb-10">
          <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80">
            Couldn&rsquo;t reach the POROS API at build/render time. Start the backend
            (see <code className="font-mono">backend/README</code>) and set{" "}
            <code className="font-mono">NEXT_PUBLIC_API_URL</code>.
          </div>
        </section>
      )}

      {/* Stats strip */}
      <section className="border-y hairline bg-paper2/60">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <Stat label="Diseases analyzed" value={diseases.length ? String(diseases.length) : "—"} />
          <Stat label="Scored, current snapshot" value={String(scored.length)} />
          <Stat label="High translation risk" value={String(diseases.filter((d) => d.risk_band === "HIGH").length)} />
          <Stat label="Evidence sources" value="4" hint="ClinicalTrials.gov · Europe PMC · NIH RePORTER · openFDA" />
        </div>
      </section>

      {/* Portfolio preview */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="eyebrow text-muted mb-2">Translation landscape</p>
            <h2 className="font-display text-2xl text-ink">Highest translation risk right now</h2>
          </div>
          <Link href="/portfolio" className="text-sm text-sage-dark hover:underline">
            View full portfolio &rarr;
          </Link>
        </div>
        {highRisk.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {highRisk.map((d) => (
              <DiseaseCard key={d.slug} d={d} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-ink">{value}</div>
      <div className="eyebrow text-muted mt-1">{label}</div>
      {hint && <div className="text-xs text-muted/80 mt-1">{hint}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border hairline rounded-xl p-10 text-center text-muted bg-card">
      No scored diseases yet.{" "}
      <Link href="/portfolio" className="text-sage-dark hover:underline">
        Go to the portfolio to fetch evidence &rarr;
      </Link>
    </div>
  );
}
