# CLAUDE.md

Guidance for Claude Code (and any Claude session) working in this repository. Read this
first, every session. It's short by design — deeper detail lives in `/docs/` and is
linked from here, not duplicated here.

## What this is

**POROS** (product name; the broader research effort is the "Rare Disease Translation
Initiative," RDTI — see [Naming](#naming) below) is a public research platform that scores
rare diseases on how far they are from patient access — a **Translation Risk Score
(TRS)** — built from structured public biomedical data (trials, funding, regulatory
signals) plus documentary evidence extracted from the literature. It also has an
operator-facing manuscript pipeline: build a historical cohort, derive real-world
outcomes, run predictive/validation statistics, and export a manuscript-ready bundle
(dataset, figures, methods text).

It's a two-service app: a **FastAPI backend** (`backend/app/engine.py` +
`backend/app/main.py`) that owns 100% of the scientific logic, and a **Next.js frontend**
(`frontend/`) that renders whatever the backend returns and computes nothing scientific
itself.

## Architecture and important directories

```
backend/app/engine.py    the scoring/retrieval engine — ALL the science lives here
backend/app/main.py      FastAPI routes wrapping engine.py — no new science, just HTTP
backend/seed_demo.py     offline demo data for 3 diseases (temporary, see docs/DATA_SOURCES.md)
frontend/app/            Next.js App Router pages (one folder per route)
frontend/components/     shared UI components
frontend/lib/api.ts      the ONLY place that knows backend URLs and response shapes
docs/                    deeper documentation — read these before non-trivial work
```

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## How the Translation Risk scoring pipeline works (short version)

1. **Resolve** a disease name → stable `disease_id`.
2. **Retrieve** two evidence types in parallel:
   - **Type A** (structured numbers) from ClinicalTrials.gov, NIH RePORTER, openFDA.
   - **Type B** (documentary yes/no) from Europe PMC/PubMed, via a rules-based text
     classifier (paired condition groups + exclusion phrases + disease-proximity check;
     *not* an LLM, *not* validated high-precision — see docs).
3. **Normalize**: Type A values become empirical cohort-relative percentiles; Type B
   values become binary risk (evidence present = low risk, not confirmed = high risk,
   retrieval failure = excluded, never treated as absence).
4. **Aggregate** into 5 domain scores (biological, clinical, regulatory, economic,
   infrastructure) and one composite **TRS**, plus two separately-reported coverage
   metrics (ascertainment completeness, evidence coverage).
5. Everything is versioned (`MODEL_VERSION`, `EXTRACTOR_VERSION`) and persisted to SQLite
   with full provenance, so any score can be traced back to its source evidence.

Full detail, including the exact formulas and the historical-snapshot/counterfactual
logic: [docs/SCORING_METHODOLOGY.md](docs/SCORING_METHODOLOGY.md). Full feature list:
[docs/FEATURE_DICTIONARY.md](docs/FEATURE_DICTIONARY.md). Data sources:
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Critical scientific/methodological rules

- **Type A vs. Type B is an evidence-type axis, not a domain.** Don't conflate it with
  the 5 scoring domains when writing UI copy or docs.
- **"Not confirmed" ≠ "does not exist."** A Type B `NOT_CONFIRMED` status means the
  prespecified search protocol ran and found nothing — it is never proof of absence.
  Retrieval *failure* is a separate `UNASCERTAINED` status and must never be scored as
  risk.
- **Scores are cohort-relative, not absolute.** The same raw trial count scores
  differently depending on which other diseases are in the reference cohort. Never treat
  a TRS or domain score as portable across different cohorts/snapshots.
- **Historical snapshots must never leak present-day state.** `as_of_date` retrieval
  filters trials/documents/funding to what existed by that date; present-day trial status
  is explicitly never used to infer a past state.
- **Counterfactuals never mutate stored evidence.** They rerun the frozen scoring pipeline
  on an in-memory copy. They are model-based scenarios, not causal claims — never present
  them as such in UI copy.
