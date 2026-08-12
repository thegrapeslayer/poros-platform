"use client";

import { useEffect, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import {
  getPipelineConfig,
  getPipelineStatus,
  runPipeline,
  type PipelineConfig,
  type PipelineStatus,
} from "@/lib/api";

export default function ResearchOverviewPage() {
  const [config, setConfig] = useState<PipelineConfig | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [useFullCohort, setUseFullCohort] = useState(true);
  const [customCount, setCustomCount] = useState(20);

  useEffect(() => {
    getPipelineConfig().then(setConfig).catch(() => setError("Couldn't reach the RDTI API."));
  }, []);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const s = await getPipelineStatus();
        if (!stop) setStatus(s);
      } catch {
        /* backend not reachable yet — keep trying */
      }
      if (!stop) setTimeout(poll, 3000);
    }
    poll();
    return () => {
      stop = true;
    };
  }, []);

  async function handleRun() {
    if (!config) return;
    setStarting(true);
    setError(null);
    try {
      const diseases = useFullCohort ? undefined : config.default_cohort.slice(0, customCount);
      await runPipeline({
        diseases,
        baseline_date: config.default_baseline_date,
        followup_end: config.default_followup_end,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start pipeline.");
    } finally {
      setStarting(false);
    }
  }

  const running = status?.running ?? false;
  const progressPct = status && status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-3">Manuscript pipeline</h1>
      <p className="text-ink/70 leading-relaxed mb-8 max-w-2xl">
        This section wraps the historical-cohort scoring, outcome derivation, predictive analyses,
        Type B extractor validation, and counterfactual scenario tooling that the original research
        plan called for — it&rsquo;s an operator surface for building and checking the manuscript
        dataset, not part of the public disease-lookup site.
      </p>
      <ResearchNav />

      {error && (
        <div className="border hairline rounded-xl bg-rose-soft/60 p-4 text-sm text-ink/80 mb-8">{error}</div>
      )}

      <div className="border hairline rounded-2xl bg-card card-shadow p-6 mb-8">
        <h2 className="font-display text-lg text-ink mb-1">Run the pipeline</h2>
        <p className="text-sm text-muted mb-5">
          Walks each disease through resolve &rarr; historical snapshot ({config?.default_baseline_date ?? "…"}) &rarr;
          score &rarr; outcome derivation (through {config?.default_followup_end ?? "…"}) &rarr; predictive analyses
          &rarr; counterfactual scan &rarr; exportable bundle. Needs outbound internet access to ClinicalTrials.gov,
          Europe PMC, NIH RePORTER, and openFDA, and takes a while for a full cohort.
        </p>

        <div className="flex flex-col gap-3 mb-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={useFullCohort} onChange={() => setUseFullCohort(true)} />
            Full default cohort ({config?.default_cohort_size ?? "…"} diseases)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!useFullCohort} onChange={() => setUseFullCohort(false)} />
            First
            <input
              type="number"
              min={8}
              max={config?.default_cohort_size ?? 100}
              value={customCount}
              onChange={(e) => setCustomCount(Number(e.target.value))}
              className="w-20 border hairline rounded-lg px-2 py-1 bg-paper"
              disabled={useFullCohort}
            />
            diseases from the cohort (minimum 8 — good for a quick test run)
          </label>
        </div>

        <button
          onClick={handleRun}
          disabled={running || starting || !config}
          className="rounded-full bg-sage-dark text-white px-5 py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-sage transition-colors"
        >
          {running ? "Pipeline running…" : starting ? "Starting…" : "Run pipeline"}
        </button>
      </div>

      <div className="border hairline rounded-2xl bg-card card-shadow p-6">
        <h2 className="font-display text-lg text-ink mb-3">Status</h2>
        {!status ? (
          <p className="text-sm text-muted">Waiting for backend…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/80">{status.step || "Idle"}</span>
              <span className="text-muted font-mono text-xs">
                {status.done}/{status.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-paper2 overflow-hidden">
              <div
                className="h-full bg-sage-dark transition-all"
                style={{ width: `${running ? progressPct : status.cohort_id ? 100 : 0}%` }}
              />
            </div>
            {status.cohort_id && (
              <p className="text-xs text-muted font-mono">
                cohort {status.cohort_id} · baseline {status.baseline_date} · follow-up {status.followup_end}
              </p>
            )}
            {status.errors.length > 0 && (
              <details className="text-xs text-rose">
                <summary className="cursor-pointer">{status.errors.length} error(s) during last run</summary>
                <pre className="mt-2 whitespace-pre-wrap bg-paper2 rounded-lg p-3 max-h-64 overflow-auto">
                  {JSON.stringify(status.errors, null, 2)}
                </pre>
              </details>
            )}
            {!running && status.cohort_id && (
              <p className="text-sm text-sage-dark">
                Last run complete — see <span className="font-mono">Cohort &amp; analyses</span> above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
