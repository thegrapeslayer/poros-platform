import type { FeatureRow } from "@/lib/api";

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

export default function EvidenceSection({
  breakdown,
  provenance,
}: {
  breakdown: Record<string, FeatureRow[]>;
  provenance: Record<string, unknown>[];
}) {
  const sources = groupProvenance(provenance);

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow text-muted mb-4">Domain evidence</p>
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
                  {rows.map((r) => (
                    <div key={r.feature_id} className="px-5 py-3 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-ink/90">{r.label}</p>
                        <p className="text-xs text-muted mt-0.5">{r.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono text-ink/80">{fmtValue(r.value)}</p>
                        <p className="text-[11px] text-muted">{statusLabel(r.status)}</p>
                      </div>
                    </div>
                  ))}
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

function groupProvenance(rows: Record<string, unknown>[]) {
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
