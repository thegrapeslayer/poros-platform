import { listDiseases } from "@/lib/api";
import DiseaseTable from "@/components/DiseaseTable";

export const metadata = { title: "Diseases — RDTI" };

export default async function DiseasesPage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    diseases = [];
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Index</p>
      <h1 className="font-display text-3xl text-ink mb-8">All diseases</h1>
      <DiseaseTable diseases={diseases} />
    </div>
  );
}
