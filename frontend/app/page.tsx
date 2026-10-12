import Link from "next/link";
import { listDiseases } from "@/lib/api";
import DiseaseCard from "@/components/DiseaseCard";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let diseases: Awaited<ReturnType<typeof listDiseases>>["diseases"] = [];
  let apiError = false;
  try {
    diseases = (await listDiseases()).diseases;
  } catch {
    apiError = true;
  }

  const scored = diseases.filter((d) => d.trs != null);
  const highRisk = scored.filter((d) => d.risk_band === "HIGH").sort((a, b) => (b.trs ?? 0) - (a.trs ?? 0)).slice(0, 3);
  const counts = {
    HIGH: scored.filter((d) => d.risk_band === "HIGH").length,
    MODERATE: scored.filter((d) => d.risk_band === "MODERATE").length,
    LOW: scored.filter((d) => d.risk_band === "LOW").length,
  };

  return (
    <div className="pb-16">
      {apiError && (
        <div className="mx-auto max-w-7xl px-5 pt-5 sm:px-8">
          <div role="status" className="rounded-2xl border border-gold/30 bg-gold-soft/60 px-5 py-4 text-sm text-ink/80">
            POROS can&rsquo;t reach its data service right now. The interface is ready; check the configured API connection and try again.
          </div>
        </div>
      )}

      <section className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 sm:pt-10">
        <div className="hero-panel overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
          <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_.88fr]">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-medium text-white/80 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#b9d4b8]" />
                RARE DISEASE TRANSLATION INTELLIGENCE
              </div>
              <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.15rem]">
                Make the path from discovery to treatment easier to see.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
                POROS brings public evidence together to show where rare disease translation is moving, where it may be stuck, and what the record can support.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/diseases" className="button-light">
                  Explore the portfolio <span aria-hidden="true">↗</span>
                </Link>
                <Link href="/compare" className="button-glass">Compare diseases</Link>
              </div>
              <div className="mt-10 max-w-xl">
                <label htmlFor="disease-search" className="mb-2 block text-xs font-medium tracking-wide text-white/65">
                  JUMP TO A DISEASE
                </label>
                <SearchBar id="disease-search" diseases={diseases.map((d) => ({ name: d.name, slug: d.slug, trs: d.trs }))} />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[30rem]">
              <div className="absolute -inset-8 rounded-full bg-[#b8c6a2]/10 blur-3xl" />
              <div className="relative rounded-[1.65rem] border border-white/15 bg-[#f7f5ed]/[0.08] p-5 shadow-2xl backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[.16em] text-white/55">Portfolio at a glance</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{diseases.length || "—"}<span className="ml-2 text-sm font-normal text-white/60">diseases</span></p>
                  </div>
                  <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70">{scored.length} scored</span>
                </div>
                <div className="my-6 h-px bg-white/15" />
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Translation risk</p>
                    <p className="mt-1 text-xs text-white/55">Distribution of scored conditions</p>
                  </div>
                  <span className="text-xs text-white/55">0–100</span>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${counts.HIGH} high, ${counts.MODERATE} moderate, and ${counts.LOW} low risk diseases`}>
                  {scored.length > 0 && <>
                    <span className="bg-[#d58a71]" style={{ width: `${counts.HIGH / scored.length * 100}%` }} />
                    <span className="bg-[#d5b478]" style={{ width: `${counts.MODERATE / scored.length * 100}%` }} />
                    <span className="bg-[#a8c7a3]" style={{ width: `${counts.LOW / scored.length * 100}%` }} />
                  </>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <RiskCount label="High" value={counts.HIGH} color="bg-[#d58a71]" />
                  <RiskCount label="Moderate" value={counts.MODERATE} color="bg-[#d5b478]" />
                  <RiskCount label="Low" value={counts.LOW} color="bg-[#a8c7a3]" />
                </div>
                <p className="mt-6 flex items-center gap-2 text-xs text-white/45">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a8c7a3]" />
                  {scored.length ? "Current scored portfolio" : "Scores appear here when the portfolio is scored"}
                </p>
              </div>
              <div className="relative mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] uppercase tracking-[.16em] text-white/40">
                <span>Biology</span><span>Clinical</span><span>Regulatory</span><span>Economics</span><span>Infrastructure</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-10 sm:px-8 sm:pt-14">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Diseases in portfolio" value={diseases.length ? String(diseases.length) : "—"} detail="A focused landscape of rare conditions" />
          <Metric label="Scored snapshots" value={String(scored.length)} detail={scored.length ? "Evidence summarized across five domains" : "No current scores are available yet"} />
          <Metric label="Public evidence sources" value="4" detail="ClinicalTrials.gov · Europe PMC · NIH · FDA" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-sage-dark">A clearer landscape</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Start with the signals that matter.</h2>
          </div>
          <Link href="/diseases" className="text-sm font-medium text-sage-dark hover:underline">View all diseases <span aria-hidden="true">→</span></Link>
        </div>
        {highRisk.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{highRisk.map((d) => <DiseaseCard key={d.slug} d={d} />)}</div>
        ) : (
          <div className="empty-panel flex flex-col items-start gap-4 rounded-3xl p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div>
              <p className="text-lg font-semibold tracking-tight text-ink">Your portfolio view is ready.</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">Once disease snapshots are available, this space highlights the highest-risk profiles and the evidence behind them.</p>
            </div>
            <Link href="/diseases" className="button-dark shrink-0">Browse diseases <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-20">
        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard index="01" title="Find the friction" text="Scan risk across five translation domains, then open a disease profile to see which barriers shape its score." href="/diseases" link="Explore diseases" />
          <FeatureCard index="02" title="See what differs" text="Compare up to four diseases on one scale and spot where development pathways diverge." href="/compare" link="Open comparison" />
          <FeatureCard index="03" title="Follow every signal" text="Trace a score from domain to feature to its public source, with coverage shown alongside risk." href="/methodology" link="How POROS works" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
        <div className="flex flex-col gap-5 rounded-3xl border border-line/70 bg-white/55 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="eyebrow text-muted">Built for transparent exploration</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/75">POROS is an evidence-mapping tool. A missing record means the evidence was not confirmed under the search protocol; it does not prove the underlying activity is absent.</p>
          </div>
          <Link href="/methodology" className="shrink-0 text-sm font-semibold text-sage-dark hover:underline">Understand the score <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
  );
}

function RiskCount({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex items-center gap-2 text-xs text-white/60"><span className={`h-1.5 w-1.5 rounded-full ${color}`} />{label}</div><p className="mt-2 text-xl font-semibold tabular-nums text-white">{value}</p></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-line/70 bg-white/65 p-5 sm:p-6"><p className="text-xs font-medium uppercase tracking-[.13em] text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{value}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div>;
}

function FeatureCard({ index, title, text, href, link }: { index: string; title: string; text: string; href: string; link: string }) {
  return <article className="feature-card rounded-3xl border border-line/70 bg-white/65 p-6 sm:p-7"><p className="text-xs font-medium tracking-[.18em] text-sage-dark">{index}</p><h3 className="mt-7 text-xl font-semibold tracking-tight text-ink">{title}</h3><p className="mt-2 min-h-[3.5rem] text-sm leading-6 text-muted">{text}</p><Link href={href} className="mt-6 inline-flex text-sm font-semibold text-sage-dark hover:underline">{link} <span className="ml-2" aria-hidden="true">→</span></Link></article>;
}
