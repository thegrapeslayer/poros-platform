import { listDiseases } from "@/lib/api";
import CompareClient from "@/components/CompareClient";

export const metadata = { title: "Compare — POROS" };

export default async function ComparePage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    apiError = true;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Side by side</p>
      <h1 className="font-display text-3xl text-ink mb-8">Compare diseases</h1>
      {apiError && (
        <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">
          Couldn&rsquo;t reach the POROS API. Check that the backend is running and reachable.
        </div>
      )}
      <CompareClient options={diseases.map((d) => ({ name: d.name, slug: d.slug }))} />
    </div>
  );
}
