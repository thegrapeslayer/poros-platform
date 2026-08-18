"use client";

import { useEffect, useMemo, useState } from "react";
import ResearchNav from "@/components/ResearchNav";
import {
  getExtractorMetrics,
  getManuscriptValidationPlan,
  getManuscriptValidationSample,
  getStaleExtractorVersions,
  importValidationCsv,
  saveValidationLabel,
  validationExportUrl,
  wipeStaleExtractorVersions,
  type ExtractorMetrics,
  type HumanLabel,
  type ManuscriptValidationPlan,
  type ValidationImportResult,
  type ValidationRow,
} from "@/lib/api";

const IMPORT_BUCKET_LABELS: Record<string, string> = {
  importable: "New — will be restored",
  identical: "Already matches saved label — no-op",
  conflict: "Conflicts with a different saved label",
  duplicate: "Duplicate evidence_id within this CSV",
  unmatched: "Not part of the current frozen sample",
  malformed: "Doesn't match the frozen sample's own data",
  invalid_label: "Invalid human_label value",
};

const LABELS: { value: HumanLabel; label: string; hint: string }[] = [
  { value: "CONFIRMED_PRESENT", label: "Confirm present", hint: "Evidence genuinely supports this feature." },
  { value: "NOT_CONFIRMED", label: "Not confirmed", hint: "Evidence does not support this feature." },
  { value: "AMBIGUOUS", label: "Ambiguous / flag", hint: "Can't confidently judge — excluded from precision/recall, not counted as an error." },
];

