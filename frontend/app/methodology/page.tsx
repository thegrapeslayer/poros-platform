import { getMethodology } from "@/lib/api";

export const metadata = { title: "Methodology — RDTI" };

const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];

export default async function MethodologyPage() {
  let m;
  try {
    m = await getMethodology();
  } catch {
    m = null;
  }

  if (!m) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-muted">Couldn&rsquo;t reach the RDTI API. Start the backend to load methodology details.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Methodology</p>
      <h1 className="font-display text-3xl text-ink mb-6">How the Translation Risk Score is built</h1>
      <p className="text-ink/80 leading-relaxed mb-10">{m.summary}</p>

      <div className="border-l-2 border-sage/40 pl-6 mb-12">
        <p className="text-xs font-mono text-muted">
          engine {m.app_version} · model {m.model_version} · extractor {m.extractor_version}
        </p>
      </div>

      <h2 className="font-display text-xl text-ink mb-4">Domains</h2>
      <div className="space-y-8">
        {DOMAIN_ORDER.map((d) => {
          const features = Object.entries(m.features).filter(([, f]) => f.domain === d);
          return (
            <div key={d}>
              <h3 className="font-display text-lg text-sage-dark mb-3">{m.domains[d]}</h3>
              <ul className="space-y-2">
                {features.map(([fid, f]) => (
                  <li key={fid} className="text-sm border-b hairline pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink/90">{f.label}</span>
                      <span className="text-[11px] font-mono text-muted">Type {f.type}</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{f.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
