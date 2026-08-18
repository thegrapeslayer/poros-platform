const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type RiskBand = "HIGH" | "MODERATE" | "LOW" | "UNSCORED";

export interface DiseaseSummary {
  name: string;
  slug: string;
  disease_id?: string;
  trs: number | null;
  domains?: Record<string, number | null> | null;
  ascertainment_completeness?: number | null;
  evidence_coverage?: number | null;
  risk_band: RiskBand;
  error?: boolean | string;
}

export interface FeatureRow {
  feature_id: string;
  label: string;
  type: "A" | "B";
  value: unknown;
  status: string;
  risk: number | null;
  description: string;
}

export interface ProvenanceRow {
  Variable: string;
  Value: unknown;
  Source: string;
  URL: string;
  SourceDate: string;
  Retrieved: string;
  Query: string;
  Type: "A" | "B";
  DocTitle: string;
  ExtractorVersion: string | null;
}

export interface DiseaseDetail extends DiseaseSummary {
  identity: Record<string, unknown>;
  snapshot: string;
  domain_breakdown: Record<string, FeatureRow[]>;
  primary_barriers: string[];
  provenance: ProvenanceRow[];
}

async function getJSON<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    // Portfolio changes when an admin refresh runs; don't let Next cache stale scores.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function listDiseases() {
  return getJSON<{ snapshot: string; diseases: DiseaseSummary[] }>("/api/diseases");
}

export function getDisease(slug: string) {
  return getJSON<DiseaseDetail>(`/api/disease/${encodeURIComponent(slug)}`);
}

export function compareDiseases(names: string[]) {
  const q = encodeURIComponent(names.join(","));
  return getJSON<{ snapshot: string; diseases: DiseaseSummary[] }>(`/api/compare?names=${q}`);
}

export function getMethodology() {
  return getJSON<{
    app_version: string;
    model_version: string;
    extractor_version: string;
    domains: Record<string, string>;
    features: Record<string, { label: string; domain: string; type: string; modifiable: boolean; scoreable: boolean; description: string }>;
    summary: string;
  }>("/api/methodology");
}

export function getPortfolio() {
  return getJSON<{ diseases: string[]; count: number }>("/api/portfolio");
}

export interface ProvenanceSummary {
  cohort_label: string;
  cohort_id: string;
  cohort_size: number;
  diseases_scored: number;
  app_version: string;
  model_version: string;
  extractor_version: string;
  latest_evidence_retrieved_at: string | null;
  snapshot: string;
  note: string;
}

export function getProvenanceSummary() {
  return getJSON<ProvenanceSummary>("/api/provenance");
}

// ---------------------------------------------------------------------------
// Admin: populate/update the public portfolio's live scores. Needs the
// backend to have outbound internet access to ClinicalTrials.gov, Europe
// PMC, NIH RePORTER, and openFDA. No auth on this endpoint today — see
// docs/CURRENT_STATUS.md.
// ---------------------------------------------------------------------------

export interface AdminRefreshStatus {
  running: boolean;
  done: number;
  total: number;
  errors: { disease: string; error: string }[];
}

export function startAdminRefresh(diseases?: string[]) {
  return getJSON<{ started: boolean; count: number }>("/api/admin/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diseases }),
  });
}

export function getAdminRefreshStatus() {
  return getJSON<AdminRefreshStatus>("/api/admin/refresh/status");
}

// ---------------------------------------------------------------------------
// Research namespace — wraps the manuscript pipeline (historical cohort
// scoring, outcome derivation, predictive analyses, Type B validation/QA,
// counterfactuals, export). Operator-facing, no auth — see README before
// deploying this section publicly.
// ---------------------------------------------------------------------------

export interface PipelineStatus {
  running: boolean;
  step: string;
  done: number;
  total: number;
  errors: unknown[];
  cohort_id: string | null;
  baseline_date: string | null;
  followup_end: string | null;
  analysis_id: string | null;
  bundle_path: string | null;
  finished_at: string | null;
}

export interface PipelineConfig {
  default_baseline_date: string;
  default_followup_end: string;
  default_cohort_size: number;
  default_cohort: string[];
  outcome_definition: string;
}

export function getPipelineConfig() {
  return getJSON<PipelineConfig>("/api/research/pipeline/config");
}

export function getPipelineStatus() {
  return getJSON<PipelineStatus>("/api/research/pipeline/status");
}