export default function ValidationPage() {
  const [metrics, setMetrics] = useState<ExtractorMetrics | null>(null);
  const [stale, setStale] = useState<{ stale_versions: string[]; current_version: string } | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [plan, setPlan] = useState<ManuscriptValidationPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const [queue, setQueue] = useState<ValidationRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const [draftLabel, setDraftLabel] = useState<HumanLabel | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ValidationImportResult | null>(null);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importApplied, setImportApplied] = useState(false);

  function refreshMetrics() {
    getExtractorMetrics().then(setMetrics).catch((e) => setMetricsError(e instanceof Error ? e.message : "Couldn't reach the API."));
    getStaleExtractorVersions().then(setStale).catch(() => null);
  }

  function onImportFileChange(f: File | null) {
    setImportFile(f);
    setImportResult(null);
    setImportApplied(false);
  }

  async function runImportDryRun() {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const result = await importValidationCsv(importFile, true, importOverwrite);
      setImportResult(result);
      setImportApplied(false);
    } catch (e) {
      setImportResult({ ok: false, error: e instanceof Error ? e.message : "Couldn't validate this file." });
    } finally {
      setImportBusy(false);
    }
  }

  async function applyImport() {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const result = await importValidationCsv(importFile, false, importOverwrite);
      setImportResult(result);
      setImportApplied(true);
      refreshMetrics();
    } catch (e) {
      setImportResult({ ok: false, error: e instanceof Error ? e.message : "Couldn't apply this import." });
    } finally {
      setImportBusy(false);
    }
  }

  useEffect(() => {
    refreshMetrics();
    getManuscriptValidationPlan()
      .then(setPlan)
      .catch((e) => setPlanError(e instanceof Error ? e.message : "Couldn't reach the API."));
  }, []);

  async function loadQueue() {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const data = await getManuscriptValidationSample();
      setPlan(data.plan);
      setQueue(data.rows);
      setIndex(0);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Couldn't load the validation sample.");
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
      <p className="text-ink/70 leading-relaxed mb-4 max-w-2xl">
        Manual review of Type B extractor decisions. This is the human-labeling step needed before
        precision/recall/F1/Cohen&rsquo;s κ can be treated as a real validation result rather than an untested
        pipeline — see the rater_note below the metrics.
      </p>

      {plan && (
        <div className="border hairline rounded-2xl bg-sage-soft/40 p-5 mb-8 max-w-2xl">
          <p className="font-display text-lg text-ink mb-1">Historical manuscript validation</p>
          <p className="text-sm text-ink/80">
            {plan.per_feature_target} records/feature · {plan.total_target} target reviews · Extractor:{" "}
            <span className="font-mono">{plan.extractor_version}</span> · Snapshot:{" "}
            <span className="font-mono">{plan.snapshot_date}</span>
          </p>
          <p className="text-xs text-muted mt-2">
            This is the only sample used here — drawn from the exact evidence the frozen 100-disease dataset&rsquo;s
            scores are built from, class-balanced ({plan.per_class_target}/{plan.per_class_target} CONFIRMED_PRESENT
            / NOT_CONFIRMED) where both classes have enough eligible rows, gracefully degraded where one is scarce.
            Fixed and deterministic — not reconfigurable from this page.
          </p>
        </div>
      )}

      <ResearchNav />

      {metricsError && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-8">{metricsError}</div>}

      {metrics && (
        <section className="mb-10">
          <h2 className="font-display text-lg text-ink mb-3">Extractor performance</h2>
          {metrics.n === 0 ? (
            <p className="text-sm text-muted">No human labels saved yet — load the sample below and start labeling.</p>
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
            <a href={validationExportUrl()} className="inline-block mt-4 text-sm text-sage-dark hover:underline">
              Export completed validation labels (CSV) &rarr;
            </a>
          )}
        </section>
      )}

      <section className="mb-10">
        <h2 className="font-display text-lg text-ink mb-1">Restore from CSV</h2>
        <p className="text-sm text-muted mb-4 max-w-2xl">
          Import a previously exported validation CSV (matching the export above) — e.g. after losing
          application state before downloading the bundle. Every row is checked against the current frozen
          sample before anything is written; nothing outside these labels is ever touched. Always validates
          first — nothing is saved until you click Apply.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            onClick={runImportDryRun}
            disabled={!importFile || importBusy}
            className="rounded-full border hairline px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-sage-soft/50"
          >
            {importBusy ? "Working…" : "Validate (dry run)"}
          </button>
        </div>

        {importResult && !importResult.ok && (
          <div className="border hairline rounded-xl bg-rose-soft/60 p-4 text-sm text-ink/80 mb-4">
            {importResult.error || "Import failed."}
          </div>
        )}

        {importResult && importResult.ok && importResult.counts && (
          <div className="border hairline rounded-2xl bg-card card-shadow p-5 mb-4">
            <p className="text-sm text-ink/80 mb-3">
              {importResult.rows_in_csv} row(s) in file
              {importApplied ? (
                <span className="text-sage-dark font-medium"> · {importResult.written} written to the database.</span>
              ) : (
                <span> · {importResult.would_write} would be written if applied.</span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {Object.entries(importResult.counts)
                .filter(([, n]) => n > 0)
                .map(([bucket, n]) => (
                  <div key={bucket} className="border hairline rounded-xl p-3 bg-paper">
                    <div className="font-display text-xl text-ink">{n}</div>
                    <div className="text-[11px] text-muted mt-1">{IMPORT_BUCKET_LABELS[bucket] || bucket}</div>
                  </div>
                ))}
            </div>

            {(importResult.counts.malformed > 0 ||
              importResult.counts.unmatched > 0 ||
              importResult.counts.duplicate > 0 ||
              importResult.counts.invalid_label > 0) && (
              <details className="text-xs text-rose mb-3">
                <summary className="cursor-pointer">Rows that will NOT be imported — details</summary>
                <div className="mt-2 space-y-1 max-h-56 overflow-auto">
                  {(["malformed", "unmatched", "duplicate", "invalid_label"] as const).map((bucket) =>
                    (importResult.examples?.[bucket] || []).map((ex, i) => (
                      <p key={`${bucket}-${i}`} className="font-mono">
                        [{bucket}] evidence_id={ex.evidence_id}: {ex.reason}
                      </p>
                    ))
                  )}
                </div>
              </details>
            )}

            {importResult.counts.conflict > 0 && (
              <div className="border hairline rounded-xl bg-gold-soft/50 p-3 mb-3">
                <p className="text-xs text-ink/80 mb-2">
                  {importResult.counts.conflict} row(s) already have a <em>different</em> saved label than this
                  CSV. They will be left untouched unless you check this box:
                </p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={importOverwrite}
                    onChange={(e) => {
                      setImportOverwrite(e.target.checked);
                      setImportResult(null);
                    }}
                  />
                  Overwrite conflicting labels with this CSV&rsquo;s values
                </label>
                {importOverwrite && (
                  <p className="text-[11px] text-muted mt-2">Re-run &ldquo;Validate (dry run)&rdquo; to confirm before applying.</p>
                )}
              </div>
            )}

            {!importApplied && (
              <button
                onClick={applyImport}
                disabled={importBusy || importResult.would_write === 0}
                className="rounded-full bg-sage-dark text-white px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-sage"
              >
                {importBusy ? "Applying…" : `Apply — write ${importResult.would_write} label(s)`}
              </button>
            )}
            {importApplied && <p className="text-sm text-sage-dark font-medium">Applied. Metrics above are up to date.</p>}
            {importResult.audit_copy && (
              <p className="text-[11px] text-muted mt-3">Original upload preserved as an audit artifact on the server.</p>
            )}
          </div>
        )}
      </section>

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
        <h2 className="font-display text-lg text-ink mb-3">Sampling plan</h2>
        {planError && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mb-6">{planError}</div>}
        {plan && (
          <>
            <div className="border hairline rounded-2xl overflow-auto card-shadow bg-card mb-3">
              <table className="w-full text-sm">
                <thead className="bg-paper2/60 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted">Feature</th>
                    <th className="px-3 py-2 font-medium text-muted">Eligible CONFIRMED_PRESENT</th>
                    <th className="px-3 py-2 font-medium text-muted">Eligible NOT_CONFIRMED</th>
                    <th className="px-3 py-2 font-medium text-muted">Sampled CP</th>
                    <th className="px-3 py-2 font-medium text-muted">Sampled NC</th>
                    <th className="px-3 py-2 font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.features.map((f) => (
                    <tr key={f.feature_id} className="border-t hairline align-top">
                      <td className="px-3 py-2 font-mono text-xs">{f.feature_id}</td>
                      <td className="px-3 py-2">{f.eligible_confirmed_present}</td>
                      <td className="px-3 py-2">{f.eligible_not_confirmed}</td>
                      <td className="px-3 py-2">{f.sampled_confirmed_present}</td>
                      <td className="px-3 py-2">{f.sampled_not_confirmed}</td>
                      <td className="px-3 py-2">
                        {f.sampled_total}
                        {f.limitation && <p className="text-[11px] text-gold mt-1 max-w-xs">{f.limitation}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t hairline font-medium">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2" colSpan={3}></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2">{plan.total_proposed}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted mb-6">
              {plan.features.filter((f) => f.limitation).length} of {plan.features.length} features have a scarce
              class — all eligible rows of that class are used, never duplicated or fabricated; the shortfall is
              filled from the other class so every feature still reaches {plan.per_feature_target} total.
            </p>
          </>
        )}

        <button
          onClick={loadQueue}
          disabled={loadingQueue}
          className="rounded-full bg-sage-dark text-white px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-sage"
        >
          {loadingQueue ? "Loading…" : queue ? "Reload sample" : "Start / resume labeling"}
        </button>

        {queueError && <div className="border hairline rounded-xl bg-gold-soft/60 p-4 text-sm text-ink/80 mt-4">{queueError}</div>}
      </section>

      {queue && queue.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-lg text-ink mb-3">Label evidence</h2>

          {current && (
            <div className="border hairline rounded-2xl bg-card card-shadow p-6">
              <div className="flex items-center justify-between mb-4 text-xs text-muted">
                <span>
                  Item {index + 1} of {queue.length} · {unreviewedCount} still need a label
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
                  disabled={index >= queue.length - 1}
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

          <details className="text-sm mt-6">
            <summary className="cursor-pointer text-muted">Jump to an item ({queue.length} in sample)</summary>
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
                    {r.Disease} · {r.feature_id} · {r.status}
                  </span>
                  <span>{r.reviewed ? <span className="text-sage-dark font-mono">{r.human_label}</span> : <span className="text-muted">unlabeled</span>}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

      {queue && queue.length === 0 && <p className="text-sm text-muted">No historical Type B evidence yet — run the manuscript pipeline from the Overview tab.</p>}
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