- **Any change to scoring math, `TYPE_B_RULES`, or `FEATURE_SPECS` requires bumping
  `MODEL_VERSION` and/or `EXTRACTOR_VERSION`** in `engine.py`. This is how old and new
  evidence stay distinguishable. See [docs/MANUSCRIPT_REQUIREMENTS.md](docs/MANUSCRIPT_REQUIREMENTS.md#do-not-touch-without-a-version-bump).

## Commands

**Backend**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
python seed_demo.py              # optional: 3 offline demo diseases, no internet needed
```
Populate real data (needs outbound internet):
```bash
curl -X POST http://localhost:8000/api/admin/refresh -H "Content-Type: application/json" -d '{}'
curl http://localhost:8000/api/admin/refresh/status
```
Smoke-test scoring math (no network): `GET /api/research/smoke-test`.

**Frontend**
```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL -> your backend
npm run dev
```

## Where deeper documentation lives

| Doc | Covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full route list, frontend data flow, known bugs (with file:line) |
| [docs/SCORING_METHODOLOGY.md](docs/SCORING_METHODOLOGY.md) | Exact formulas, Type B classifier logic, counterfactual math |
| [docs/FEATURE_DICTIONARY.md](docs/FEATURE_DICTIONARY.md) | All 29 features: domain, type, modifiable, description |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Every external API, the SQLite schema, demo/frozen data |
| [docs/MANUSCRIPT_REQUIREMENTS.md](docs/MANUSCRIPT_REQUIREMENTS.md) | What the manuscript needs from this code, and what's frozen |
| [docs/VARIABLE_DISPOSITION.md](docs/VARIABLE_DISPOSITION.md) | Code-audited 46→29 variable reconciliation (24 implemented / 3 merged / 16 excluded / 3 future work), each with a methodological rationale — needs project-owner sign-off |
| [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) | Working / broken / planned / legacy / frozen, and open questions |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Human-readable history of meaningful changes |

## Current development priorities

See [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) for the full, current list — it's
kept up to date there rather than duplicated here. As of the last update, the earlier
round of product fixes (comparison bug, empty states, rebrand, plain-language labels,
pipeline explainer, diseases/portfolio merge, per-disease scoring, risk-scale clarity) is
done, and a "Tier 1" pass has shipped a real 100-disease data refresh (100/100 scored,
0 errors), live version/provenance visibility (`GET /api/provenance`, Data Provenance
section on `/methodology`), a full code-audited variable disposition reconciliation
([docs/VARIABLE_DISPOSITION.md](docs/VARIABLE_DISPOSITION.md): 46 specified, 24
implemented, 3 merged, 16 excluded, 3 future work, 0 unresolved), Validated Cohort
labeling, and per-feature evidence provenance (source links, dates, extractor version).
**Top remaining items**: the project owner's sign-off on
`docs/VARIABLE_DISPOSITION.md` (the MERGED and FUTURE WORK rows are real decisions, not
just documentation), the Postgres migration on Render (owner has created `poros-db`;
migration code — SQLAlchemy/psycopg/Alembic refactor of `engine.py`'s direct `sqlite3`
usage — not yet started, sequenced to happen *after* the scientific freeze per the
owner's explicit instruction), resolving what changed between extractor v3.0 and v3.1,
and the Tier-2 roadmap (deeper disease-page depth, portfolio analytics/filters/export, an
explanatory layer on Compare, a public counterfactual/CTR UI, evidence-completeness
analysis).

## Things future Claude sessions must not accidentally change

- **`engine.py`'s scoring math, `TYPE_B_RULES`, or `FEATURE_SPECS`** without a deliberate,
  version-bumped, user-requested methodology change. This is manuscript-frozen — see
  [docs/MANUSCRIPT_REQUIREMENTS.md](docs/MANUSCRIPT_REQUIREMENTS.md).
- **`DEFAULT_MANUSCRIPT_COHORT` membership** — changing it changes every disease's
  cohort-relative score, not just the one added/removed.
- **The `../Manuscript Bundle/` or `../Objective Scoring/` source files** (one directory
  above this repo) — these are frozen manuscript artifacts, not something to regenerate
  or overwrite casually.
- **Don't silently "fix" the extractor-version mismatch** flagged in
  [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md#unresolved--flagged-rather-than-guessed)
  by editing one side to match the other — it's an open question for the project owner,
  not a bug to patch.
- **The backend/frontend separation of concerns**: never add scoring logic to `main.py` or
  the frontend. All science stays in `engine.py`.

## Keeping this documentation current

**After any meaningful change, update [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)
and add an entry to [docs/CHANGELOG.md](docs/CHANGELOG.md).** "Meaningful" means: scoring
math, feature/rule changes, API contract changes, routing changes, or a fix to something
`CURRENT_STATUS.md` previously listed as broken.

If the change alters architecture, scoring methodology, the feature list, data sources, or
manuscript requirements, update the matching `/docs/` file in the same change — don't let
this file or `/docs/` drift from the code. If you're not sure whether something counts as
"meaningful," err toward writing the entry; it's cheap, and a stale status doc costs the
next session real time.

## Naming

The product is being rebranded from **RDTI** to **POROS**. "Rare Disease Translation
Initiative" is the broader research initiative's name and can still appear as
descriptive/secondary text, but the site/product name in navbars, titles, and primary
branding should read **POROS**. This rebrand is in progress — see
[docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) for exactly which files still say
"RDTI."
