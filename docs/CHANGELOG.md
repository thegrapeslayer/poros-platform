# Changelog

Human-readable log of meaningful changes to this repository. Not a git log substitute —
`git log` has the full commit history; this file explains **why** changes happened and
what they mean for the site/data/methodology, for someone who won't read every diff.

**Add an entry here after any meaningful change** — see
[CLAUDE.md](../CLAUDE.md#keeping-this-documentation-current). A "meaningful" change is
anything that would confuse a future session if it only showed up in `git log`: scoring
math, feature/rule changes, API contract changes, routing changes, or a doc-worthy bug fix.
Routine formatting/typo fixes don't need an entry.

Format: newest first. `[Type]` one of `Docs`, `Fix`, `Feature`, `Rebrand`, `Data`,
`Methodology`.

---

## 2026-08-18 — [Feature] CSV import/restore for completed validation labels

Added a way to recover human validation labels from a previously exported CSV — e.g.
after losing application state before running the export. New `engine.py` functions
(`import_validation_csv()`, `_frozen_sample_lookup()`) match each CSV row on its own
`evidence_id` against the **current** frozen manuscript validation sample (recomputed
fresh on every call, never cached), classify it into exactly one bucket (`importable`,
`identical`, `conflict`, `duplicate`, `unmatched`, `malformed`, `invalid_label`), and
only write on an explicit second call (`dry_run=false`) — a dry run never touches the
database. A row whose evidence_id already has a *different* saved label is a `conflict`
and is left alone unless `overwrite_conflicts=true` is explicitly passed — nothing is
silently overwritten either way. New endpoint `POST /api/research/validation-import`
(multipart file upload; added `python-multipart` to `requirements.txt`); every upload,
accepted or rejected, is preserved verbatim under
`backend/app/data/exports/validation_imports/` as an audit artifact. `/research/validation`
got a new "Restore from CSV" section: file picker, dry-run report with per-bucket counts
and example rows, an explicit overwrite-conflicts checkbox, and an Apply step.

Also extended `export_manuscript_bundle()` to include `validation_metrics.json` and
`validation_labels.csv` automatically (whatever's been reviewed at export time, possibly
nothing) — purely additive, no existing bundle file changed.

Verified with 14 scripted scenarios against a real exported CSV (not synthetic data):
fresh restore, metrics recompute correctly from the restored labels, idempotent
re-import, conflict detection both blocked and (with the flag) applied, malformed
(feature_id mismatch), unmatched (nonexistent evidence_id), duplicate evidence_id,
invalid label value, and missing required column — all 14 passed. Confirmed the frozen
bundle archive's SHA-256 checksums were unchanged after all of this (regenerating the
live export dir does not touch the archived, dated bundle). Test data and audit-artifact
files from this verification pass were cleaned up afterward; `feature_evidence.reviewed`
was confirmed back at 0 before finishing.

No extraction, scoring, frozen evidence, or cohort logic touched — this only ever writes
to `feature_evidence.reviewed`/`human_label`/`human_note`, via the same
`save_human_validation()` path a normal UI label click already used.

---

## 2026-08-16 — [Methodology] Locked, class-balanced manuscript validation sample

Before any labeling started, audited eligible-example counts per feature and found the
naive stratified sample (20/feature, uniform-random within feature) would have been
badly class-imbalanced for 6 of 17 features — e.g. `patient_organization` and
`expedited_designation_evidence` each have only **2** eligible `CONFIRMED_PRESENT` rows
in the historical snapshot out of 100 eligible total, so a uniform sample would very
likely land ~19 `NOT_CONFIRMED` / ~1 `CONFIRMED_PRESENT`, making that feature's precision
essentially unmeasurable despite "20 reviewed."

Added a new, locked sampling protocol (`manuscript_validation_sample()` /
`manuscript_validation_plan()` in `engine.py`, fixed constants not runtime parameters):
restricted to the **2015-12-31 historical snapshot only** (the exact evidence the frozen
100-disease dataset's TRS scores are built from — previously the sampler pooled that
with the live public-site snapshot), stratified by feature **and** by the extractor's
predicted class, targeting 10/10 `CONFIRMED_PRESENT`/`NOT_CONFIRMED` per feature where
both have ≥10 eligible rows. Where one class is scarce, every eligible row of it is used
(never duplicated or fabricated) and the shortfall is filled from the other class so
every feature still reaches 20 — this happens for 6 features, all with a scarce
`CONFIRMED_PRESENT` class. Total: still 340, unchanged from the original recommendation.

