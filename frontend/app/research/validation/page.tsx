"use client";

import { useEffect, useMemo, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import {
  getExtractorMetrics,
  getStaleExtractorVersions,
  getValidationSample,
  saveValidationLabel,
  validationExportUrl,
  wipeStaleExtractorVersions,
  type ExtractorMetrics,
  type HumanLabel,
  type ValidationRow,
} from "@/lib/api";

// Recommended default: ~20 labeled rows per Type B feature (17 features -> ~340 total)
// is enough to compute a per-feature precision/recall/F1 that isn't dominated by noise
// from a handful of examples; 10/feature (~170 total) is a workable first pass if time
// is limited. Either way the sample is stratified by feature_id server-side, and
// deterministic for a fixed target — reloading with the same number reproduces the
// same queue, so resuming later never redraws different rows.
const RECOMMENDED_PER_FEATURE = 20;

const LABELS: { value: HumanLabel; label: string; hint: string }[] = [
  { value: "CONFIRMED_PRESENT", label: "Confirm present", hint: "Evidence genuinely supports this feature." },
  { value: "NOT_CONFIRMED", label: "Not confirmed", hint: "Evidence does not support this feature." },
  { value: "AMBIGUOUS", label: "Ambiguous / flag", hint: "Can't confidently judge — excluded from precision/recall, not counted as an error." },
];

export default function ValidationPage() {
  const [metrics, setMetrics] = useState<ExtractorMetrics | null>(null);
  const [stale, setStale] = useState<{ stale_versions: string[]; current_version: string } | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [perFeature, setPerFeature] = useState(RECOMMENDED_PER_FEATURE);
  const [queue, setQueue] = useState<ValidationRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const [draftLabel, setDraftLabel] = useState<HumanLabel | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [saving, setSaving] = useState(false);

  function refreshMetrics() {
    getExtractorMetrics().then(setMetrics).catch((e) => setMetricsError(e instanceof Error ? e.message : "Couldn't reach the API."));
    getStaleExtractorVersions().then(setStale).catch(() => null);
  }

  useEffect(refreshMetrics, []);

  async function loadQueue() {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      // n is ignored server-side whenever per_feature is set (validation_sample()
      // uses per_feature as the stratification target directly) — pass the API's max
      // so it's never the binding constraint regardless of per_feature's value.
      const data = await getValidationSample(500, perFeature);
      setQueue(data.rows);
      setIndex(0);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Couldn't load a review queue.");
    } finally {
      setLoadingQueue(false);
    }
  }

  const current = queue && queue.length > 0 ? queue[index] : null;
  const unreviewedCount = useMemo(() => (queue ? queue.filter((r) => !r.reviewed).length : 0), [queue]);

  // Reset the draft whenever the current row changes — prefill from any saved label/note
  // so revisiting an already-reviewed item shows (and lets you edit) what you saved.
  useEffect(() => {
    setDraftLabel((current?.human_label as HumanLabel) || null);
    setDraftNote(current?.human_note || "");
  }, [current?.evidence_id]);

  async function saveAndAdvance() {
    if (!current || !draftLabel) return;
    setSaving(true);
    try {
      await saveValidationLabel(current.evidence_id, draftLabel, draftNote);
      setQueue((q) =>
        q ? q.map((r, i) => (i === index ? { ...r, reviewed: 1, human_label: draftLabel, human_note: draftNote } : r)) : q
      );
      refreshMetrics();
      goTo(index + 1);
    } finally {
      setSaving(false);
    }
  }

  function goTo(i: number) {
    if (!queue) return;
    setIndex(Math.max(0, Math.min(queue.length - 1, i)));
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Research</p>
      <h1 className="font-display text-3xl text-ink mb-3">Extractor validation</h1>
      <p className="text-ink/70 leading-relaxed mb-8 max-w-2xl">
        Manual review of Type B extractor decisions. This is the human-labeling step needed before
        precision/recall/F1/Cohen&rsquo;s κ can be treated as a real validation result rather than an untested
        pipeline — see the rater_note below the metrics.
      </p>
      <ResearchNav />

      {metricsError && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">{metricsError}</div>}

      {metrics && (
        <section className="mb-10">
          <h2 className="font-display text-lg text-ink mb-3">Extractor performance</h2>
          {metrics.n === 0 ? (
            <p className="text-sm text-muted">No human labels saved yet — load a queue below and start labeling.</p>
          ) : metrics.error ? (
            <p className="text-sm text-rose">{metrics.error}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-3">
              <Metric label="Reviewed" value={String(metrics.n_reviewed_total ?? metrics.n)} />
              <Metric label="Accuracy" value={metrics.accuracy?.toFixed(2) ?? "—"} />
              <Metric label="Precision" value={metrics.precision?.toFixed(2) ?? "—"} />
              <Metric label="Recall" value={metrics.recall?.toFixed(2) ?? "—"} />
              <Metric label="F1" value={metrics.f1?.toFixed(2) ?? "—"} />
              <Metric label="Cohen's κ" value={metrics.cohen_kappa != null ? metrics.cohen_kappa.toFixed(2) : "—"} />
            </div>
          )}
          {!!metrics.ambiguous_count && (
            <p className="text-xs text-muted mb-2">{metrics.ambiguous_count} row(s) flagged ambiguous — excluded from the numbers above.</p>
          )}
          {metrics.rater_note && <p className="text-xs text-muted italic">{metrics.rater_note}</p>}

          {metrics.by_feature && Object.keys(metrics.by_feature).length > 0 && (
            <div className="mt-6">
              <p className="text-sm text-ink/80 mb-2">Per-feature breakdown</p>
              <div className="border hairline rounded-2xl overflow-auto card-shadow bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-paper2/60 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted">Feature</th>
                      <th className="px-3 py-2 font-medium text-muted">n</th>
                      <th className="px-3 py-2 font-medium text-muted">Precision</th>
                      <th className="px-3 py-2 font-medium text-muted">Recall</th>
                      <th className="px-3 py-2 font-medium text-muted">F1</th>
                      <th className="px-3 py-2 font-medium text-muted">TP / FP / FN / TN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(metrics.by_feature)
                      .sort(([, a], [, b]) => a.f1 - b.f1)
                      .map(([fid, m]) => (
                        <tr key={fid} className="border-t hairline">
                          <td className="px-3 py-2 font-mono text-xs">{fid}</td>
                          <td className="px-3 py-2">{m.n}</td>
                          <td className="px-3 py-2">{m.precision.toFixed(2)}</td>
                          <td className="px-3 py-2">{m.recall.toFixed(2)}</td>
                          <td className="px-3 py-2">{m.f1.toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {m.tp} / {m.fp} / {m.fn} / {m.tn}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted mt-2">
                Sorted worst-F1-first. Small per-feature n is expected with a limited review sample — read as
                indicative of where the extractor may be weaker, not a stable estimate.
              </p>
            </div>
          )}

          {metrics.n > 0 && (
            <a
              href={validationExportUrl()}
              className="inline-block mt-4 text-sm text-sage-dark hover:underline"
            >
              Export completed validation labels (CSV) &rarr;
            </a>
          )}
        </section>
      )}

      {stale && stale.stale_versions.length > 0 && (
        <section className="mb-10 border hairline rounded-2xl bg-gold-soft/40 p-5">
          <p className="text-sm text-ink/80 mb-3">
            Evidence exists from {stale.stale_versions.length} older extractor version(s):{" "}
            <span className="font-mono text-xs">{stale.stale_versions.join(", ")}</span>. Current version:{" "}
            <span className="font-mono text-xs">{stale.current_version}</span>.
          </p>
          <button
            onClick={async () => {
              if (!confirm("Delete all Type B evidence from extractor versions other than the current one? This cannot be undone.")) return;
              await wipeStaleExtractorVersions();
              refreshMetrics();
            }}
            className="text-sm font-medium text-rose hover:underline"
          >
            Wipe evidence from older extractor versions
          </button>
        </section>
      )}

      <section className="mb-10">
        <h2 className="font-display text-lg text-ink mb-1">Label evidence</h2>
        <p className="text-sm text-muted mb-4">
          Recommended: {RECOMMENDED_PER_FEATURE} per feature (~340 total across 17 Type B features) for a stable
          per-feature breakdown; 10/feature (~170) is a workable first pass. The queue is stratified and
          deterministic for a given target — reloading later with the same number resumes at the same rows,
          already-labeled ones included, so nothing is redrawn or duplicated.
        </p>

        <div className="flex items-end gap-3 mb-6">
          <label className="text-sm">
            <span className="block text-muted mb-1">Target per feature</span>
            <input
              type="number"
              min={1}
              max={100}
              value={perFeature}
              onChange={(e) => setPerFeature(Number(e.target.value))}
              className="w-24 border hairline rounded-lg px-2 py-1.5 bg-paper text-sm"
            />
          </label>
          <button
            onClick={loadQueue}
            disabled={loadingQueue}
            className="rounded-full bg-sage-dark text-white px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-sage"
          >
            {loadingQueue ? "Loading…" : queue ? "Reload queue" : "Load queue"}
          </button>
        </div>

        {queueError && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-6">{queueError}</div>}

        {queue && queue.length === 0 && <p className="text-sm text-muted">No Type B evidence yet — run the pipeline from the Overview tab.</p>}

        {current && (
          <div className="border hairline rounded-2xl bg-card card-shadow p-6">
            <div className="flex items-center justify-between mb-4 text-xs text-muted">
              <span>
                Item {index + 1} of {queue!.length} · {unreviewedCount} still need a label
              </span>
              {current.reviewed === 1 && <span className="text-sage-dark font-medium">Already labeled — editing</span>}
            </div>

            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-mono text-xs text-muted">{current.Disease}</p>
                <h3 className="font-display text-lg text-ink">{current.feature_label}</h3>
                <p className="text-xs text-muted mt-1">{current.feature_description}</p>
              </div>
              <span className="text-xs font-mono text-sage-dark whitespace-nowrap">extractor: {current.status}</span>
            </div>

            <div className="border hairline rounded-xl bg-paper p-4 mb-4">
              <p className="text-sm text-ink/80">
                {current.supporting_snippet || <span className="text-muted italic">No supporting snippet available.</span>}
              </p>
            </div>

            <div className="text-xs text-muted mb-4 space-y-1">
              {current.source_title && <p>Source: {current.source_title}</p>}
              <p className="flex flex-wrap gap-3">
                {current.source_url && (
                  <a href={current.source_url} target="_blank" rel="noreferrer" className="text-sage-dark hover:underline">
                    Open source &rarr;
                  </a>
                )}
                {current.pmid && <span className="font-mono">PMID:{current.pmid}</span>}
                {current.pmcid && <span className="font-mono">{current.pmcid}</span>}
                {current.doi && <span className="font-mono">doi:{current.doi}</span>}
                {current.extractor_version && <span className="font-mono">extractor {current.extractor_version}</span>}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {LABELS.map((l) => (
                <button
                  key={l.value}
                  title={l.hint}
                  onClick={() => setDraftLabel(l.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border hairline transition-colors ${
                    draftLabel === l.value ? "bg-sage text-white border-sage" : "bg-card hover:bg-sage-soft/50"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Optional note (e.g. why this was ambiguous)…"
              rows={2}
              className="w-full border hairline rounded-lg px-3 py-2 text-sm bg-paper mb-4"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="text-sm px-4 py-2 rounded-full border hairline disabled:opacity-40"
              >
                &larr; Back
              </button>
              <button
                onClick={() => goTo(index + 1)}
                disabled={index >= queue!.length - 1}
                className="text-sm px-4 py-2 rounded-full border hairline disabled:opacity-40"
              >
                Skip &rarr;
              </button>
              <button
                onClick={saveAndAdvance}
                disabled={!draftLabel || saving}
                className="ml-auto text-sm px-5 py-2 rounded-full bg-sage-dark text-white font-medium disabled:opacity-40 hover:bg-sage"
              >
                {saving ? "Saving…" : "Save & Next"}
              </button>
            </div>
          </div>
        )}

        {queue && queue.length > 0 && (
          <details className="text-sm mt-6">
            <summary className="cursor-pointer text-muted">Jump to an item ({queue.length} in queue)</summary>
            <div className="mt-3 max-h-80 overflow-auto space-y-1">
              {queue.map((r, i) => (
                <button
                  key={r.evidence_id}
                  onClick={() => goTo(i)}
                  className={`w-full text-left flex items-center justify-between border-t hairline py-2 text-xs ${
                    i === index ? "bg-sage-soft/40" : ""
                  }`}
                >
                  <span className="font-mono text-muted">
                    {r.Disease} · {r.feature_id}
                  </span>
                  <span>{r.reviewed ? <span className="text-sage-dark font-mono">{r.human_label}</span> : <span className="text-muted">unlabeled</span>}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </section>
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
