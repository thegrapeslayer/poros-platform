import { listDiseases } from "@/lib/api";
import CompareClient from "@/components/CompareClient";

export const metadata = { title: "Compare — RDTI" };

export default async function ComparePage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    diseases = [];
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Side by side</p>
      <h1 className="font-display text-3xl text-ink mb-8">Compare diseases</h1>
      <CompareClient options={diseases.map((d) => ({ name: d.name, slug: d.slug }))} />
    </div>
  );
}