`/research/validation` now uses **only** this locked sample — the free-form "target per
feature" input is gone, replaced with a fixed "Historical manuscript validation" header
(records/feature, total target, extractor version, snapshot date, all read from the
backend so they can't drift from the actual constants) and a "Sampling plan" table
showing the full eligible/proposed breakdown, with limitation notes on scarce features,
before any row is fetched for review. Verified end-to-end in a real browser: plan table
renders with correct numbers, "Start / resume labeling" fetches exactly 340 rows all
from the historical snapshot, per-feature totals match the plan exactly, confirmed
zero rows were accidentally marked reviewed during verification. The general-purpose
`GET /api/research/validation-sample` (configurable, unfiltered by snapshot) still
exists for ad hoc QA but is no longer wired into the page. No extraction, scoring, or
frozen evidence was touched.

---

## 2026-08-16 — [Feature] Freeze manifest + full validation labeling workflow

**Freeze manifest**: generated `FREEZE_MANIFEST.json`/`.md` inside the frozen bundle
directory — exact git commit (`d4d4dbfabcbc908f7ac367163924688b11bd8138`), all
versions/cohort metadata, and a SHA-256 checksum for every one of the bundle's 12 files,
categorized (scores / tables-supplements / figures / metadata-documentation /
archive-raw-and-processed). Nothing was regenerated — every value read from files or
`git log` as they already existed.

**Validation labeling workflow**: `/research/validation` rebuilt as a real
one-item-at-a-time review tool instead of a flat list — shows feature label/definition
(not just the raw `feature_id`), evidence passage, source title/URL/PMID/PMCID/DOI (new `documents`
join in `validation_sample()`), extractor prediction, three label values
(`CONFIRMED_PRESENT`/`NOT_CONFIRMED`/new `AMBIGUOUS`, which is excluded from precision/
recall/F1/κ rather than forced into a binary judgment), an optional note (new
`human_note` column on `feature_evidence`, added via an idempotent `ALTER TABLE` migration
in `init_db()`), Save & Next / Back / Skip, a live progress counter, a jump-to-item list,
and a new `GET /api/research/validation-export` CSV endpoint for the manuscript
supplement. Sampling is stratified and deterministic (fixed seed for a given
`per_feature`), so reloading with the same target resumes at the same rows —
already-labeled ones show their saved label/note, nothing is redrawn or duplicated.
Verified end-to-end in a real browser against a real backend: loaded a queue, saved a
label with a note, confirmed live metrics/CSV export reflected it, confirmed Back showed
it pre-filled for editing, then reset the smoke-test label so it doesn't contaminate a
real review. **No scoring or extraction logic touched** — this is entirely QA-metadata
plumbing on top of the existing frozen dataset, which itself was not modified.

---

## 2026-08-14 — [Data] Froze the historical manuscript dataset; added per-feature validation metrics

Ran `POST /api/research/pipeline/run` for real against the full 100-disease cohort at
the 2015-12-31 baseline — 100/100 diseases scored, 0 errors, extractor `typeB_rules_v3.1`
(current code, not the stale v3.0 the old bundle was under). Installed `matplotlib`
(added to `requirements.txt`; was previously absent, so the bundle's 4 figures had never
actually been generated in this environment) and regenerated the bundle a second time to
include them, reusing already-computed data with no new API calls
(`backend/scripts/regenerate_manuscript_bundle.py`). Archived the complete bundle to
`../Manuscript Bundle/frozen_2026-08-14_typeB_rules_v3.1_n100/` with a README documenting
cohort_id, versions, top-line AUCs (TRS alone 0.822; TRS+EvidenceCoverage 0.837;
five-domain multivariate 0.838), and contents — the old 40-disease/v3.0 bundle is left in
place for history, not deleted. Re-checked the previously-flagged data-quality issues
against this new bundle: `AscertainmentCompleteness`'s zero-variance problem is resolved
(now has real variance and a computable, if wide, CI); the `Regulatory` domain's missing
univariate CI persists; the "undocumented 10-disease counterfactual subset" turned out to
just be the documented top-25%-by-risk default, not an anomaly.

Also added **per-feature** extractor-validation metrics (`extractor_validation_metrics()`
now reports accuracy/precision/recall/F1/specificity/Cohen's κ broken out by `feature_id`,
not just one pooled number) and **stratified** validation sampling
(`validation_sample(per_feature=...)`) so a review pass can actually collect enough
per-feature labels to compute that breakdown. Caught and fixed a real bug while testing:
`groupby(...).apply(...)` was silently dropping the `feature_id` column under this
pandas version's grouping-column-exclusion behavior — replaced with an explicit
per-group sample + `pd.concat`. Verified end-to-end with synthetic labels, then reset
them so they don't contaminate a real review. **No human labeling has been done** — that
still requires the project owner or a qualified reviewer; an AI doing it would defeat the
purpose of an independent second rater.

Generated a submission-ready supplement CSV (`docs/supplement/Table_S1_Variable_Disposition.csv`,
all 46 rows) from `docs/VARIABLE_DISPOSITION.md` so the disposition table isn't only
readable as prose.

A large product-pivot request (ASSESS/DIAGNOSE/ACT/SIMULATE/VALIDATE/SHARE
decision-support layer) arrived immediately after this work and was deliberately
deferred to a planning pass rather than implemented inline — see `CURRENT_STATUS.md`.

---

## 2026-08-12 — [Feature] Search-triggered scoring; live homepage/diseases stats

Selecting an unscored disease from the homepage search bar now scores it automatically
and navigates to its profile once done, instead of landing on the "not yet scored" page
requiring a separate manual step. Extracted the start-refresh-then-poll logic shared by
`ScoreDiseaseButton` and the search bar into `lib/useAdminScore.ts` rather than
duplicating it. Also added `export const dynamic = "force-dynamic"` to the homepage and
`/diseases` so their stats (disease/scored/high-risk counts, "highest risk right now")
always reflect the latest score, never a stale cached render. Verified end-to-end
locally: temporarily un-scored a real disease, searched for it, confirmed the "Scoring…"
state, backend refresh status, and automatic navigation to a fully-populated profile, all
with clean network/console output.

---

## 2026-08-12 — [Methodology] Full variable disposition audit (v2)

Replaced the earlier first-pass `docs/VARIABLE_DISPOSITION.md` draft (which mostly
marked gaps "TBD") with a code-audited reconciliation of all 46 Objective Scoring rubric
variables against the 29 implemented `FEATURE_SPECS`: **24 implemented, 3 merged, 16
excluded, 3 future work, 0 unresolved.** Every rationale ties to a checkable code
capability (which of the 4 integrated APIs could supply it, what the paired-regex Type B
classifier can structurally distinguish, what `as_of_date` historical filtering can
reconstruct) rather than asserting "not implemented" as a bare reason, per the project
owner's explicit requirement that exclusions read as methodological decisions, not
oversights. Key findings: present-day FDA approval status is deliberately unscored to
avoid predictor/outcome leakage against the study's own validation design (traced
directly to the rubric's own Master Index non-negotiable exclusion rule); registry
evidence and consensus-guidance evidence are each specified twice in the rubric (across
two domains, or as two separate constructs) but implemented as a single feature, which
changes how manuscript Methods text should describe domain attribution; and three gaps
(sponsor concentration, industry-academic collaboration, a live-only recruiting-trial
count) already have their underlying raw data retrieved, making them lower-effort future
additions than the other 13 exclusions. No scoring code was changed — this is a
documentation/reconciliation pass only, explicitly required to precede any code changes.
Still needs the project owner's sign-off before being cited in a manuscript methods
section.

## 2026-08-12 — [Data] Postgres migration sequencing decided; not started yet

Project owner created a `poros-db` Postgres instance on Render and provided a full
`SQLAlchemy + psycopg + Alembic` migration plan (centralized `database.py`, DATABASE_URL
env-driven with a SQLite fallback for local dev, a one-time `migrate_sqlite_to_postgres.py`
import script with pre/post row-count validation, and test coverage across every table).
Explicitly sequenced to happen **after** the scientific freeze (this variable-disposition
audit), not before — deferred, not blocked. Nothing in `backend/app/engine.py`'s
persistence layer has changed yet.

---

## 2026-08-12 — [Feature] Tier-1 "real platform" pass: data, provenance, versioning

Response to a 10-item roadmap for treating POROS as a real public research platform,
split into what's tractable to do autonomously now vs. what has a genuine external
blocker (Render/Postgres credentials, or scientific decisions only the project owner can
make). This entry covers what shipped; see `docs/CURRENT_STATUS.md` for the full
shipped-vs-deferred breakdown.

- **`[Data]` Real 100-disease refresh**: `POST /api/admin/refresh` run against this
  machine's actual outbound internet (unlike the sandboxed environment earlier passes ran
  in) — live ClinicalTrials.gov/Europe PMC/NIH RePORTER/openFDA evidence for the full
  cohort, not `seed_demo.py` placeholders. Check `GET /api/provenance` for the live
  scored count at any time.
