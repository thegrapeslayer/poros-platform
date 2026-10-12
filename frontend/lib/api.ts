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

export { API_BASE };
