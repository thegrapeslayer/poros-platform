import type { FeatureRow, ProvenanceRow } from "@/lib/api";

const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = {
  biological: "Biological tractability",
  clinical: "Clinical development",
  regulatory: "Regulatory pathway",
  economic: "Economic sustainability",
  infrastructure: "Translation infrastructure",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function fmtValue(v: unknown) {
  if (v === null || v === undefined) return "not ascertained";
  if (typeof v === "boolean") return v ? "documented" : "not confirmed";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

function fmtRetrieved(iso: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function EvidenceSection({
  breakdown,
  provenance,
}: {
  breakdown: Record<string, FeatureRow[]>;
  provenance: ProvenanceRow[];
}) {
  const sources = groupProvenanceSummary(provenance);
  const byFeature = groupByFeature(provenance);

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow text-muted mb-1">Domain evidence</p>
        <p className="text-xs text-muted mb-4">
          Expand a domain, then a feature, to see exactly which source(s) that value/status came from — a
          reviewer can go score &rarr; variable &rarr; evidence &rarr; source without leaving this page.
        </p>
        <div className="space-y-3">
          {DOMAIN_ORDER.map((d) => {
            const rows = breakdown[d] || [];
            if (!rows.length) return null;
            return (
              <details key={d} className="border hairline rounded-xl bg-card overflow-hidden group" open={d === "biological"}>
                <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between hover:bg-sage-soft/30 transition-colors">
                  <span className="font-display text-lg text-ink">{DOMAIN_LABELS[d]}</span>
                  <span className="text-xs text-muted eyebrow">{rows.length} features</span>
                </summary>
                <div className="border-t hairline divide-y hairline">
                  {rows.map((r) => {
                    const evidence = byFeature[r.feature_id] || [];
                    return (
                      <details key={r.feature_id} className="group/f">
                        <summary className="cursor-pointer list-none px-5 py-3 flex items-start justify-between gap-4 hover:bg-paper2/50 transition-colors">
                          <div>
                            <p className="text-sm text-ink/90">{r.label}</p>
                            <p className="text-xs text-muted mt-0.5">{r.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-mono text-ink/80">{fmtValue(r.value)}</p>
                            <p className="text-[11px] text-muted">{statusLabel(r.status)}</p>
                            {evidence.length > 0 && (
                              <p className="text-[10px] text-sage-dark mt-0.5 group-open/f:hidden">
                                {evidence.length} source{evidence.length === 1 ? "" : "s"} &darr;
                              </p>
                            )}
                          </div>
                        </summary>
                        <div className="px-5 pb-4 pt-1 bg-paper2/30">
                          {evidence.length ? (
                            <ul className="space-y-2">
                              {evidence.map((e, i) => (
                                <li key={i} className="text-xs border hairline rounded-lg bg-card p-3">
                                  {e.URL ? (
                                    <a
                                      href={e.URL}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sage-dark hover:underline font-medium break-all"
                                    >
                                      {e.Source}
                                    </a>
                                  ) : (
                                    <span className="text-ink/80 font-medium break-all">{e.Source}</span>
                                  )}
                                  {e.DocTitle && <p className="text-muted mt-1 italic">&ldquo;{e.DocTitle}&rdquo;</p>}
                                  <p className="text-muted mt-1 font-mono">
                                    {e.Type === "A" ? "Structured record" : "Literature-derived"}
                                    {fmtRetrieved(e.Retrieved) && ` · retrieved ${fmtRetrieved(e.Retrieved)}`}
                                    {e.ExtractorVersion && ` · extractor ${e.ExtractorVersion}`}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted italic">
                              No stored source for this feature yet (unascertained).
                            </p>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow text-muted mb-4">Evidence sources</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {sources.map((s) => (
            <div key={s.label} className="border hairline rounded-xl bg-card p-4">
              <p className="text-sm text-ink font-medium">{s.label}</p>
              <p className="text-xs text-muted mt-1">{s.summary}</p>
            </div>
          ))}
          {!sources.length && (
            <p className="text-sm text-muted">No raw observations recorded for this snapshot yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByFeature(rows: ProvenanceRow[]): Record<string, ProvenanceRow[]> {
  const out: Record<string, ProvenanceRow[]> = {};
  for (const r of rows) {
    if (!r.Variable || r.Variable.startsWith("search::")) continue; // internal retrieval-protocol rows, not a source
    (out[r.Variable] ??= []).push(r);
  }
  return out;
}

function groupProvenanceSummary(rows: ProvenanceRow[]) {
  const typeA = rows.filter((r) => r.Type === "A");
  const typeB = rows.filter((r) => r.Type === "B");
  const out: { label: string; summary: string }[] = [];
  if (typeA.length) {
    out.push({
      label: "Structured records (ClinicalTrials.gov, NIH RePORTER, openFDA)",
      summary: `${typeA.length} observation${typeA.length === 1 ? "" : "s"} recorded for this snapshot.`,
    });
  }
  if (typeB.length) {
    const confirmed = typeB.filter((r) => String(r.Value).includes("CONFIRMED")).length;
    out.push({
      label: "Literature (Europe PMC / PubMed)",
      summary: `${typeB.length} documentary feature${typeB.length === 1 ? "" : "s"} checked, ${confirmed} confirmed present.`,
    });
  }
  return out;
}
