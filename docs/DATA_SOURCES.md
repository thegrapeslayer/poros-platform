# Data Sources

Status: **implemented and working** for retrieval logic; **no live data in this local
checkout** — see [CURRENT_STATUS.md](CURRENT_STATUS.md) for what that means in practice.

## Live external APIs

All four are called directly from `backend/app/engine.py` via a shared `requests.Session`
with retry/backoff (`make_session()`, `engine.py:690-704`). No API keys are required for
any of them in the current implementation.

| Source | Used for | Called from | Notes |
|---|---|---|---|
| **ClinicalTrials.gov API v2** (`clinicaltrials.gov/api/v2/studies`) | `trial_count`, `completed_by_snapshot`, `highest_phase_by_snapshot`, `median_enrollment`, `unique_trial_sites`, `unique_sponsors`, `industry_sponsors`, `industry_trials`, plus a text scan of trial outcome measures that can upgrade `biomarker_in_trial` | `_ctg_fetch_all()` / `fetch_clinical_trials()`, `engine.py:891-1015` | Paginated, up to 1000 records/disease. Historical snapshots filter to trials that both started and were first-posted by the cutoff date. |
| **Europe PMC REST API** (`www.ebi.ac.uk/europepmc/webservices/rest/search`) | All 15 Type B documentary features | `europe_pmc_search()`, `engine.py:1023-1081` | Also persists every retrieved document to the `documents` table for provenance/re-review. Historical snapshots add a `FIRST_PDATE` upper bound. |
| **NIH RePORTER API v2** (`api.reporter.nih.gov/v2/projects/search`) | `nih_funded_projects`, `nih_funding_total`, `nih_funding_institutions` | `fetch_nih_funding()`, `engine.py:1232-1274` | 5-fiscal-year rolling window ending at the snapshot year. |
| **openFDA drug labels** (`api.fda.gov/drug/label.json`) | `fda_label_signal` (display-only, not scored — see [FEATURE_DICTIONARY.md](FEATURE_DICTIONARY.md)); also the supplementary approval signal in outcome derivation | `fetch_fda_label_signal()`, `engine.py:1277-1308` | Current-day only — never fetched for historical (`as_of_date`) snapshots. |
| **NCBI PubMed E-utilities** (`eutils.ncbi.nlm.nih.gov`) | `pubmed_count` (raw observation only — not a `FEATURE_SPECS` entry, not scored) | `fetch_pubmed_count()`, `engine.py:1211-1229` | Context/display metric, separate from the Europe PMC-driven Type B classification pipeline. |

**Network dependency**: this sandbox/dev environment has no outbound internet access to
any of the above, which is why the local repo has no populated `backend/app/data/` directory
(see next section). In a normal hosting environment (Render/Railway/Fly for the backend)
these calls work as written — confirmed by the presence of real historical evidence in
`../Manuscript Bundle/`, which was generated in an environment with live access.

## Persistence: SQLite

`SCHEMA` (`engine.py:482-638`) defines eight tables, created on import via `init_db()`
(`engine.py:2292`) at `backend/app/data/evidence/rdti_evidence_v3.sqlite` (created fresh
on first run, gitignored — `.gitignore` previously pointed at the wrong path,
`backend/data/`, which never matched the engine's actual `ROOT_DIR / "data"` path,
`backend/app/data/`; corrected during this audit).

| Table | Holds |
|---|---|
| `diseases` | Resolved disease identity (canonical name, query text, synonyms/genes if a synonym map is configured) |
| `raw_observations` | Every Type A value ever fetched, with source/URL/date/query provenance — append-only, one row per fetch |
| `documents` | Every Europe PMC document retrieved during Type B search, for re-review |
| `feature_evidence` | Every Type B classification decision: status, confidence, matched snippet, extractor version, human review label if any |
| `feature_values` | The current aggregated value per (disease, snapshot, feature) — what scoring actually reads |
| `reference_stats` | Cached cohort reference distributions per (cohort_id, snapshot, feature), used by `empirical_risk()` |
| `scores` | Computed domain/TRS scores per (disease, snapshot, cohort, model_version) |
| `outcomes` | Derived Phase III / label / composite outcome flags per (disease, index_date, followup_end) |
| `counterfactual_runs` | Every counterfactual scenario ever computed, for audit |
| `analysis_runs` | Every manuscript-pipeline analysis run (settings + full results JSON) |

Nothing here is ever overwritten in place except `feature_values` (an explicit
last-writer-wins aggregate) — `raw_observations`, `feature_evidence`, and
`counterfactual_runs` are append-only logs, which is what makes provenance auditing
possible (see [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md)).

Moving off SQLite (e.g. to Postgres/Supabase) only requires rewriting `db_conn()`,
`init_db()`, and the `sqlite3`-specific `INSERT ... ON CONFLICT` calls — every function
upstream of persistence (resolver, retrieval, scoring, provenance, research endpoints) is
storage-agnostic. See the root `README.md` "Moving to Postgres" section.

## Offline demo data

`backend/seed_demo.py` seeds three diseases (Visceral Myopathy, Spinal Muscular Atrophy,
Canavan Disease) with hand-entered representative numbers, entirely offline — no network
calls. It exists specifically so the API/frontend can be exercised without live access to
the four APIs above. **Delete it once real retrieval is confirmed working in a hosted
environment** (its own docstring says so) — do not treat its numbers as real evidence.

## Frozen manuscript provenance snapshot

`../Manuscript Bundle/provenance/rdti_evidence_v3.sqlite` (one directory above this repo)
is a point-in-time copy of the evidence database from a prior pipeline run that *did* have
live network access — this is the one place in the repo with real retrieved evidence, not
placeholder/demo data. It reflects `typeB_rules_v3.0`, one extractor version behind the
current code — see [CURRENT_STATUS.md](CURRENT_STATUS.md) for why that matters and hasn't
been reconciled. Treat this file as a historical artifact to consult, not something to
copy into `backend/app/data/` and build on directly.
