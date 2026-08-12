"use client";

import { useEffect, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import {
  getCounterfactual,
  getCounterfactualCohort,
  getCounterfactualRank,
  getMethodology,
  getPipelineConfig,
  type CounterfactualResult,
} from "@/lib/api";

export default function CounterfactualPage() {
  const [cohort, setCohort] = useState<string[]>([]);
  const [features, setFeatures] = useState<{ id: string; label: string; modifiable: boolean }[]>([]);
  const [disease, setDisease] = useState("");
  const [feature, setFeature] = useState("");
  const [single, setSingle] = useState<CounterfactualResult | null>(null);
  const [ranked, setRanked] = useState<CounterfactualResult[]>([]);
  const [cohortRows, setCohortRows] = useState<(CounterfactualResult & { Disease: string; rank: number })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPipelineConfig()
      .then((c) => {
        setCohort(c.default_cohort);
        setDisease(c.default_cohort[0] ?? "");
      })
      .catch(() => null);
    getMethodology()
      .then((m) =>
        setFeatures(
          Object.entries(m.features)
            .filter(([, f]) => f.modifiable)
            .map(([id, f]) => ({ id, label: f.label, modifiable: f.modifiable }))
        )
      )
      .catch(() => null);
    getCounterfactualCohort()
      .then((d) => setCohortRows(d.rows))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (features.length && !feature) setFeature(features[0].id);
  }, [features, feature]);

  async function runSingle() {
    if (!disease || !feature) return;
    setLoading(true);
    setError(null);
    setSingle(null);
    try {
      const [s, r] = await Promise.all([getCounterfactual(disease, feature), getCounterfactualRank(disease)]);
      setSingle(s);
      setRanked(r.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run the research pipeline first.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-3">Counterfactual scenarios</h1>
      <p className="text-ink/70 leading-relaxed mb-8 max-w-2xl">
        Changes one modifiable, factual input and reruns the identical scoring function used everywhere else in
        the app. These are model-based scenarios, not proven causal effects.
      </p>
      <ResearchNav />

      {error && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">{error}</div>}

      <section className="border hairline rounded-2xl bg-card card-shadow p-6 mb-10">
        <h2 className="font-display text-lg text-ink mb-4">Single disease, single lever</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
            className="border hairline rounded-lg px-3 py-2 bg-paper text-sm flex-1 min-w-[220px]"
          >
            {cohort.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            className="border hairline rounded-lg px-3 py-2 bg-paper text-sm flex-1 min-w-[220px]"
          >
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={runSingle}
            disabled={loading}
            className="rounded-full bg-sage-dark text-white px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-sage"
          >
            {loading ? "Running…" : "Run scenario"}
          </button>
        </div>

        {single && (
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Metric label="Baseline TRS" value={single.baseline_trs != null ? String(single.baseline_trs) : "—"} />
            <Metric label="Scenario TRS" value={single.scenario_trs != null ? String(single.scenario_trs) : "—"} />
            <Metric
              label="Δ TRS"
              value={single.delta_trs != null ? single.delta_trs.toFixed(2) : "—"}
              accent={single.delta_trs != null && single.delta_trs < 0 ? "sage" : undefined}
            />
          </div>
        )}
        {single && !single.eligible && (
          <p className="text-sm text-muted mt-3">{single.reason || "Not eligible for this scenario."}</p>
        )}

        {ranked.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-muted mb-2">Every eligible lever for {disease}, ranked:</p>
            <div className="border hairline rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper2/60 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted">Feature</th>
                    <th className="px-3 py-2 font-medium text-muted">Δ TRS</th>
                    <th className="px-3 py-2 font-medium text-muted">Δ probability</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r) => (
                    <tr key={r.feature_id} className="border-t hairline">
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2">{r.delta_trs != null ? r.delta_trs.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2">
                        {r.delta_probability != null ? r.delta_probability.toFixed(3) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg text-ink mb-1">Cohort-wide scan</h2>
        <p className="text-sm text-muted mb-4">
          Ranked levers across the highest-risk quartile of the cohort — shows whether one intervention
          dominates across diseases or the best lever is idiosyncratic per disease.
        </p>
        {cohortRows.length === 0 ? (
          <p className="text-sm text-muted">No cohort-level counterfactual data yet — run the pipeline first.</p>
        ) : (
          <div className="border hairline rounded-2xl overflow-auto card-shadow bg-card">
            <table className="w-full text-sm">
              <thead className="bg-paper2/60 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-muted">Disease</th>
                  <th className="px-3 py-2 font-medium text-muted">Rank</th>
                  <th className="px-3 py-2 font-medium text-muted">Feature</th>
                  <th className="px-3 py-2 font-medium text-muted">Δ TRS</th>
                </tr>
              </thead>
              <tbody>
                {cohortRows.map((r, i) => (
                  <tr key={i} className="border-t hairline">
                    <td className="px-3 py-2">{r.Disease}</td>
                    <td className="px-3 py-2">{r.rank}</td>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2">{r.delta_trs != null ? r.delta_trs.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "sage" }) {
  return (
    <div className="border hairline rounded-xl p-3 bg-card text-center">
      <div className={`font-display text-xl ${accent === "sage" ? "text-sage-dark" : "text-ink"}`}>{value}</div>
      <div className="eyebrow text-muted mt-1">{label}</div>
    </div>
  );
}
