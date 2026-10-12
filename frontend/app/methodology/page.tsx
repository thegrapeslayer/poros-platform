import Link from "next/link";
import { getMethodology } from "@/lib/api";

export const metadata = { title: "How POROS works" };

const ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const LABELS: Record<string, string> = {
  biological: "Biological tractability",
  clinical: "Clinical development",
  regulatory: "Regulatory pathway",
  economic: "Economic sustainability",
  infrastructure: "Translation infrastructure",
};
const EXPLAIN: Record<string, string> = {
  biological: "Evidence for a defined mechanism, therapeutic targets, and models that support intervention.",
  clinical: "Trial activity and the natural-history, registry, and outcome-measure tools trials depend on.",
  regulatory: "Regulatory engagement such as orphan designations and relevant approval precedents.",
  economic: "Funding and sponsor activity that can sustain development.",
  infrastructure: "Patient organizations, biobanks, consortia, and clinical guidance that support translation.",
};

export default async function MethodologyPage() {
  let methodology: Awaited<ReturnType<typeof getMethodology>> | null = null;
  try { methodology = await getMethodology(); } catch { /* Explain the scoring model even when the API is offline. */ }
  const domains = methodology?.domains ?? {};
  const features = methodology?.features ?? {};

  return <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <div className="max-w-3xl">
      <p className="eyebrow text-sage-dark">Clear by design</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How POROS works</h1>
      <p className="mt-4 text-base leading-7 text-muted">POROS organizes public evidence about the conditions that shape rare disease translation. Every score can be read alongside its coverage and traced back to source records.</p>
    </div>

    <div className="mt-9 grid gap-4 md:grid-cols-3">
      <SummaryCard number="01" title="Collect evidence" text="Structured records and published literature are gathered from public sources for each disease." />
      <SummaryCard number="02" title="Assess five domains" text="Evidence is grouped into five parts of the translation environment, with each feature interpreted consistently." />
      <SummaryCard number="03" title="Show risk with context" text="The overall score summarizes available domain scores. Completeness and evidence coverage stay visible beside it." />
    </div>

    <section className="mt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow text-muted">The framework</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Five connected domains</h2></div>
        <p className="text-xs text-muted">{Object.keys(features).length ? `${Object.keys(features).length} defined features` : "Evidence organized consistently"}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((domain, index) => {
          const items = Object.entries(features).filter(([, feature]) => feature.domain === domain);
          return <article key={domain} className="rounded-2xl border border-line/70 bg-white/70 p-5">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold tracking-[.14em] text-sage-dark">0{index + 1}</span><span className="h-2 w-2 rounded-full bg-sage" /></div>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{domains[domain] ?? LABELS[domain]}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{EXPLAIN[domain]}</p>
            {items.length > 0 && <details className="mt-4 border-t border-line/70 pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-sage-dark">View {items.length} features</summary>
              <ul className="mt-3 space-y-2">{items.map(([id, feature]) => <li key={id} className="text-xs leading-5 text-ink/75"><strong className="font-medium text-ink">{feature.label}</strong><span className="block text-muted">{feature.description}</span></li>)}</ul>
            </details>}
          </article>;
        })}
      </div>
    </section>

    <section className="mt-14 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
      <div className="rounded-3xl bg-[#26382c] p-6 text-white sm:p-8">
        <p className="eyebrow text-white/55">Reading a score</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Higher means more translation risk.</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">The Translation Risk Score is on a 0–100 scale. It is an evidence summary relative to the POROS cohort, not a measure of disease severity, research quality, or clinical prognosis.</p>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <Band label="Low" range="0–32" tone="bg-[#a8c7a3]" />
          <Band label="Moderate" range="33–65" tone="bg-[#d5b478]" />
          <Band label="High" range="66–100" tone="bg-[#d58a71]" />
        </div>
      </div>
      <div className="rounded-3xl border border-line/70 bg-white/70 p-6 sm:p-8">
        <p className="eyebrow text-muted">Evidence with its limits</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Absence of evidence is not evidence of absence.</h2>
        <div className="mt-5 space-y-4 text-sm leading-6 text-ink/75">
          <p><strong className="text-ink">Structured data</strong> comes from public databases as counts, dates, amounts, or phases.</p>
          <p><strong className="text-ink">Literature-derived evidence</strong> is identified using a consistent text-matching protocol over published records.</p>
          <p>When retrieval fails or evidence cannot be ascertained, the feature stays unscored. Missing information is not converted into a favorable or unfavorable signal.</p>
        </div>
        {methodology && <p className="mt-5 border-t border-line/70 pt-4 text-xs text-muted">Model {methodology.model_version} · Extractor {methodology.extractor_version}</p>}
      </div>
    </section>

    <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line/70 bg-white/55 p-5 sm:px-6">
      <p className="text-sm text-ink/75">Ready to see the framework applied to actual disease records?</p>
      <div className="flex gap-4 text-sm font-semibold text-sage-dark"><Link href="/diseases" className="hover:underline">Explore diseases →</Link><Link href="/compare" className="hover:underline">Compare →</Link></div>
    </div>
  </div>;
}

function SummaryCard({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="rounded-2xl border border-line/70 bg-white/70 p-5"><p className="text-xs font-semibold tracking-[.14em] text-sage-dark">{number}</p><h2 className="mt-4 text-base font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{text}</p></article>;
}

function Band({ label, range, tone }: { label: string; range: string; tone: string }) {
  return <div className="rounded-xl bg-white/10 px-2 py-3"><span className={`mx-auto block h-1 w-6 rounded-full ${tone}`} /><p className="mt-2 text-xs font-medium">{label}</p><p className="mt-1 text-[10px] text-white/55">{range}</p></div>;
}