- **`[Feature]` `GET /api/provenance` + Data Provenance section on `/methodology`**: live
  cohort size, diseases scored, `model_version`, `extractor_version`, and most recent
  evidence retrieval date, computed from the database rather than hand-maintained. Makes
  the live version unambiguous on-site — does **not** resolve what changed between
  extractor v3.0 (the frozen bundle) and v3.1 (live code), which remains an open question
  only the project owner can answer.
- **`[Docs]` `docs/VARIABLE_DISPOSITION.md`**: draft Implemented/Not-implemented table for
  all ~46 Objective Scoring docx variables against the 29 implemented in `FEATURE_SPECS`,
  including one code-verified case (`active_trials_current` is retrieved by
  `fetch_clinical_trials()` but has no `FEATURE_SPECS` entry — silently never scored).
  Everything else marked "TBD — needs your input" rather than guessed; **first draft for
  project-owner review, not a final manuscript decision**.
- **`[Feature]` `CohortBadge.tsx` — "Validated cohort" labeling**: every disease reachable
  today is a `DEFAULT_MANUSCRIPT_COHORT` member by construction, so a "Validated cohort"
  badge now appears on the diseases page and every disease detail page (scored or not —
  membership is prespecified independent of scoring status). An `"exploratory"` variant
  is defined and ready for the day free-text search outside the cohort ships, but unused
  today since that search path doesn't exist yet.
