"use client";

import { useMemo, useState } from "react";
import { compareDiseases, type DiseaseSummary } from "@/lib/api";
import RiskBadge from "./RiskBadge";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";

const COLORS = ["#54745b", "#b47c44", "#ad6555", "#6684a1"];
const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = { biological: "Biological", clinical: "Clinical", regulatory: "Regulatory", economic: "Economic", infrastructure: "Infrastructure" };

export default function CompareClient({ options }: { options: { name: string; slug: string }[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<DiseaseSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => options.filter((option) => !selected.includes(option.name) && option.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8), [options, query, selected]);
  function toggle(name: string) { setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : current.length < 4 ? [...current, name] : current); setResults([]); }
  async function runCompare() {
    if (!selected.length) return;
    setLoading(true); setError("");
    try { setResults((await compareDiseases(selected)).diseases); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t compare these diseases. Try again."); }
    finally { setLoading(false); }
  }

  const scored = results.filter((result) => !result.error);
  const failed = results.filter((result) => result.error);
  const chartData = DOMAIN_ORDER.map((domain) => {
    const row: Record<string, number | string> = { domain: DOMAIN_LABELS[domain] };
    scored.forEach((result) => { const risk = result.domains?.[domain]; if (risk != null) row[result.name] = risk; });
    return row;
  });

  return <div>
    <section className="rounded-3xl border border-line/70 bg-white/75 p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow text-muted">Build a side-by-side view</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">Choose up to four diseases</h2></div>
        <span className="rounded-full bg-sage-soft px-3 py-1.5 text-xs font-semibold text-sage-dark">{selected.length} / 4 selected</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" aria-live="polite">
        {selected.map((name) => <button key={name} type="button" onClick={() => toggle(name)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-sage/25 bg-sage-soft/75 px-3.5 text-sm font-medium text-sage-dark hover:bg-sage-soft" aria-label={`Remove ${name}`}>
          {name}<span aria-hidden="true" className="text-base leading-none">×</span>
        </button>)}
        {!selected.length && <p className="text-sm text-muted">Selected diseases will appear here.</p>}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label htmlFor="compare-search" className="mb-2 block text-xs font-semibold text-ink/70">Add a disease</label>
          <input id="compare-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a disease name…" className="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-sm outline-none transition-shadow placeholder:text-muted/75 focus:border-sage focus:ring-4 focus:ring-sage/10" />
          <div className="mt-2 flex flex-wrap gap-2" aria-live="polite">
            {matches.map((option) => <button key={option.slug} type="button" onClick={() => { toggle(option.name); setQuery(""); }} disabled={selected.length >= 4} className="min-h-9 rounded-full border border-line bg-white px-3.5 text-xs font-medium text-ink/75 transition-colors hover:border-sage/50 hover:bg-sage-soft/45 disabled:cursor-not-allowed disabled:opacity-45">+ {option.name}</button>)}
            {query && matches.length === 0 && <p className="py-2 text-xs text-muted">No additional matches.</p>}
          </div>
        </div>
        <button type="button" onClick={runCompare} disabled={!selected.length || loading} className="button-dark disabled:cursor-not-allowed disabled:opacity-45">
          {loading ? "Building comparison…" : "Compare selected"}<span aria-hidden="true">→</span>
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">{error}</p>}
    </section>

    {results.length > 0 ? <section className="mt-8">
      <div className="mb-4"><p className="eyebrow text-muted">The evidence picture</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Risk across five domains</h2></div>
      <div className="grid items-stretch gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-3">{results.map((result, index) => <article key={result.slug} className="rounded-2xl border border-line/70 bg-white/75 p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><div><p className="text-sm font-semibold text-ink">{result.name}</p><p className="mt-1 text-xs text-muted">{result.error ? "No score available" : `Translation risk · ${result.trs != null ? result.trs.toFixed(1) : "Not scored"}`}</p></div></div>{!result.error && <RiskBadge band={result.risk_band} />}</div>
          {!result.error && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line/60 pt-3 text-xs text-muted"><span>Evidence coverage</span><span className="text-right font-medium text-ink">{result.evidence_coverage ?? "—"}{result.evidence_coverage != null ? "%" : ""}</span><span>Ascertainment</span><span className="text-right font-medium text-ink">{result.ascertainment_completeness ?? "—"}{result.ascertainment_completeness != null ? "%" : ""}</span></div>}
        </article>)}</div>
        <div className="min-h-[23rem] rounded-3xl border border-line/70 bg-white/80 p-3 sm:p-5">
          {scored.length ? <div className="h-[22rem]" role="img" aria-label="Radar chart comparing domain risk, where higher values indicate more risk">
            <ResponsiveContainer width="100%" height="100%"><RadarChart data={chartData} outerRadius="72%">
              <PolarGrid stroke="#dce2d9" /><PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "#59645a" }} /><PolarRadiusAxis domain={[0,100]} tick={{ fontSize: 9, fill: "#6d7268" }} />
              {scored.map((result, index) => <Radar key={result.slug} name={result.name} dataKey={result.name} stroke={COLORS[results.indexOf(result) % COLORS.length]} fill={COLORS[results.indexOf(result) % COLORS.length]} fillOpacity={.13} connectNulls={false} />)}
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} /><Tooltip />
            </RadarChart></ResponsiveContainer>
          </div> : <div className="flex min-h-[21rem] items-center justify-center px-6 text-center text-sm text-muted">None of these diseases has a score to compare yet. Score profiles from the portfolio and return here.</div>}
          <p className="px-3 pb-2 text-[11px] leading-5 text-muted">0–100 domain risk. Further from the center means more risk; a blank domain means there was not enough evidence to score it.</p>
        </div>
      </div>
      {failed.length > 0 && <p className="mt-4 text-xs text-muted">{failed.length} selected {failed.length === 1 ? "disease could" : "diseases could"} not be resolved or scored and {failed.length === 1 ? "is" : "are"} excluded from the chart.</p>}
    </section> : <div className="mt-6 rounded-2xl border border-dashed border-line px-5 py-7 text-center text-sm text-muted">Choose diseases above to create a side-by-side evidence view.</div>}
  </div>;
}