export function runPipeline(body: {
  diseases?: string[];
  baseline_date?: string;
  followup_end?: string;
  force_refresh?: boolean;
}) {
  return getJSON<{ started: boolean; count: number }>("/api/research/pipeline/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getResearchDataset() {
  return getJSON<{ cohort_id: string; baseline_date: string; followup_end: string; rows: Record<string, unknown>[]; n: number }>(
    "/api/research/dataset"
  );
}

export interface ModelResult {
  features: string[];
  n?: number;
  error?: string;
  auc?: number;
  auc_ci?: [number, number] | null;
  brier?: number;
}

export interface UnivariateResult {
  predictor: string;
  n: number;
  error?: string;
  odds_ratio?: number;
  ci?: [number, number];
  p_value?: number;
}

export interface AnalysesResult {
  outcome: string;
  n_total: number;
  n_outcomes: number;
  events: number;
  models: Record<string, ModelResult>;
  univariate: UnivariateResult[];
  correlations: Record<string, Record<string, number>>;
}

export function getResearchAnalyses(outcome = "Phase3Outcome") {
  return getJSON<AnalysesResult>(`/api/research/analyses?outcome=${encodeURIComponent(outcome)}`);
}

export interface CounterfactualResult {
  counterfactual_id?: string;
  feature_id: string;
  label?: string;
  eligible: boolean;
  reason?: string;
  observed?: unknown;
  scenario?: unknown;
  baseline_trs: number | null;
  scenario_trs: number | null;
  delta_trs: number | null;
  baseline_probability?: number | null;
  scenario_probability?: number | null;
  delta_probability?: number | null;
  disease?: string;
}

export function getCounterfactual(disease: string, feature: string) {
  return getJSON<CounterfactualResult>(
    `/api/research/counterfactual?disease=${encodeURIComponent(disease)}&feature=${encodeURIComponent(feature)}`
  );
}

export function getCounterfactualRank(disease: string) {
  return getJSON<{ disease: string; rows: CounterfactualResult[] }>(
    `/api/research/counterfactual/rank?disease=${encodeURIComponent(disease)}`
  );
}

export function getCounterfactualCohort(outcome = "Phase3Outcome", topFraction = 0.25) {
  return getJSON<{ rows: (CounterfactualResult & { Disease: string; rank: number })[]; n: number }>(
    `/api/research/counterfactual/cohort?outcome=${encodeURIComponent(outcome)}&top_fraction=${topFraction}`
  );
}

export type HumanLabel = "CONFIRMED_PRESENT" | "NOT_CONFIRMED" | "AMBIGUOUS";

export interface ValidationRow {
  evidence_id: number;
  Disease: string;
  snapshot_date: string;
  feature_id: string;
  feature_label: string;
  feature_description: string;
  status: string;
  confidence: number;
  supporting_snippet: string | null;
  document_id: string | null;
  extractor_version: string | null;
  source_title: string;
  source_url: string;
  pmid: string;
  pmcid: string;
  doi: string;
  reviewed: number;
  human_label: string | null;
  human_note: string | null;
}

export function getValidationSample(n = 75, perFeature?: number) {
  const q = perFeature != null ? `n=${n}&per_feature=${perFeature}` : `n=${n}`;
  return getJSON<{ rows: ValidationRow[]; n: number }>(`/api/research/validation-sample?${q}`);
}

export interface ManuscriptValidationFeaturePlan {
  feature_id: string;
  eligible_confirmed_present: number;
  eligible_not_confirmed: number;
  sampled_confirmed_present: number;
  sampled_not_confirmed: number;
  sampled_total: number;
  limitation: string | null;
}

export interface ManuscriptValidationPlan {
  snapshot_date: string;
  extractor_version: string;
  per_feature_target: number;
  per_class_target: number;
  total_target: number;
  total_proposed: number;
  seed: number;
  features: ManuscriptValidationFeaturePlan[];
}

// The locked manuscript-validation protocol: historical snapshot only, class-balanced
// where feasible, deterministic. This is the ONLY sample /research/validation uses —
// see docs/MANUSCRIPT_REQUIREMENTS.md for why it's a fixed protocol, not a
// general-purpose configurable sampler.
export function getManuscriptValidationPlan() {
  return getJSON<ManuscriptValidationPlan>("/api/research/manuscript-validation-plan");
}

export function getManuscriptValidationSample() {
  return getJSON<{ plan: ManuscriptValidationPlan; rows: ValidationRow[]; n: number }>(
    "/api/research/manuscript-validation-sample"
  );
}

export function saveValidationLabel(evidenceId: number, humanLabel: HumanLabel, note?: string) {
  return getJSON<{ saved: boolean }>(`/api/research/validation-sample/${evidenceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ human_label: humanLabel, note: note || null }),
  });
}

export function validationExportUrl() {
  return `${API_BASE}/api/research/validation-export`;
}

export interface FeatureValidationMetrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  specificity: number | null;
  cohen_kappa: number | null;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}

export interface ExtractorMetrics {
  n: number;
  n_reviewed_total?: number;
  ambiguous_count?: number;
  error?: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  specificity?: number | null;
  cohen_kappa?: number | null;
  tp?: number;
  tn?: number;
  fp?: number;
  fn?: number;
  by_feature?: Record<string, FeatureValidationMetrics>;
  rater_note?: string;
}

export function getExtractorMetrics() {
  return getJSON<ExtractorMetrics>("/api/research/extractor-metrics");
}

export function getStaleExtractorVersions() {
  return getJSON<{ stale_versions: string[]; current_version: string }>("/api/research/extractor-versions/stale");
}

export function wipeStaleExtractorVersions() {
  return getJSON<{ deleted_rows: number; kept_version: string }>("/api/research/extractor-versions/wipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
}

export function getMethodsSnapshot() {
  return getJSON<{ text: string }>("/api/research/methods-snapshot");
}

export function getSmokeTest() {
  return getJSON<Record<string, unknown>>("/api/research/smoke-test");
}

export function exportBundleUrl() {
  return `${API_BASE}/api/research/export`;
}

export { API_BASE };
