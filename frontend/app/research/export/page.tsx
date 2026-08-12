"use client";

import { useEffect, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import { exportBundleUrl, getMethodsSnapshot } from "@/lib/api";

export default function ExportPage() {
  const [methods, setMethods] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMethodsSnapshot()
      .then((d) => setMethods(d.text))
      .catch((e) => setError(e instanceof Error ? e.message : "No pipeline run yet."));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-3">Export</h1>
      <p className="text-ink/70 leading-relaxed mb-8">
        Rebuilds the full manuscript bundle from the most recent pipeline run: dataset CSV, analysis JSON,
        counterfactual and univariate CSVs, a plain-text methods snapshot, the feature dictionary, figures, and a
        provenance copy of the evidence database.
      </p>
      <ResearchNav />

      {error && (
        <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">
          {error} Run the pipeline from the Overview tab first.
        </div>
      )}

      {!error && (
        <>
          <a
            href={exportBundleUrl()}
            className="inline-block rounded-full bg-sage-dark text-white px-6 py-3 text-sm font-medium hover:bg-sage transition-colors mb-10"
          >
            Download manuscript bundle (.zip)
          </a>

          {methods && (
            <section>
              <h2 className="font-display text-lg text-ink mb-3">Methods snapshot</h2>
              <pre className="border hairline rounded-2xl bg-card card-shadow p-5 text-xs whitespace-pre-wrap leading-relaxed">
                {methods}
              </pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
