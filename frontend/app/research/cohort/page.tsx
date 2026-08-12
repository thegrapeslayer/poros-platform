"use client";

import { useEffect, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import { getResearchAnalyses, getResearchDataset, type AnalysesResult } from "@/lib/api";

type DatasetRow = Record<string, unknown> & { Disease?: string; TRS?: number | null };

export default function CohortPage() {
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [analyses, setAnalyses] = useState<AnalysesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResearchDataset()
      .then((d) => setRows(d.rows as DatasetRow[]))
      .catch((e) => setError(e instanceof Error ? e.message : "No dataset yet."));
    getResearchAnalyses().catch(() => null).then((a) => a && setAnalyses(a));
  }, []);

  const columns = rows && rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-8">Cohort &amp; analyses</h1>
      <ResearchNav />

      {error && (
        <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">
          {error} Run the pipeline from the Overview tab first.
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <section className="mb-12">
            <h2 className="font-display text-lg text-ink mb-3">Manuscript dataset ({rows.length} diseases)</h2>
            <div className="border hairline rounded-2xl overflow-auto card-shadow bg-card">
              <table className="w-full text-sm">
                <thead className="bg-paper2/60 text-left">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium text-muted whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t hairline">
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-2 whitespace-nowrap">
                          {String(r[c] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {analyses && (
            <>
              <section className="mb-12">
                <h2 className="font-display text-lg text-ink mb-1">Predictive models</h2>
                <p className="text-sm text-muted mb-4">
                  Outcome: {analyses.outcome} · n={analyses.n_total}, events={analyses.events}. Small-sample models
                  should be read as exploratory, not confirmatory.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {Object.entries(analyses.models).map(([name, m]) => (
                    <div key={name} className="border hairline rounded-xl p-4 bg-card">
                      <p className="font-mono text-xs text-muted mb-1">{name}</p>
                      {m.error ? (
                        <p className="text-sm text-rose">{m.error}</p>
                      ) : (
                        <p className="text-sm">
                          AUC <span className="font-display text-xl">{m.auc?.toFixed(2)}</span>
                          {m.auc_ci && (
                            <span className="text-muted text-xs ml-2">
                              (95% CI {m.auc_ci[0].toFixed(2)}–{m.auc_ci[1].toFixed(2)})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="font-display text-lg text-ink mb-3">Univariate associations</h2>
                <div className="border hairline rounded-2xl overflow-auto card-shadow bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-paper2/60 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium text-muted">Predictor</th>
                        <th className="px-3 py-2 font-medium text-muted">n</th>
                        <th className="px-3 py-2 font-medium text-muted">Odds ratio (per 10 pts)</th>
                        <th className="px-3 py-2 font-medium text-muted">95% CI</th>
                        <th className="px-3 py-2 font-medium text-muted">p</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.univariate.map((u) => (
                        <tr key={u.predictor} className="border-t hairline">
                          <td className="px-3 py-2 font-mono text-xs">{u.predictor}</td>
                          <td className="px-3 py-2">{u.n}</td>
                          <td className="px-3 py-2">{u.error ? "—" : u.odds_ratio?.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            {u.error ? u.error : u.ci ? `${u.ci[0].toFixed(2)}–${u.ci[1].toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2">{u.error ? "—" : u.p_value?.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
