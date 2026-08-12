# Current Status

Last updated: 2026-08-12, by a Claude Code "Tier 1" pass addressing what's needed before
POROS is treated as a real public research platform: a real 100-disease data refresh
(run against this machine's actual outbound internet, not a sandbox), a Data Provenance
section surfacing live cohort/version/retrieval-date state, a draft variable disposition
table (docx rubric vs. implemented features), Validated Cohort status labeling, and
per-feature evidence provenance (source links, retrieval dates, extractor version) on
disease pages. **Postgres migration and the extractor v3.0→v3.1 "what changed" question
are explicitly deferred** — the former needs Render account access, the latter needs the
project owner's own knowledge; see "Planned / not implemented" and "Unresolved" below.
Builds on two earlier passes: an initial audit/documentation pass, then a product-fix pass
(comparison bug, empty-state clarity, RDTI→POROS rebrand, "Type A"/"Type B" jargon,
manuscript pipeline explainer, diseases/portfolio merge, per-disease scoring, risk-scale
clarity) — see [CHANGELOG.md](CHANGELOG.md) for the full list across all passes.

**Update this file after any meaningful change** — see
[CLAUDE.md](../CLAUDE.md#keeping-this-documentation-current). Stale status docs are worse
than no status docs.

## Implemented and working

- Full scoring engine (`engine.py`): resolver, Type A/B retrieval, classification,
  cohort-normalized scoring, TRS composite, historical snapshots, counterfactuals,
  outcome derivation, manuscript analyses, bundle export. Verified by reading the
  complete implementation — see [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md).
- Full FastAPI surface (`main.py`) wrapping all of the above, public + research
  namespaces. See [ARCHITECTURE.md](ARCHITECTURE.md).
- Frontend routing/data-flow architecture is sound: server components fetch via a single
  typed client (`lib/api.ts`), disease slugs are generated and reversed entirely
  server-side so there's no frontend/backend slug drift, `disease/[slug]/page.tsx`
  already handles a missing/failed lookup gracefully via `notFound()`.
- `/research/*` operator section: pipeline run/status, dataset + predictive stats,
  validation/QA with Cohen's κ, single/ranked/cohort-wide counterfactuals, bundle export
  — all fully wired to real backend endpoints, not mocked.
- A real prior manuscript pipeline run exists and is committed: `../Manuscript Bundle/`
  (40 diseases, real evidence, real figures) — proof the pipeline works end-to-end given
  network access, even though this specific sandbox can't demonstrate that live.
- **`/api/compare` scores render correctly** — fixed. `compare_diseases()`'s error path
  now returns a shape-consistent payload (`trs: null, domains: null, risk_band:
  "UNSCORED", error: "..."`); `CompareClient.tsx` checks `r.error` and renders a
  "couldn't be scored" state instead of feeding `undefined`/`0` into the radar chart and
  risk badge. Verified in a browser: comparing 3 scored diseases shows real TRS values,
  labeled risk badges, and a populated radar chart.
- **Disease/portfolio/diseases/compare pages distinguish real states** — fixed. A
  disease can now render one of four distinct states: scored profile, "in the portfolio
  but not yet scored" (own page, not a 404), "not in the portfolio at all" (a true 404
  via a branded `not-found.tsx`), or "couldn't reach the API" (transient-error copy).
  Portfolio/diseases/compare pages show an explicit "couldn't reach the API" banner
  separate from a legitimately-empty list. `loading.tsx` added for portfolio/diseases/
  compare; deliberately **not** added for `disease/[slug]` — Next.js streams a 200
  response as soon as a route segment has a `loading.tsx`, which locks in a 200 status
  before a later `notFound()` call can change it, so a `disease/[slug]/loading.tsx`
  silently broke the not-in-portfolio page's real HTTP status (verified: 200 with it
  present, correct 404 without it). This was **not fixed by populating data** — the
  underlying empty-`backend/app/data/` cause described below is unchanged and still needs a
  real `/api/admin/refresh` run (or `seed_demo.py`) to have content to show; see
  [ARCHITECTURE.md](ARCHITECTURE.md#resolved-apicompare-error-path-was-breaking-the-comparison-ui).
- **RDTI → POROS rebrand** — done across `layout.tsx` metadata/favicon, `Nav.tsx`
  (now a `PorosLogo` SVG component from `poros_brand_assets.zip`, matching the existing
  Tailwind palette exactly), `Footer.tsx`, all page `<title>`s, `package.json`/
  `package-lock.json` name, the FastAPI app title, and the `/api/methodology` summary
  text. "Rare Disease Translation Initiative" intentionally kept as descriptive text on
  the homepage hero and layout description, per the rebrand instructions. `frontend/public/`
  now holds the brand SVG/PNG assets and `favicon.svg`.
- **"Type A"/"Type B" replaced with plain language** in every public-facing spot: the
  methodology page's feature badges now read "Structured data"/"Literature-derived" with
  a hover tooltip explaining the distinction; `DomainBars`/`RiskBadge` gained tooltips and
  plain-language risk-band labels ("High risk" instead of bare "HIGH"); a new "objective
  scoring measure, step by step" explainer section was added to `/methodology`. Left
  as-is in `/research/*` (operator-facing pipeline tooling, not the public site) and in
  code comments — see scope note in [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md#the-objective-scoring-rubric-specifies-more-than-is-implemented)
  confirming this terminology is implementation-only, not manuscript vocabulary, so
  rewriting it doesn't diverge from the science.
- **New `/pipeline` page**: a public, narrative walkthrough of all 10 manuscript-pipeline
  stages (cohort → feature dictionary → retrieval → classification/normalization →
  domain scoring → TRS → validation → completeness → counterfactual/CTR → manuscript
  outputs), each with what/input/method/output/downstream-use, linking to the relevant
  `/research/*` operator tool. Addresses the previously-missing public pipeline
  explainer noted below.
- **Diseases and Portfolio merged into one page** — `/diseases` now has the search/filter
  table plus the refresh-all widget that used to live only on `/portfolio`; `/portfolio`
  redirects there. See [ARCHITECTURE.md](ARCHITECTURE.md#diseasesportfolio-merge).
- **A single disease can now be scored on its own**, not just the full ~100-disease
  portfolio: `ScoreDiseaseButton.tsx` appears per unscored row in the diseases table and
  on a disease's own "not yet scored" page, both calling the same
  `POST /api/admin/refresh` with a one-item `diseases` list. Verified in a browser: click
  triggers a real `POST /api/admin/refresh`, the button shows "Scoring…" and disables,
  other rows' buttons stay independently clickable.
- **Domain risk uses the same 0–100 scale and direction as TRS everywhere** — previously
  `DomainBars`/`CompareClient` each inverted risk to an undocumented "readiness" concept
  with two different scales (0–10 vs 0–100), confusing next to the TRS headline. Both now
  show risk directly with an explicit caption; verified in a browser on both the disease
  page and the compare radar chart. See
  [ARCHITECTURE.md](ARCHITECTURE.md#resolved-domain-risk-now-uses-the-same-scaledirection-as-trs-everywhere).
- **Real 100-disease data refresh run**: unlike the sandboxed environment the first two
  passes ran in, this machine has real outbound internet, so `POST /api/admin/refresh`
  was run against the full `PORTFOLIO` for real — live ClinicalTrials.gov/Europe
  PMC/NIH RePORTER/openFDA evidence, not `seed_demo.py` placeholders. See
  [DATA_SOURCES.md](DATA_SOURCES.md) for exact coverage as of this pass — check
  `GET /api/provenance` (or the Methodology page's Data Provenance section, next bullet)
  for the current live count, since a refresh can be re-run any time and this file isn't
  re-diffed against the database on every edit.
- **New `GET /api/provenance` endpoint + Data Provenance section on `/methodology`**:
  surfaces cohort size, diseases actually scored, live `model_version`/`extractor_version`,
  and the most recent evidence retrieval timestamp, computed live from the database (not
  hand-maintained text). Directly addresses "the website should show that version
  somewhere in Methodology/Data Provenance" — the live version is now unambiguous on-site,
  even though *what changed* between extractor v3.0 and v3.1 remains unresolved (see
  "Unresolved" below; making the current version visible and reconstructing undocumented
  history are two different problems, and only the first was solved here).
- **`CohortBadge` component + "Validated cohort" labeling**: every disease reachable
  through the public site today is, by construction, a member of
  `DEFAULT_MANUSCRIPT_COHORT` (== `PORTFOLIO`), so a "Validated cohort" badge now appears
  on the diseases page header and on every disease detail page (including the "not yet
  scored" state — cohort membership is prespecified independent of scoring status). The
  component also defines an `"exploratory"` variant for the day free-text search outside
  the cohort ships, so that state has a defined look already rather than being invented
  ad hoc later — but it's not reachable through the UI today (see the portfolio-allowlist
  point below), so it's unused for now.
- **Deeper evidence provenance on disease pages**: `provenance_table()` in `engine.py` now
  LEFT JOINs literature evidence against the `documents` table so a feature's evidence can
  show the actual PubMed/PMC link and article title, not just an opaque internal
  `document_id`; it also carries `extractor_version` per literature-evidence row.
  `EvidenceSection.tsx` was rewritten so each feature within a domain expands to show its
  specific source(s): clickable link (if any), title, "structured record" vs.
  "literature-derived," retrieval date, and extractor version — score → variable →
  evidence → source, in one click-through, per the request. This is a reporting-only
  change (new columns via a `LEFT JOIN`); it does not touch any scoring math, so it needed
  no `MODEL_VERSION`/`EXTRACTOR_VERSION` bump.
- **`docs/VARIABLE_DISPOSITION.md`**: a first-pass Implemented/Not-implemented table for
  every docx-specified variable, including one code-verifiable case
  (`active_trials_current` is retrieved by `fetch_clinical_trials()` but has no
  `FEATURE_SPECS` entry, so it's silently never scored) and the rest marked "TBD — needs
  your input" rather than guessed. **This table needs the project owner's review before
  its Status/Reason columns are treated as final** — see the file itself.

## Implemented but incomplete / broken

- **Portfolio coverage depends on when you last ran a refresh**: `backend/app/data/`
  doesn't exist until the backend runs once and `POST /api/admin/refresh` (or
  `python seed_demo.py` for 3 offline demo diseases) has populated it — check
  `GET /api/provenance`'s `diseases_scored` field for the live count rather than assuming
  either "0" or "100" here. **This was very likely the root cause of the originally
  reported "disease pages / portfolio 404 or appear broken" symptom** before this pass —
  the UI now clearly labels the not-yet-scored state (see above) instead of looking
  broken, and a real refresh has since been run against this machine's live internet
  access (see above).
- **Persistence is still SQLite, and Render's filesystem is ephemeral across deploys**:
  the score data populated in this pass lives in this machine's local
  `backend/app/data/evidence/rdti_evidence_v3.sqlite`. If the production deployment target
  is Render without a persistent disk, every redeploy wipes it and `/api/admin/refresh`
  must be re-run from scratch — **not fixed in this pass**, see "Planned / not
  implemented" below.
- **Portfolio is still a fixed 100-name allowlist, not the backend's actual free-text
  capability**: `engine.resolve_disease()` can score *any* disease query, but the public
  site's routing (`main.PORTFOLIO`, `slugify`/`unslugify_lookup`) only recognizes the 100
  names in `DEFAULT_MANUSCRIPT_COHORT`. This was **not** changed — the fix applied was to
  clearly distinguish "not in the portfolio" (true 404) from "in the portfolio, not yet
  scored" (informational page) rather than to open up free-text search, since the search
  UI only ever offers names already in the fetched portfolio list (there is no way to
  type an arbitrary disease name into `SearchBar`) — so "resolvable but not in the scored
  portfolio" isn't a state a user can currently reach through the UI at all. Expanding
  `SearchBar` to arbitrary free text remains a deliberate scope boundary; see unresolved
  item 6 below.
- Dead code: `app/page.tsx:17` declares `trialsIndexed = null` with a comment saying it's
  a placeholder for a future metric; never referenced again. Left as-is (out of scope for
  the fixes requested; flagged here for a future cleanup pass).

## Planned / not implemented

- Auth on `/api/research/*` and `/research/*` — intentionally absent per the root
  `README.md`, tied to Research being a planned-for-removal section. If Research is kept
  long-term in a public deployment, this needs to be built.
- **Postgres/Supabase migration — explicitly deferred, not started.** SQLite works for
  local development, but if the production target is Render without a persistent disk,
  scores don't survive a redeploy. The migration path is documented in root `README.md`
  ("Moving to Postgres / Supabase") — only `db_conn()`, `init_db()`, and the
  `sqlite3`-specific `INSERT ... ON CONFLICT` calls in `engine.py` need to change;
  everything upstream is storage-agnostic. **Real blocker to doing this now: it needs
  your Render dashboard access / a `DATABASE_URL`** to actually provision and point at —
  I can write the code the moment you want to proceed, but can't create the database
  myself.
- A resolved answer for "what changed between extractor v3.0 and v3.1" — still open (see
  "Unresolved" below). What *was* addressed this pass: the live version is no longer
  ambiguous — `GET /api/provenance` and the Methodology page's Data Provenance section
  always show the current `model_version`/`extractor_version` and when evidence was last
  retrieved. What's still missing is a record of what the v3.0→v3.1 rule change actually
  was, and whether the frozen manuscript bundle should be regenerated to match.
- Free-text disease search/scoring on the public site (see the portfolio-allowlist point
  above) — would require exposing `engine.resolve_disease()` + an on-demand scoring path
  through the public API, not just a frontend change. `CohortBadge`'s `"exploratory"`
  variant is ready for this the day it ships.
- Tier 2 roadmap items (deeper disease pages with missingness/completeness/download,
  portfolio analytics — filters, scatterplots, CSV export, prevalence/trial-phase
  filters —, an explanatory "what drives the difference" layer on Compare, restoring a
  public-facing counterfactual/CTR UI, and a dedicated evidence-completeness analysis) —
  scoped as follow-up work, each large enough to deserve its own focused pass rather than
  being folded into this one.

## Legacy / deprecated

- `../app_v2.py` (984 lines) and `../APP Versions/appv1.py`, `../APP Versions/v6.py` —
  earlier Streamlit prototypes of the same app, superseded by `engine.py` (v3.3) and its
  FastAPI wrapper. These live **outside** `poros-platform/` (one directory up, not part of
  this git repo) and should be treated as historical reference only, not edited or
  imported from.
- `backend/seed_demo.py` — explicitly self-described as temporary, to be deleted once real
  retrieval is confirmed working in a hosted environment with outbound internet.

## Manuscript-frozen — do not casually change

See [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md#do-not-touch-without-a-version-bump)
for the authoritative list. Summary: `TYPE_B_RULES`, `FEATURE_SPECS`,
`calculate_score_from_values()`/`empirical_risk()`/`feature_risk()`, `derive_outcome()`,
and `DEFAULT_MANUSCRIPT_COHORT` membership. Any change to these requires a
`MODEL_VERSION`/`EXTRACTOR_VERSION` bump and a note in this file plus
[CHANGELOG.md](CHANGELOG.md).

## Unresolved — flagged rather than guessed

Per the audit instructions, these are surfaced rather than silently resolved:

1. **Extractor version mismatch**: `../Manuscript Bundle/methods_snapshot.txt` says
   `Extractor: typeB_rules_v3.0`; the live `engine.py` says `EXTRACTOR_VERSION =
   "typeB_rules_v3.1"`. No changelog, commit message, or comment in this repo explains
   what changed between the two rule versions, or whether the frozen bundle's numbers
   have since been superseded by a re-run. **Needs the project owner to clarify**: was
   v3.1 a deliberate rule refinement after the bundle was generated, and if so, should the
   manuscript bundle be regenerated before it's cited?
2. **`app.py`/`app_v2.py` relationship to `engine.py`** is stated by the root README
   ("migrated near-verbatim from the original `app.py`") but no `app.py` (singular, exact
   name) exists anywhere in the searched directories — only `app_v2.py` and
   `APP Versions/appv1.py` / `v6.py`. It's unclear which of these, if any, is the literal
   "original `app.py`" the README refers to, or whether it was renamed/consolidated at
   some point before this repo's history began. Not resolved here — flagged for the
   project owner.
3. **The Objective Scoring docx rubric specifies ~46 variables; only 29 are implemented**
   in `FEATURE_SPECS` — confirmed by full-text extraction of all six docx files (see
   [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md#the-objective-scoring-rubric-specifies-more-than-is-implemented)).
   A draft disposition table now exists at
   [VARIABLE_DISPOSITION.md](VARIABLE_DISPOSITION.md) listing every gap variable with one
   code-verifiable exception (`active_trials_current`, retrieved but never scored) and the
   rest marked "TBD." **Still needs the project owner** to actually decide
   Excluded-vs-Future-work per row and write the real reason — the draft only organizes
   the question, it doesn't answer it.
4. **`AscertainmentCompleteness` has zero variance (constant 100.0) across the frozen
   bundle's 40 scored diseases**, breaking its univariate statistics. **`Regulatory`**'s
   univariate fit is missing a CI/p-value. Both need the project owner's input before any
   manuscript Results text cites them — see
   [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md#known-data-quality-flags-in-the-frozen-bundle-for-whoever-writes-results-text).
5. **`counterfactual_results.csv` covers only 10 of the 40 scored diseases** with no
   documented selection rule, while the provenance database's full `counterfactual_runs`
   table has more rows — unclear whether the CSV export is meant to be a curated
   highlight set or was truncated by accident.
6. **Whether the 100-name portfolio is meant to stay a fixed allowlist long-term**, or
   whether the product intent is for the public site to eventually support the same
   free-text resolution the backend already has. This materially changes how "disease not
   found" should be handled in the UI (see the routing gap above) and wasn't specified
   anywhere in the existing docs — flagged rather than assumed.
