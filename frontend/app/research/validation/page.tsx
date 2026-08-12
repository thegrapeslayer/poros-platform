"use client";

import { useEffect, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import {
  getExtractorMetrics,
  getStaleExtractorVersions,
  getValidationSample,
  saveValidationLabel,
  wipeStaleExtractorVersions,
  type ExtractorMetrics,
  type ValidationRow,
} from "@/lib/api";

export default function ValidationPage() {
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [metrics, setMetrics] = useState<ExtractorMetrics | null>(null);
  const [stale, setStale] = useState<{ stale_versions: string[]; current_version: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function refresh() {
    getValidationSample(75)
      .then((d) => setRows(d.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't reach the API."));
    getExtractorMetrics().then(setMetrics).catch(() => null);
    getStaleExtractorVersions().then(setStale).catch(() => null);
  }

  useEffect(refresh, []);

  async function label(evidenceId: number, value: "CONFIRMED_PRESENT" | "NOT_CONFIRMED") {
    setBusyId(evidenceId);
    try {
      await saveValidationLabel(evidenceId, value);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleWipe() {
    if (!confirm("Delete all Type B evidence from extractor versions other than the current one? This cannot be undone.")) return;
    await wipeStaleExtractorVersions();
    refresh();
  }

  const unreviewed = rows.filter((r) => !r.reviewed);
  const reviewed = rows.filter((r) => r.reviewed);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-3">Extractor validation</h1>
      <p className="text-ink/70 leading-relaxed mb-8 max-w-2xl">
        A random sample of Type B evidence decisions for human QA review. This is a repair/QA pass on the
        extractor, <span className="font-medium">not</span> a formal independent second human rater — a
        manuscript inter-rater-reliability claim still needs an independent reviewer coding the same sample
        blind to the machine&rsquo;s output.
      </p>
      <ResearchNav />

      {error && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">{error}</div>}

      {metrics && (
        <section className="mb-10">
          <h2 className="font-display text-lg text-ink mb-3">Extractor performance</h2>
          {metrics.n === 0 ? (
            <p className="text-sm text-muted">No human labels saved yet — label some decisions below first.</p>
          ) : metrics.error ? (
            <p className="text-sm text-rose">{metrics.error}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-3">
              <Metric label="Reviewed" value={String(metrics.n)} />
              <Metric label="Accuracy" value={metrics.accuracy?.toFixed(2) ?? "—"} />
              <Metric label="Precision" value={metrics.precision?.toFixed(2) ?? "—"} />
              <Metric label="Recall" value={metrics.recall?.toFixed(2) ?? "—"} />
              <Metric label="Cohen's κ" value={metrics.cohen_kappa != null ? metrics.cohen_kappa.toFixed(2) : "—"} />
            </div>
          )}
          {metrics.rater_note && <p className="text-xs text-muted italic">{metrics.rater_note}</p>}
        </section>
      )}

      {stale && stale.stale_versions.length > 0 && (
        <section className="mb-10 border hairline rounded-2xl bg-gold-soft/40 p-5">
          <p className="text-sm text-ink/80 mb-3">
            Evidence exists from {stale.stale_versions.length} older extractor version(s):{" "}
            <span className="font-mono text-xs">{stale.stale_versions.join(", ")}</span>. Current version:{" "}
            <span className="font-mono text-xs">{stale.current_version}</span>.
          </p>
          <button onClick={handleWipe} className="text-sm font-medium text-rose hover:underline">
            Wipe evidence from older extractor versions
          </button>
        </section>
      )}

      <section className="mb-6">
        <h2 className="font-display text-lg text-ink mb-3">
          Review next ({unreviewed.length} remaining of {rows.length})
        </h2>
        <div className="space-y-3">
          {unreviewed.slice(0, 8).map((r) => (
            <div key={r.evidence_id} className="border hairline rounded-xl p-4 bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-muted">
                  {r.Disease} · {r.feature_id}
                </span>
                <span className="text-xs font-mono text-sage-dark">{r.status}</span>
              </div>
              <p className="text-sm text-ink/80 mb-3">
                {r.supporting_snippet || <span className="text-muted italic">No supporting snippet available.</span>}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={busyId === r.evidence_id}
                  onClick={() => label(r.evidence_id, "CONFIRMED_PRESENT")}
                  className="text-xs px-3 py-1.5 rounded-full border hairline hover:bg-sage-soft disabled:opacity-40"
                >
                  Confirm present
                </button>
                <button
                  disabled={busyId === r.evidence_id}
                  onClick={() => label(r.evidence_id, "NOT_CONFIRMED")}
                  className="text-xs px-3 py-1.5 rounded-full border hairline hover:bg-rose-soft disabled:opacity-40"
                >
                  Not confirmed
                </button>
              </div>
            </div>
          ))}
          {unreviewed.length === 0 && rows.length > 0 && (
            <p className="text-sm text-sage-dark">All sampled decisions reviewed.</p>
          )}
          {rows.length === 0 && !error && (
            <p className="text-sm text-muted">No Type B evidence yet — run the pipeline from the Overview tab.</p>
          )}
        </div>
      </section>

      {reviewed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{reviewed.length} already reviewed</summary>
          <div className="mt-3 space-y-2">
            {reviewed.map((r) => (
              <div key={r.evidence_id} className="flex items-center justify-between border-t hairline py-2 text-xs">
                <span className="font-mono text-muted">
                  {r.Disease} · {r.feature_id}
                </span>
                <span>
                  machine: <span className="font-mono">{r.status}</span> · human:{" "}
                  <span className="font-mono">{r.human_label}</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border hairline rounded-xl p-3 bg-card text-center">
      <div className="font-display text-xl text-ink">{value}</div>
      <div className="eyebrow text-muted mt-1">{label}</div>
    </div>
  );
}