- **`[Feature]` Deeper evidence provenance**: `provenance_table()` in `engine.py` now
  LEFT JOINs literature evidence against `documents` for a real PubMed/PMC link + article
  title per feature (previously just an opaque internal `document_id`), and carries
  `extractor_version` per literature-evidence row. `EvidenceSection.tsx` rewritten so each
  feature expands to its specific source(s) — score → variable → evidence → source in one
  click-through. Reporting-only change (additive `LEFT JOIN`, no scoring math touched), so
  no version bump needed.
- **Explicitly deferred, not started**: Postgres/Supabase migration (needs Render
  dashboard access / a `DATABASE_URL` this session doesn't have — code path is documented
  in root `README.md` and ready to write once you want to proceed) and reconstructing
  *what* changed between extractor v3.0 and v3.1 (needs the project owner's own
  knowledge/notes, not something derivable from the repo as it stands). Tier-2 roadmap
  items (deeper disease-page depth, portfolio analytics/filters/scatterplots/CSV export,
  an explanatory layer on Compare, restoring a public CTR UI, evidence-completeness
  analysis) scoped as follow-up work, not attempted in this pass.

## 2026-08-12 — [Feature] Merge diseases/portfolio, per-disease scoring, risk-scale clarity

Three product changes requested after using the site: two redundant pages doing the same
job, no way to score just one disease without running the full ~100-disease refresh, and
domain risk numbers reading as confusing next to TRS.

