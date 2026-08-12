import Link from "next/link";
import { getPipelineConfig } from "@/lib/api";

export const metadata = { title: "Manuscript Pipeline — POROS" };

type Stage = {
  n: number;
  title: string;
  what: string;
  input: string;
  method: string;
  output: string;
  downstream: string;
  links?: { href: string; label: string }[];
};

function stages(cohortSize: string, baseline: string, followup: string): Stage[] {
  return [
    {
      n: 1,
      title: "Cohort / disease set",
      what: "Defines which diseases the manuscript's statistics are about. Every downstream number is relative to this specific set.",
      input: "A list of disease names (currently a fixed, prespecified list).",
      method: `${cohortSize} named rare diseases, hand-selected to span disease categories and translation stages — not sampled or filtered by outcome. Frozen before large-scale data collection, per the project's own scoring protocol.`,
      output: "A resolved disease_id per name, persisted in the diseases table.",
      downstream: "Every reference-cohort percentile, domain score, and TRS in this manuscript is relative to this exact cohort — changing membership changes every disease's score, not just the one added or removed.",
      links: [{ href: "/portfolio", label: "View the current portfolio" }],
    },
    {
      n: 2,
      title: "Feature dictionary / evidence variables",
      what: "Defines exactly what evidence is collected and how it's supposed to be interpreted, before any data is gathered — so the same rule is applied to every disease.",
      input: "None — this is a specification, not a data pull.",
      method: "29 prespecified features across 5 domains, each tagged as either structured (pulled from a public API) or literature-derived (classified from published text), with a fixed description and, for literature-derived features, an explicit matching rule.",
      output: "The FEATURE_SPECS table in code, exported as feature_dictionary.csv in the manuscript bundle.",
      downstream: "Every later stage — retrieval, classification, scoring — operates strictly within this fixed feature set. Adding or changing a feature requires a version bump (see Methodology).",
      links: [{ href: "/methodology", label: "See the full feature dictionary" }],
    },
    {
      n: 3,
      title: "Evidence retrieval",
      what: "Pulls the raw evidence each feature needs, from public sources, for each disease.",
      input: "A resolved disease identity (name + synonyms) and, for historical runs, a cutoff date.",
      method: "Structured features query ClinicalTrials.gov, NIH RePORTER, and openFDA directly. Literature-derived features query Europe PMC/PubMed with a per-feature search string. Historical runs filter every source to what existed by the cutoff date — present-day state is never used to infer a past state.",
      output: "Raw observations and retrieved documents, persisted with source, URL, and retrieval timestamp for every single fetch.",
      downstream: "Feeds extraction/classification (stage 4). The persisted source/URL/timestamp is what makes every later score individually auditable back to its evidence.",
    },
    {
      n: 4,
      title: "Extraction, classification & normalization",
      what: "Turns raw retrieved evidence into a single, comparable value per feature per disease.",
      input: "Raw observations (numbers) and retrieved documents (text) from stage 3.",
      method: "Structured numbers pass through as-is. Literature text is classified by a rules-based matcher: a feature counts as present only if every required phrase group appears near a disease mention in the same passage, with no disqualifying phrase nearby — never an LLM judgment call. Numeric values are then normalized to a cohort-relative empirical percentile; documentary values become a binary confirmed / not-confirmed / unascertained status.",
      output: "One final value + status per (disease, feature), in the feature_values table.",
      downstream: "This is the direct input to domain scoring (stage 5). The classifier's own error rate is checked separately in stage 7 before being trusted here.",
      links: [{ href: "/methodology", label: "See the evidence-type explainer" }],
    },
    {
      n: 5,
      title: "Domain scoring",
      what: "Aggregates individual feature risk into 5 interpretable domain scores.",
      input: "Every ascertained feature's 0–100 risk value from stage 4, grouped by domain.",
      method: "Plain (equal-weight) average of a domain's available feature risks. A domain with zero ascertained features is left unscored, never defaulted to 0.",
      output: "Five domain scores (Biological, Clinical, Regulatory, Economic, Infrastructure), 0–100 each.",
      downstream: "Feeds the composite TRS (stage 6) and is displayed directly on every disease profile page.",
      links: [{ href: "/methodology", label: "Domain definitions" }],
    },
    {
      n: 6,
      title: "Overall Translation Risk Score (TRS)",
      what: "The single headline number: how far a disease is from patient access, relative to the cohort.",
      input: "The five domain scores from stage 5.",
      method: "Equal-weight average of the available domain scores. Higher = more risk, not a quality judgment.",
      output: "One TRS per (disease, snapshot, cohort), persisted with a model_version tag.",
      downstream: "Displayed on every disease/portfolio/compare page; the primary predictor evaluated against real outcomes in stage 7 and used as the basis for counterfactual scenarios in stage 9.",
      links: [{ href: "/diseases", label: "Browse scored diseases" }],
    },
    {
      n: 7,
      title: "Validation & audit logic",
      what: "Checks whether the automated pipeline can actually be trusted — both the classifier's accuracy and TRS's ability to predict real outcomes.",
      input: `Historical snapshots at ${baseline}; real-world progression outcomes observed through ${followup}; a sample of the literature-derived classifier's decisions.`,
      method: "Outcome derivation: did a Phase III trial start (or an FDA label take effect) in the follow-up window? Predictive validation: cross-validated logistic models of TRS (and its components) against that outcome, reporting AUC/Brier/precision/recall. Classifier validation: human review of a random evidence sample, scored against the machine's decision with accuracy/precision/recall/Cohen's κ.",
      output: "AUC and calibration metrics for TRS; Cohen's κ and confusion-matrix stats for the extractor.",
      downstream: "These numbers are what license (or don't) treating TRS as predictive in the manuscript, and what license treating the literature-derived classifier's output as reliable enough to score on.",
      links: [
        { href: "/research/cohort", label: "Predictive validation results (operator view)" },
        { href: "/research/validation", label: "Extractor validation (operator view)" },
      ],
    },
    {
      n: 8,
      title: "Evidence completeness & missingness",
      what: "Reports how much evidence is actually behind a score, separately from the score itself — so a low-risk score can be told apart from a not-enough-evidence score.",
      input: "The ascertainment status of every feature from stage 4.",
      method: "Ascertainment completeness = % of all 29 features with any value at all. Evidence coverage = % of literature-derived features specifically confirmed present. Both computed alongside TRS, never folded into it.",
      output: "Two percentages per (disease, snapshot), displayed next to TRS everywhere it appears.",
      downstream: "A reviewer reading a manuscript table should always read TRS next to these two numbers, not alone.",
    },
    {
      n: 9,
      title: "Counterfactual / CTR analysis",
      what: "Answers \"what would this disease's risk look like if one specific, factual barrier were resolved\" — a model-based scenario, never a causal claim.",
      input: "One disease's current feature values and the cohort's reference distributions.",
      method: "One prespecified, modifiable feature is changed to its favorable value (evidence confirmed present, or the cohort's 75th percentile for a numeric feature), and the identical frozen scoring pipeline is rerun on an in-memory copy. Stored evidence is never mutated.",
      output: "A baseline vs. scenario TRS (and, where a fitted model exists, a predicted-probability delta) per intervention, rankable per disease or across the highest-risk quartile of the cohort.",
      downstream: "Feeds the manuscript's Counterfactual Translation Risk (CTR) results — which single interventions would most reduce risk, and whether that answer is consistent across diseases or idiosyncratic.",
      links: [{ href: "/research/counterfactual", label: "Run counterfactual scenarios (operator view)" }],
    },
    {
      n: 10,
      title: "Manuscript-ready outputs",
      what: "Packages every stage above into the artifacts a manuscript actually cites.",
      input: "The scored cohort dataset, validation/analysis results, and counterfactual results from stages 1–9.",
      method: "Assembled and zipped: the dataset CSV, full analysis JSON, counterfactual and univariate CSVs, a plain-text methods snapshot (auto-generated from the live cohort/version state), the feature dictionary, four figures (domain heatmap, ROC, TRS-vs-evidence-coverage, counterfactual frequency), and a full provenance copy of the evidence database.",
      output: "One downloadable bundle, regenerable at any time from current data.",
      downstream: "This bundle — not a hand-maintained document — is the source for manuscript tables, figures, and methods text.",
      links: [{ href: "/research/export", label: "Download the manuscript bundle (operator view)" }],
    },
  ];
}

