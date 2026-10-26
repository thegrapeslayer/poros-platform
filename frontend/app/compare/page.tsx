import { listDiseases } from "@/lib/api";
import CompareClient from "@/components/CompareClient";

export const metadata = { title: "Compare diseases" };

export default async function ComparePage({ searchParams }: { searchParams: { diseases?: string } }) {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try { diseases = (await listDiseases()).diseases; } catch { apiError = true; }
  return <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <div className="mb-8 max-w-3xl">
      <p className="eyebrow text-sage-dark">Compare the landscape</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">See where pathways differ.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Choose up to four diseases to compare translation risk across biology, clinical development, regulation, economics, and infrastructure.</p>
    </div>
    {apiError && <div role="status" className="mb-6 rounded-2xl border border-gold/30 bg-gold-soft/60 p-4 text-sm text-ink/80">POROS can&rsquo;t reach its data service right now. The comparison will work as soon as the backend connection is available.</div>}
    <CompareClient initialSelected={(searchParams.diseases ?? "").split(",").filter((slug, i, all) => all.indexOf(slug) === i).map((slug) => diseases.find((d) => d.slug === slug)?.name).filter((name): name is string => Boolean(name)).slice(0, 4)} options={diseases.map((disease) => ({ name: disease.name, slug: disease.slug }))} />
  </div>;
}

