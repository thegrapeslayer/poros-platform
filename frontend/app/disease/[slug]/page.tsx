import Link from "next/link";
import { notFound } from "next/navigation";
import { getDisease } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";
import DomainBars from "@/components/DomainBars";
import EvidenceSection from "@/components/EvidenceSection";
import ScoreDiseaseButton from "@/components/ScoreDiseaseButton";
import CohortBadge from "@/components/CohortBadge";

type FetchState =
  | { kind: "ok"; disease: Awaited<ReturnType<typeof getDisease>> }
  | { kind: "not-in-portfolio" }
  | { kind: "not-scored"; name: string }
  | { kind: "error" };

async function loadDisease(slug: string): Promise<FetchState> {
  try { return { kind: "ok", disease: await getDisease(slug) }; }
  catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("Unknown disease slug")) return { kind: "not-in-portfolio" };
    if (message.includes("No snapshot")) {
      const match = message.match(/No snapshot for '(.+?)' yet/);
      return { kind: "not-scored", name: match?.[1] ?? slug };
    }
    return { kind: "error" };
  }
}

export default async function DiseaseDetailPage({ params }: { params: { slug: string } }) {
  const state = await loadDisease(params.slug);
  if (state.kind === "not-in-portfolio") notFound();

  if (state.kind === "not-scored") return <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
    <div className="rounded-3xl border border-line/70 bg-white/75 p-7 text-center shadow-sm sm:p-10">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-soft text-2xl text-sage-dark">◌</div>
      <p className="eyebrow text-sage-dark">In the POROS portfolio</p>
      <div className="mt-3 flex justify-center"><CohortBadge status="validated" /></div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{state.name}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">This disease does not have a scored evidence snapshot yet. Start a score for this disease, or update the portfolio to populate more profiles.</p>
      <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <ScoreDiseaseButton name={state.name} label={`Score ${state.name}`} variant="primary" />
        <Link href="/diseases" className="text-sm font-semibold text-sage-dark hover:underline">Browse all diseases →</Link>
      </div>
    </div>
  </div>;

  if (state.kind === "error") return <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
    <div role="alert" className="rounded-3xl border border-gold/30 bg-gold-soft/40 p-8 text-center sm:p-10">
      <p className="eyebrow text-muted">Profile unavailable</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">POROS couldn&rsquo;t load this disease.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">The data service may be temporarily unavailable. Try again in a moment or return to the portfolio.</p>
      <Link href="/diseases" className="mt-6 inline-flex text-sm font-semibold text-sage-dark hover:underline">← Back to diseases</Link>
    </div>
  </div>;

  const disease = state.disease;
  const completeness = disease.ascertainment_completeness;
  const coverage = disease.evidence_coverage;
  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
    <Link href="/diseases" className="inline-flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-sage-dark">← <span>All diseases</span></Link>
    <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-b border-line/70 pb-7">
      <div><p className="eyebrow text-sage-dark">Disease profile</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{disease.name}</h1><div className="mt-3"><CohortBadge status="validated" /></div></div>
      <div className="flex items-center gap-3"><RiskBadge band={disease.risk_band} /><Link href="/compare" className="inline-flex min-h-10 items-center rounded-full border border-line bg-white/65 px-4 text-xs font-semibold text-ink/75 transition-colors hover:bg-sage-soft/55">Compare profile ↗</Link></div>
    </div>

    <section className="mt-7 grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
      <div className="rounded-3xl bg-[#26382c] p-6 text-white sm:p-7">
        <p className="eyebrow text-white/55">Translation risk score</p>
        <div className="mt-4 flex items-end gap-2"><p className="text-6xl font-semibold leading-none tracking-[-.05em] tabular-nums">{disease.trs != null ? disease.trs.toFixed(1) : "—"}</p><span className="pb-1 text-sm text-white/50">/ 100</span></div>
        <p className="mt-3 text-xs leading-5 text-white/60">Higher scores indicate more translation risk in the evidence available for this disease.</p>
        <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/15 pt-5">
          <div><p className="text-[10px] uppercase tracking-[.12em] text-white/50">Evidence coverage</p><p className="mt-1 text-xl font-semibold tabular-nums">{coverage ?? "—"}<span className="ml-1 text-xs font-normal text-white/55">{coverage != null ? "%" : ""}</span></p></div>
          <div><p className="text-[10px] uppercase tracking-[.12em] text-white/50">Ascertained</p><p className="mt-1 text-xl font-semibold tabular-nums">{completeness ?? "—"}<span className="ml-1 text-xs font-normal text-white/55">{completeness != null ? "%" : ""}</span></p></div>
        </div>
      </div>
      <div className="rounded-3xl border border-line/70 bg-white/75 p-6 shadow-sm sm:p-7">
        <div className="mb-5"><p className="eyebrow text-muted">The five domains</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Where translation risk appears</h2></div>
        <DomainBars domains={disease.domains ?? {}} />
      </div>
    </section>

    {disease.primary_barriers?.length > 0 && <section className="mt-10">
      <div className="mb-4"><p className="eyebrow text-muted">Evidence signals</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Potential friction points</h2></div>
      <ul className="grid gap-3 sm:grid-cols-2">{disease.primary_barriers.map((barrier) => <li key={barrier} className="flex items-start gap-3 rounded-2xl border border-rose/15 bg-rose-soft/30 px-4 py-3.5 text-sm leading-6 text-ink/80"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose" />{barrier}</li>)}</ul>
    </section>}

    <section className="mt-12"><div className="mb-5"><p className="eyebrow text-muted">Source trail</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Evidence behind the profile</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Open a domain and feature to follow its score back to source records. Unascertained values remain visible as unknown.</p></div><EvidenceSection breakdown={disease.domain_breakdown} provenance={disease.provenance} /></section>
  </div>;
}
