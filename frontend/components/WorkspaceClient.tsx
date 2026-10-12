"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { DiseaseSummary } from "@/lib/api";
import { csvCell, downloadFile, useWorkspace } from "@/lib/workspace";

const DOMAINS = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
function tone(value: number | null | undefined) { return value == null ? "risk-empty" : value >= 66 ? "risk-high" : value >= 33 ? "risk-medium" : "risk-low"; }

export default function WorkspaceClient({ diseases, snapshot }: { diseases: DiseaseSummary[]; snapshot: string }) {
  const { data, ready, error, toggleSaved } = useWorkspace();
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [sort, setSort] = useState("risk");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => diseases.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()) && (!savedOnly || data.saved.includes(d.slug)) && (!completeOnly || (d.ascertainment_completeness ?? -1) >= 80)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "coverage" ? (b.ascertainment_completeness ?? -1) - (a.ascertainment_completeness ?? -1) : (b.trs ?? -1) - (a.trs ?? -1)), [diseases, data.saved, query, savedOnly, completeOnly, sort]);
  const saved = diseases.filter((d) => data.saved.includes(d.slug));
  const compare = `/compare?diseases=${encodeURIComponent(saved.slice(0, 4).map((d) => d.slug).join(","))}`;
  function exportCSV() {
    const headings = ["Disease", "Slug", "Snapshot", "TRS", "Risk band", ...DOMAINS, "Ascertainment percent", "Evidence coverage percent", "Saved", "Personal notes"];
    const rows = filtered.map((d) => [d.name, d.slug, snapshot, d.trs, d.risk_band, ...DOMAINS.map((domain) => d.domains?.[domain]), d.ascertainment_completeness, d.evidence_coverage, data.saved.includes(d.slug), data.notes[d.slug] ?? ""]);
    downloadFile("poros-evidence-workspace.csv", "\uFEFF" + [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    setMessage(`Exported ${rows.length} visible diseases. Missing values remain blank.`);
  }
  return <div className="mt-8">
    <div className="workspace-banner grid gap-6 rounded-3xl p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
      <div><p className="eyebrow text-sage-dark">Your shortlist</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{ready ? data.saved.length : "—"} saved diseases</h2><p className="mt-2 text-sm leading-6 text-muted">Save a condition below, open its profile, then use the evidence review plan to track follow-up questions.</p><div className="mt-4 flex flex-wrap gap-2">{saved.map((d) => <Link key={d.slug} className="control bg-white" href={`/disease/${d.slug}#review-plan`}>{d.name} ↗</Link>)}{data.saved.filter((slug) => !diseases.some((d) => d.slug === slug)).map((slug) => <Link key={slug} className="control" href={`/disease/${encodeURIComponent(slug)}`}>{slug.replace(/-/g, " ")} · unavailable</Link>)}</div></div>
      <div className="flex flex-col items-start justify-center gap-3">{saved.length > 0 && <Link href={compare} className="button-dark">Compare {Math.min(4, saved.length)} saved diseases →</Link>}<span className="text-xs text-muted">Saved on this browser · no account required</span>{saved.length > 4 && <span className="text-xs text-muted">Comparison opens the first four saved profiles.</span>}</div>
    </div>
    <div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-muted">Portfolio heatmap</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">See where the evidence differs.</h2><p className="mt-2 max-w-2xl text-sm text-muted">Each cell is a backend domain score. Higher values mean greater modeled risk; a dash means unscored.</p></div><button className="control" disabled={!filtered.length || !ready} onClick={exportCSV}>Export visible rows ↓</button></div>
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <label className="min-w-[12rem] flex-1"><span className="sr-only">Find a disease</span><input className="w-full rounded-xl border border-line px-4 py-3 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a disease…" /></label>
      <label className="text-xs text-muted">Sort <select className="ml-2 rounded-xl border border-line bg-white p-3 text-sm text-ink" value={sort} onChange={(e) => setSort(e.target.value)}><option value="risk">Highest risk</option><option value="coverage">Most ascertained</option><option value="name">Disease name</option></select></label>
      <button className={`control ${savedOnly ? "control-selected" : ""}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>Saved only</button>
      <label className="flex min-h-11 items-center gap-2 text-xs text-muted"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={completeOnly} onChange={(e) => setCompleteOnly(e.target.checked)} />≥80% ascertained</label>
    </div>
    <div className="my-4 flex flex-wrap justify-between gap-3 text-xs text-muted"><span aria-live="polite">{filtered.length} diseases · snapshot {snapshot}</span><div className="flex gap-3"><span className="risk-low rounded px-2 py-1">Low &lt;33</span><span className="risk-medium rounded px-2 py-1">Moderate 33–&lt;66</span><span className="risk-high rounded px-2 py-1">High ≥66</span><span className="risk-empty rounded px-2 py-1">— Unscored</span></div></div>
    <div className="overflow-x-auto rounded-3xl border border-line bg-white"><table className="w-full min-w-[850px] text-sm"><caption className="sr-only">Disease risk heatmap. Numbers and labels supplement cell colors.</caption><thead className="bg-paper text-left text-xs text-muted"><tr><th scope="col" className="p-4">Disease</th>{DOMAINS.map((domain) => <th scope="col" key={domain} className="p-3 text-center capitalize">{domain}</th>)}<th scope="col" className="p-3 text-center">TRS</th><th scope="col" className="p-3 text-center">Ascertained</th><th scope="col" className="p-3">Save</th></tr></thead><tbody>{filtered.map((d) => <tr key={d.slug} className="border-t border-line/70"><th scope="row" className="max-w-[16rem] p-4 text-left font-medium"><Link className="hover:text-sage-dark hover:underline" href={`/disease/${d.slug}`}>{d.name}</Link></th>{DOMAINS.map((domain) => <td key={domain} className="p-1.5"><span className={`block rounded-xl py-3 text-center font-mono text-xs ${tone(d.domains?.[domain])}`}>{d.domains?.[domain] != null ? d.domains[domain]!.toFixed(1) : "—"}</span></td>)}<td className="p-3 text-center font-semibold tabular-nums">{d.trs?.toFixed(1) ?? "—"}</td><td className="p-3 text-center text-xs">{d.ascertainment_completeness != null ? `${d.ascertainment_completeness}%` : "—"}</td><td className="p-3"><button className={`control ${data.saved.includes(d.slug) ? "control-selected" : ""}`} disabled={!ready} aria-label={`${data.saved.includes(d.slug) ? "Unsave" : "Save"} ${d.name}`} aria-pressed={data.saved.includes(d.slug)} onClick={() => toggleSaved(d.slug)}>{data.saved.includes(d.slug) ? "✓" : "+"}</button></td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center text-sm text-muted"><p>No diseases match this view.</p><button className="control mt-4" onClick={() => {setQuery("");setSavedOnly(false);setCompleteOnly(false);}}>Reset filters</button></div>}</div>
    <p role="status" className="mt-4 text-sm text-sage-dark">{error || message}</p><p className="mt-5 text-xs leading-6 text-muted">The 80% filter is a browsing aid, not a scientific validity threshold. Scores are comparable within the same reference cohort and snapshot. An unconfirmed record does not prove absence.</p>
  </div>;
}