export default async function PipelinePage() {
  let cohortSize = "100";
  let baseline = "2015-12-31";
  let followup = "2025-12-31";
  try {
    const c = await getPipelineConfig();
    cohortSize = String(c.default_cohort_size);
    baseline = c.default_baseline_date;
    followup = c.default_followup_end;
  } catch {
    // fall back to defaults above — this page should still read fine offline
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Manuscript pipeline</p>
      <h1 className="font-display text-3xl text-ink mb-4">From disease list to manuscript bundle</h1>
      <p className="text-ink/70 leading-relaxed mb-4 max-w-2xl">
        This walks through every stage of the research pipeline behind POROS&rsquo;s Translation Risk Score,
        in the order data actually flows through it. Each stage answers the same four questions: what it&rsquo;s
        for, what it takes as input, what it does, and what happens to its output downstream.
      </p>
      <p className="text-sm text-muted mb-10 max-w-2xl">
        The interactive tools for running this pipeline live under{" "}
        <Link href="/research" className="text-sage-dark hover:underline">Research</Link> (operator-facing —
        triggers real retrieval and computation). This page is the explanatory walkthrough; see{" "}
        <Link href="/methodology" className="text-sage-dark hover:underline">Methodology</Link> for the exact
        scoring formulas and full feature list.
      </p>

      <ol className="space-y-8">
        {stages(cohortSize, baseline, followup).map((s) => (
          <li key={s.n} className="border hairline rounded-2xl bg-card card-shadow p-6">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display text-2xl text-sage-dark">{String(s.n).padStart(2, "0")}</span>
              <h2 className="font-display text-lg text-ink">{s.title}</h2>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div className="sm:col-span-2">
                <dt className="eyebrow text-muted mb-1">What it&rsquo;s for</dt>
                <dd className="text-ink/85 leading-relaxed">{s.what}</dd>
              </div>
              <div>
                <dt className="eyebrow text-muted mb-1">Input</dt>
                <dd className="text-ink/80 leading-relaxed">{s.input}</dd>
              </div>
              <div>
                <dt className="eyebrow text-muted mb-1">Output</dt>
                <dd className="text-ink/80 leading-relaxed">{s.output}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="eyebrow text-muted mb-1">Method</dt>
                <dd className="text-ink/80 leading-relaxed">{s.method}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="eyebrow text-muted mb-1">Used downstream for</dt>
                <dd className="text-ink/80 leading-relaxed">{s.downstream}</dd>
              </div>
            </dl>
            {s.links && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t hairline pt-3">
                {s.links.map((l) => (
                  <Link key={l.href} href={l.href} className="text-xs text-sage-dark hover:underline">
                    {l.label} &rarr;
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