- **`[Feature]` Merged `/diseases` and `/portfolio`**: one page (`/diseases`) now has the
  search/band-filter table plus the refresh-all widget. `/portfolio/page.tsx` is now a
  `redirect("/diseases")`. `Nav.tsx` dropped the duplicate "Portfolio" link. Every internal
  `/portfolio` link (`page.tsx`, `pipeline/page.tsx`, `disease/[slug]/page.tsx`) updated to
  point at `/diseases`.
- **`[Feature]` Score one disease at a time**: new `ScoreDiseaseButton.tsx` calls the
  existing `POST /api/admin/refresh` with a one-item `diseases` list (the backend already
  supported this; nothing new needed there) and polls `/api/admin/refresh/status` until
  done, then `router.refresh()`s the page. Wired into `DiseaseTable.tsx` (per unscored row)
  and `disease/[slug]/page.tsx`'s "not yet scored" state (canonical disease name parsed
  from the backend's `"No snapshot for '{name}' yet"` error text, no extra fetch needed).
  Guards against the backend's single shared refresh job slot by checking `running` before
  starting and showing "a refresh is already in progress" instead of a silent failure.
- **`[Feature]` Domain risk now matches TRS's scale and direction**: `DomainBars.tsx` and
  `CompareClient.tsx` used to invert risk into an undocumented "readiness" concept with two
  *different* scales (0–10 vs 0–100) — confusing directly next to the 0–100 TRS headline.
  Both now display risk directly, 0–100, same direction as TRS, with an explicit caption
  on each ("higher = more risk"), and `DomainBars`' bar coloring reuses the same
  HIGH/MODERATE/LOW thresholds as `RiskBadge`. Removes a documented duplication
  (two independently-computed, differently-scaled readiness formulas) noted in
  `ARCHITECTURE.md` from the previous pass.

All three verified end-to-end in a browser against a local backend/frontend: merged page
renders 100 diseases with correct scored/unscored counts, `/portfolio` redirects,
clicking "Score now" on an unscored row fires a real `POST /api/admin/refresh` and shows
"Scoring…" while other rows stay independently clickable, and both the disease-detail page
and the compare radar chart show domain risk on the same 0–100 scale as TRS with the new
captions.

