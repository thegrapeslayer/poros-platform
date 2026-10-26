import { listDiseases } from "@/lib/api";
import DiseaseTable from "@/components/DiseaseTable";
import PortfolioRefresh from "@/components/PortfolioRefresh";

export const metadata = { title: "Disease portfolio" };
export const dynamic = "force-dynamic";

export default async function DiseasesPage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try { diseases = (await listDiseases()).diseases; } catch { apiError = true; }
  const scored = diseases.filter((d) => d.trs != null).length;
  const unscoredCount = diseases.length - scored;

  return <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <div className="mb-8 flex flex-col gap-6 border-b border-line/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow text-sage-dark">Explore the landscape</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Disease portfolio</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Find a condition, scan its translation risk, and open the underlying evidence. Scores are always shown with their evidence coverage.</p>
      </div>
      <div className="flex gap-3">
        <PortfolioStat label="In portfolio" value={diseases.length || "—"} />
        <PortfolioStat label="Scored" value={scored} />
      </div>
    </div>
    {apiError && <div role="status" className="mb-6 rounded-2xl border border-gold/30 bg-gold-soft/60 p-4 text-sm text-ink/80">POROS can&rsquo;t reach its data service. Check that the backend is running and connected, then reload this page.</div>}
    {!apiError && <div className="mb-6"><PortfolioRefresh unscoredCount={unscoredCount} /></div>}
    <DiseaseTable diseases={diseases} />
  </div>;
}

function PortfolioStat({ label, value }: { label: string; value: number | string }) {
  return <div className="min-w-[6rem] rounded-2xl border border-line/70 bg-white/60 px-4 py-3"><p className="text-[10px] font-medium uppercase tracking-[.12em] text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p></div>;
}

