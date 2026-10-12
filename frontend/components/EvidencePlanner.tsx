"use client";
import { useState } from "react";
import type { DiseaseDetail } from "@/lib/api";
import { downloadFile, useWorkspace } from "@/lib/workspace";

const NEXT: Record<string, string> = {
  biological: "Check disease-specific publications and discuss the mechanism, targets, or model evidence with a domain specialist.",
  clinical: "Check trial records, natural-history studies, registries, and outcome-measure evidence. Ask a disease organization which resources are active.",
  regulatory: "Verify designations and regulatory precedents in primary agency records, including dates and the disease named in each record.",
  economic: "Verify sponsor and grant records, their dates, and whether the funding is specific to this disease.",
  infrastructure: "Contact a disease organization or study team to verify registries, biobanks, collaborations, and published guidance.",
};

export default function EvidencePlanner({ disease }: { disease: DiseaseDetail }) {
  const { data, ready, error, saveNote, toggleReview } = useWorkspace();
  const [message, setMessage] = useState("");
  const latest = disease.provenance.map((p) => p.Retrieved || "").sort().at(-1) ?? "";
  const key = `${disease.slug}:${disease.snapshot}:${latest}`;
  const reviewed = data.reviewed[key] ?? [];
  const gaps = Object.entries(disease.domain_breakdown).flatMap(([domain, rows]) => rows.filter((r) => r.status === "NOT_CONFIRMED" || r.status === "UNASCERTAINED" || r.value == null).map((r) => ({ ...r, domain })));
  const completed = gaps.filter((r) => reviewed.includes(r.feature_id)).length;
  const note = data.notes[disease.slug] ?? "";
  function exportBrief() {
    const brief = {
      title: `${disease.name} — POROS evidence brief`, exported_at: new Date().toISOString(),
      interpretation: "Cohort-relative evidence summary, not a clinical recommendation. Not confirmed does not establish absence. Personal review checks do not validate or change scores.",
      profile: disease, personal_notes: note,
      review_plan: gaps.map((r) => ({ feature_id: r.feature_id, feature: r.label, domain: r.domain, evidence_status: r.status, suggested_review: NEXT[r.domain], personally_reviewed: reviewed.includes(r.feature_id) })),
    };
    downloadFile(`poros-${disease.slug}-brief.json`, JSON.stringify(brief, null, 2), "application/json"); setMessage("Evidence brief exported with source records and your notes.");
  }
  return <section className="mt-10 rounded-3xl border border-line bg-white p-5 sm:p-8" id="review-plan">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-sage-dark">From evidence to follow-up</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Your evidence review plan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Review uncertain records, capture questions, and take an evidence brief into a meeting. Checking a task records your progress; it does not change the source evidence or score.</p></div><span className="rounded-full bg-sage-soft px-3 py-2 text-xs font-semibold text-sage-dark">{completed} / {gaps.length} reviewed</span></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">{gaps.length ? gaps.map((gap) => <details key={gap.feature_id} className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold"><span className="mr-2 text-sage-dark">{reviewed.includes(gap.feature_id) ? "✓" : "○"}</span>{gap.label}<span className="mt-1 block pl-6 text-xs font-normal text-muted">{gap.value == null || gap.status === "UNASCERTAINED" ? "Retrieval unknown — verify availability" : "Not confirmed by search — check the record"}</span></summary>
        <p className="mt-3 text-sm leading-6 text-muted">{NEXT[gap.domain] ?? "Review primary sources and confirm the evidence with a relevant specialist."}</p>
        <p className="mt-2 text-xs leading-5 text-muted">{gap.description}</p>
        <a className="mt-3 inline-block text-xs font-semibold text-sage-dark" href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(disease.name + " " + gap.label)}`} target="_blank" rel="noreferrer">Search published evidence ↗</a>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-paper p-3 text-sm"><input type="checkbox" disabled={!ready} checked={reviewed.includes(gap.feature_id)} onChange={() => toggleReview(key, gap.feature_id)} className="h-4 w-4 accent-blue-600" />I reviewed this question</label>
      </details>) : <p className="rounded-2xl bg-paper p-5 text-sm leading-6 text-muted">No unconfirmed or unascertained features were returned for this snapshot. You can still record questions and export the full evidence brief.</p>}</div>
      <div className="lg:sticky lg:top-24 lg:self-start"><label htmlFor="review-notes" className="text-sm font-semibold">Meeting notes &amp; next questions</label><textarea id="review-notes" disabled={!ready} value={note} onChange={(e) => saveNote(disease.slug, e.target.value)} maxLength={10000} rows={7} placeholder="What needs checking? Who could confirm it? What will you ask at the next meeting?" className="print:hidden mt-3 w-full resize-y rounded-2xl border border-line bg-paper/50 p-4 text-sm leading-6 focus:border-sage" /><p className="hidden whitespace-pre-wrap print:block">{note || "No personal notes."}</p><p className="mt-2 text-xs leading-5 text-muted">Saved on this browser only. Notes and checklist progress are not shared with other devices. Keep patient-identifying information out of this workspace.</p><div className="mt-4 flex flex-wrap gap-2 print:hidden"><button className="button-dark" onClick={exportBrief} disabled={!ready}>Export evidence brief ↓</button><button className="control" onClick={() => window.print()}>Print / save PDF</button></div><p role="status" className="mt-3 text-xs text-sage-dark">{error || message}</p>
      <div className="mt-6 rounded-2xl border border-line p-4"><p className="text-sm font-semibold">Explore current resources</p><div className="mt-3 space-y-3 text-xs font-medium text-sage-dark"><a className="block" href={`https://clinicaltrials.gov/search?cond=${encodeURIComponent(disease.name)}`} target="_blank" rel="noreferrer">ClinicalTrials.gov studies ↗</a><a className="block" href="https://iamrare.org/find-a-study/" target="_blank" rel="noreferrer">NORD patient registries ↗</a></div><p className="mt-3 text-xs leading-5 text-muted">External searches may include unrelated records. These links do not establish eligibility or confirm an evidence gap.</p></div></div>
    </div>
  </section>;
}