See `docs/ARCHITECTURE.md` ("Diseases/portfolio merge", "Resolved: domain risk now uses
the same scale/direction as TRS everywhere") and `docs/CURRENT_STATUS.md` for detail.

## 2026-08-11 — [Fix] Rebrand, comparison bug, empty-state clarity, plain-language scoring UI

Product fixes following the documentation pass above, verified end-to-end in a browser
against a locally seeded backend (`seed_demo.py`, 3 offline diseases) after installing
backend/frontend dependencies fresh and confirming a clean `npm run build`.

- **`[Fix]` `/api/compare` comparison scores**: `compare_diseases()`'s error path
  (`backend/app/main.py`) now returns a shape-consistent payload instead of one missing
  `trs`/`domains`/`risk_band`; `CompareClient.tsx` checks `r.error` and excludes failed
  diseases from the radar chart instead of silently plotting them as 0. Verified: 3
  scored diseases now render real TRS values and a populated radar chart.
- **`[Fix]` Disease/portfolio/diseases/compare empty & error states**: `disease/[slug]`
  now renders three distinct states (not-in-portfolio 404, in-portfolio-but-unscored,
  transient-error) instead of one generic `notFound()`. Portfolio/diseases/compare pages
  gained an explicit "couldn't reach the API" banner, separate from a legitimately-empty
  list. Root cause of the originally-reported "pages 404 / look broken" was an empty
  `backend/app/data/` (never populated in this checkout) — not fixed by this change, but
  now clearly signaled instead of looking like a bug.
  - Note: `loading.tsx` was added then removed for `disease/[slug]` specifically — Next
    streams a 200 status as soon as a segment has a `loading.tsx`, which prevented a
    later `notFound()` call from setting a real 404 status (verified with a minimal
    repro route). Kept `loading.tsx` for portfolio/diseases/compare, which never 404.
- **`[Rebrand]` RDTI → POROS**: `layout.tsx` metadata + favicon, `Nav.tsx` (new
  `PorosLogo.tsx` SVG component from the provided brand assets), `Footer.tsx`, every page
  `<title>`, `package.json`/`package-lock.json` name, FastAPI app title, and the
  `/api/methodology` summary text. "Rare Disease Translation Initiative" kept as
  descriptive copy where appropriate.
- **`[Fix]` Plain-language scoring UI**: methodology page's per-feature "Type A"/"Type B"
  badges replaced with "Structured data"/"Literature-derived" + hover tooltips; added a
  step-by-step "objective scoring measure" explainer; `DomainBars`/`RiskBadge` gained
  tooltips and plain-language risk-band labels. `/research/*` (operator tooling, not the
  public site) intentionally left using the technical terms.
- **`[Feature]` New `/pipeline` page**: public narrative walkthrough of all 10
  manuscript-pipeline stages (what/input/method/output/downstream-use each), linking to
  the corresponding `/research/*` operator tool.
- **`[Fix]` `.gitignore`**: `backend/data/` never matched the engine's actual runtime path
  (`backend/app/data/`, from `engine.py`'s `ROOT_DIR / "data"`) — corrected. Added
  `.venv/` and `*.log`.

Not changed: `engine.py` (all scoring/retrieval logic untouched), the fixed 100-name
portfolio allowlist (see `CURRENT_STATUS.md` for why), and the `/research/*` operator
section's terminology.

## 2026-08-11 — [Docs] Initial project knowledge system

Created the root `CLAUDE.md` and this `/docs/` set
(`ARCHITECTURE.md`, `SCORING_METHODOLOGY.md`, `FEATURE_DICTIONARY.md`, `DATA_SOURCES.md`,
`MANUSCRIPT_REQUIREMENTS.md`, `CURRENT_STATUS.md`, `CHANGELOG.md`) by reading the full
`engine.py`/`main.py` implementation, every frontend file, the frozen `Manuscript Bundle`,
and the `Objective Scoring` source documents. No functional code was changed in this pass.

Key findings surfaced (see `CURRENT_STATUS.md` for full detail):
- `/api/compare`'s error path returns a payload shape the frontend doesn't guard against,
  breaking the comparison UI for any disease that fails to score.
- This checkout has no populated database (`backend/data/` doesn't exist), which is the
  likely root cause of disease pages / portfolio appearing broken or 404ing — not a
  routing bug so much as an absence of data that the UI doesn't clearly signal.
- The public portfolio is a fixed 100-name allowlist; the backend's free-text resolver can
  handle any disease, but the site has no path today for "resolvable but not in the
  scored portfolio."
- Branding is mid-rebrand: `Footer.tsx` already says "POROS" on one line while the rest of
  the site still says "RDTI."
- The frozen `Manuscript Bundle` was generated under extractor `typeB_rules_v3.0`; the
  live code is `typeB_rules_v3.1`. Flagged as unresolved — not silently reconciled.
- The `Objective Scoring` docx rubric specifies ~46 variables across its five domains;
  only 29 are implemented in `FEATURE_SPECS`. "Type A"/"Type B" terminology appears only
  in the implementation (code, CSV, sqlite), never in the docx methodology set — confirms
  it's safe to replace with plain language in the UI without diverging from manuscript
  vocabulary. `AscertainmentCompleteness` has zero variance in the frozen 40-disease
  dataset, breaking its univariate statistics; `counterfactual_results.csv` covers only
  10 of 40 diseases with no documented selection rule. All flagged in
  `MANUSCRIPT_REQUIREMENTS.md` and `CURRENT_STATUS.md` for the project owner, not
  silently resolved.

## 2026-08-11 — [Data] Synced `website v 4` into `poros-platform` and pushed to `origin/main`

Mirrored the contents of the local `website v 4` working folder into the git-tracked
`poros-platform` clone (frontend moved to the Next.js `app/` router convention, added the
`/research/*` section, updated backend `engine.py`/`main.py`/`seed_demo.py`), committed,
and pushed to `github.com/thegrapeslayer/poros-platform` (`main`, commit `0d6af4c`).

---

*Earlier history (the `Add files via upload` / `Create *.tsx` commits before this log
started) predates this changelog and isn't reconstructed here — see `git log` directly.*
