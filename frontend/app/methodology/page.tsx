import { getMethodology, getProvenanceSummary } from "@/lib/api";

export const metadata = { title: "Methodology — POROS" };

const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  biological:
    "Is there a known causal mechanism for this disease, and a plausible way to intervene on it? Covers genetic/molecular cause, therapeutic targets, and disease models.",
  clinical:
    "Is the disease actually being studied in trials, with the tools trials need? Covers trial activity, natural-history evidence, registries, and validated outcome measures.",
  regulatory:
    "Has the regulatory system already engaged with this disease? Covers orphan/expedited designations and surrogate-endpoint precedent.",
  economic:
    "Is there funding and sponsor interest behind development? Covers trial sponsorship and NIH funding.",
  infrastructure:
    "Do the non-trial support structures exist? Covers patient organizations, biobanks, consortia, and consensus clinical guidance.",
};

const EVIDENCE_TYPE_COPY: Record<"A" | "B", { label: string; short: string; detail: string }> = {
  A: {
    label: "Structured data",
    short: "From a public database, as a number",
    detail:
      "Pulled directly from a public API (ClinicalTrials.gov, NIH RePORTER, openFDA) as a count, amount, or phase — no judgment call involved.",
  },
  B: {
    label: "Literature-derived",
    short: "Classified from published text",
    detail:
      "Retrieved from Europe PMC/PubMed and classified by a rules-based text matcher: a feature counts as present only if a required combination of phrases appears near a mention of the disease, with no disqualifying phrase nearby. “Not confirmed” means the search found nothing that qualified — never proof the underlying fact doesn't exist.",
  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "no evidence retrieved yet";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default async function MethodologyPage() {
  let m;
  let prov;
  try {
    m = await getMethodology();
  } catch {
    m = null;
  }
  try {
    prov = await getProvenanceSummary();
  } catch {
    prov = null;
  }

  if (!m) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-muted">Couldn&rsquo;t reach the POROS API. Start the backend to load methodology details.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Methodology</p>
      <h1 className="font-display text-3xl text-ink mb-6">How the Translation Risk Score is built</h1>
      <p className="text-ink/80 leading-relaxed mb-10">{m.summary}</p>

      <div className="border-l-2 border-sage/40 pl-6 mb-12">
        <p className="text-xs font-mono text-muted">
          engine {m.app_version} · model {m.model_version} · extractor {m.extractor_version}
        </p>
      </div>

      {/* Data provenance / versioning */}
      <section className="mb-14 border hairline rounded-2xl bg-card card-shadow p-6">
        <h2 className="font-display text-lg text-ink mb-1">Data provenance</h2>
        <p className="text-xs text-muted mb-5">
          What produced the scores you&rsquo;re looking at right now, and when.
        </p>
        {prov ? (
          <>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-muted text-xs">Cohort</dt>
                <dd className="text-ink/90">{prov.cohort_label}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Cohort size / scored</dt>
                <dd className="text-ink/90 font-mono">
                  {prov.diseases_scored} / {prov.cohort_size}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Scoring model</dt>
                <dd className="text-ink/90 font-mono">{prov.model_version}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Extractor</dt>
                <dd className="text-ink/90 font-mono">{prov.extractor_version}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Latest evidence retrieved</dt>
                <dd className="text-ink/90">{fmtDate(prov.latest_evidence_retrieved_at)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Cohort ID</dt>
                <dd className="text-ink/90 font-mono text-xs break-all">{prov.cohort_id}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted mt-5 leading-relaxed border-t hairline pt-4">{prov.note}</p>
          </>
        ) : (
          <p className="text-sm text-muted">Couldn&rsquo;t reach the provenance endpoint.</p>
        )}
      </section>

      {/* Objective scoring measure explainer */}
      <section className="mb-14 space-y-6">
        <h2 className="font-display text-xl text-ink">The objective scoring measure, step by step</h2>

        <div className="border hairline rounded-2xl bg-card card-shadow p-6">
          <p className="eyebrow text-sage-dark mb-2">1. Inputs</p>
          <p className="text-sm text-ink/80 leading-relaxed">
            29 prespecified features per disease, each one of two evidence types — see the two cards below.
            Every feature belongs to exactly one of the five domains.
          </p>
        </div>

        <div className="border hairline rounded-2xl bg-card card-shadow p-6">
          <p className="eyebrow text-sage-dark mb-2">2. Normalization</p>
          <p className="text-sm text-ink/80 leading-relaxed mb-2">
            Structured numeric features are converted to a <strong>cohort-relative percentile</strong>{" "}
            — how this disease&rsquo;s raw count compares to every other disease currently in the portfolio —
            not a fixed threshold. That means the same raw number (e.g. 5 trials) can score differently
            depending on which other diseases are being compared against.
          </p>
          <p className="text-sm text-ink/80 leading-relaxed">
            Literature-derived features are binary: evidence confirmed present scores as low risk,
            not confirmed under the search protocol scores as high risk, and a failed retrieval is excluded
            from scoring entirely rather than counted as a negative.
          </p>
        </div>

        <div className="border hairline rounded-2xl bg-card card-shadow p-6">
          <p className="eyebrow text-sage-dark mb-2">3. Domain scores</p>
          <p className="text-sm text-ink/80 leading-relaxed">
            Each of the 5 domains below is the plain average of its own features&rsquo; risk values (0 = lowest
            risk, 100 = highest). A domain with no ascertained features is left unscored rather than
            defaulted to 0 &mdash; missing evidence is never treated as good news.
          </p>
        </div>

        <div className="border hairline rounded-2xl bg-card card-shadow p-6">
          <p className="eyebrow text-sage-dark mb-2">4. Translation Risk Score (TRS)</p>
          <p className="text-sm text-ink/80 leading-relaxed">
            The equal-weight average of the available domain scores, 0&ndash;100. Higher TRS means{" "}
            <strong>more</strong> translation risk &mdash; further from patient access &mdash; not a
            &ldquo;quality&rdquo; score. Two coverage metrics are reported alongside it, never folded into it:
            <strong> ascertainment completeness</strong> (% of all features with any value) and{" "}
            <strong>evidence coverage</strong> (% of literature-derived features confirmed present) &mdash; so a
            reviewer can tell &ldquo;low risk&rdquo; apart from &ldquo;we don&rsquo;t have enough evidence to
            say.&rdquo;
          </p>
        </div>

        <div className="border hairline rounded-2xl bg-card card-shadow p-6">
          <p className="eyebrow text-sage-dark mb-2">5. Risk band (display only)</p>
          <p className="text-sm text-ink/80 leading-relaxed">
            For quick scanning, TRS is bucketed into <strong>Low</strong> (TRS below 33),{" "}
            <strong>Moderate</strong> (33&ndash;65), <strong>High</strong> (66 and above), or{" "}
            <strong>Unscored</strong> (no TRS available yet). This banding is a presentation convenience, not
            part of the underlying score.
          </p>
        </div>
      </section>

      {/* Evidence type legend */}
      <section className="mb-14">
        <h2 className="font-display text-xl text-ink mb-4">The two evidence types</h2>
        <p className="text-sm text-muted mb-4">
          Every feature below is tagged with one of these. This is about <em>where the evidence came from</em>,
          not which of the five domains it belongs to.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {(["A", "B"] as const).map((t) => (
            <div key={t} className="border hairline rounded-xl bg-card p-4">
              <p className="text-sm font-medium text-ink">{EVIDENCE_TYPE_COPY[t].label}</p>
              <p className="text-xs text-muted mt-1">{EVIDENCE_TYPE_COPY[t].short}</p>
              <p className="text-xs text-ink/70 mt-2 leading-relaxed">{EVIDENCE_TYPE_COPY[t].detail}</p>
            </div>
          ))}
        </div>
      </section>

      <h2 className="font-display text-xl text-ink mb-4">Domains and features</h2>
      <div className="space-y-10">
        {DOMAIN_ORDER.map((d) => {
          const features = Object.entries(m.features).filter(([, f]) => f.domain === d);
          return (
            <div key={d}>
              <h3 className="font-display text-lg text-sage-dark mb-1">{m.domains[d]}</h3>
              {DOMAIN_DESCRIPTIONS[d] && (
                <p className="text-xs text-muted mb-3 leading-relaxed max-w-xl">{DOMAIN_DESCRIPTIONS[d]}</p>
              )}
              <ul className="space-y-2">
                {features.map(([fid, f]) => {
                  const evType = f.type === "A" || f.type === "B" ? EVIDENCE_TYPE_COPY[f.type] : null;
                  return (
                    <li key={fid} className="text-sm border-b hairline pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink/90">{f.label}</span>
                        {evType && (
                          <span
                            title={evType.detail}
                            className="text-[11px] font-mono text-muted border hairline rounded-full px-2 py-0.5 cursor-help whitespace-nowrap"
                          >
                            {evType.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{f.description}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-14 border hairline rounded-2xl bg-sage-soft/40 p-6">
        <p className="text-sm text-ink/80 leading-relaxed">
          Looking for how the full research pipeline &mdash; cohort selection, evidence retrieval, validation,
          and manuscript export &mdash; fits together?{" "}
          <a href="/pipeline" className="text-sage-dark hover:underline font-medium">
            See the manuscript pipeline walkthrough &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
