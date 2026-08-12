# Architecture

Status: **implemented and working**, with specific known gaps noted inline and detailed
in [CURRENT_STATUS.md](CURRENT_STATUS.md).

## Overview

POROS (formerly branded RDTI — see [CLAUDE.md](../CLAUDE.md#naming)) is a two-service app:

```
poros-platform/
├── backend/                FastAPI service — all science lives here
│   ├── app/
│   │   ├── engine.py        the scoring/retrieval engine (2,292 lines) — see SCORING_METHODOLOGY.md
│   │   └── main.py          FastAPI routes wrapping engine.py (549 lines) — see below
│   ├── data/                 SQLite DB + exports, created at runtime, gitignored
│   ├── seed_demo.py          offline demo data for 3 diseases — see DATA_SOURCES.md
│   └── requirements.txt
└── frontend/                Next.js 14 App Router site
    ├── app/
    │   ├── page.tsx                    /            — homepage, hero + high-risk preview
    │   ├── diseases/page.tsx           /diseases    — full searchable/filterable table
    │   ├── portfolio/page.tsx          /portfolio   — full card grid, ranked by TRS
    │   ├── disease/[slug]/page.tsx     /disease/:slug — one disease's full profile
    │   ├── compare/page.tsx            /compare     — up to 4 diseases, radar chart
    │   ├── methodology/page.tsx        /methodology — domains/features + (to add) pipeline explainer
    │   └── research/                   /research/*  — operator tools, see "Research namespace" below
    ├── components/               shared UI: Nav, Footer, DiseaseCard/Table, SearchBar,
    │                              DomainBars, RiskBadge, EvidenceSection, CompareClient,
    │                              ResearchNav
    └── lib/api.ts                 the only place that knows backend URLs/response shapes
```

The backend owns 100% of the scientific logic. `main.py` adds **no new science** — every
route is a thin wrapper that calls into `engine.py` and reshapes the result for HTTP. The
frontend contains **zero scoring logic** — it only renders whatever `lib/api.ts` fetched.
This separation is intentional and load-bearing: changing how something is *computed*
means editing `engine.py`; changing how it's *displayed* means editing the frontend; they
should never need to change together except when an API response shape changes (in which
case both `main.py`'s route and `lib/api.ts`'s matching type/function change together).

## Backend routes (`backend/app/main.py`)

**Public site API** (no auth — this is a public research site):
- `GET /api/health`
- `GET /api/portfolio` — the fixed list of disease names (`main.PORTFOLIO`)
- `GET /api/diseases` — every portfolio disease with current TRS/risk band (powers
  homepage, `/diseases`, `/portfolio`, `SearchBar`)
- `GET /api/disease/{slug}` — full profile: TRS, domain breakdown, primary barriers,
  provenance. 404s if the slug isn't in the portfolio, or if no snapshot exists yet for
  it (see [CURRENT_STATUS.md](CURRENT_STATUS.md) for why this is the actual cause of the
  "disease page not found" issue in a fresh checkout)
- `GET /api/compare?names=...` — same shape as `/api/diseases` but for a comma-separated
  subset; **known bug in its error path**, see below
- `GET /api/methodology` — domain labels + full feature dictionary, live from
  `FEATURE_SPECS`
- `POST /api/admin/refresh` / `GET /api/admin/refresh/status` — triggers live retrieval
  for the portfolio (or a subset), runs as a background task, needs outbound internet

**Research namespace** (`/api/research/*`) — wraps the manuscript pipeline
(historical-cohort scoring, outcome derivation, predictive/univariate stats, Type B
validation with Cohen's κ, counterfactual scenarios, bundle export) over HTTP. **No auth.**
The root `README.md` flags this explicitly: this mirrors the original Streamlit app (only
the operator ran it locally), and if the Research section is kept in a public deployment
long-term it needs auth added before that. See
[CURRENT_STATUS.md](CURRENT_STATUS.md#security) and
[MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md).

## Frontend data flow

Every page is a React Server Component that `await`s a `lib/api.ts` function at render
time (`cache: "no-store"` on every fetch — the site never serves stale scores once the
backend has new data). Interactive pieces (`CompareClient`, all of `/research/*`) are
`"use client"` components that fetch client-side after mount.

`lib/api.ts` is the single seam between frontend and backend: it owns `API_BASE`
(`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`), every typed response interface,
and every fetch function. **Any backend response shape change must be mirrored here in
the same change** — this is the one place a frontend/backend contract mismatch can
silently break rendering, and it already has one live example (next section).

## Known bug: `/api/compare` error path breaks the comparison UI

`compare_diseases()` (`main.py:219-240`) has two return shapes depending on whether a
requested disease resolved successfully:

- Success: `disease_summary()`'s full shape — `{name, slug, disease_id, trs, domains,
  ascertainment_completeness, evidence_coverage, risk_band}`.
- Failure (`main.py:238-239`): only `{name, slug, error}` — **missing `trs`, `domains`,
  and `risk_band` entirely**, unlike the equivalent fallback in `list_diseases()`
  (`main.py:173`), which does include `trs: None, risk_band: "UNSCORED"`.

`frontend/lib/api.ts`'s `DiseaseSummary` interface declares `trs` and `risk_band` as
required (only `error` is optional), and `CompareClient.tsx` never checks `r.error`
anywhere. The result: a failed comparison entry renders `RiskBadge` with `band=undefined`
(empty, uncolored pill) and gets plotted on the radar chart as `0` on every domain axis —
indistinguishable from a real "maximum risk" score, not from "couldn't score this
disease." This is the disease comparison feature's specific breakage and is fixed as
part of the Phase 2 work — see [CURRENT_STATUS.md](CURRENT_STATUS.md).

## Readiness vs. risk: a known duplication

The backend only ever produces **risk** (0 = best, 100 = worst). Two frontend components
independently invert it to "readiness" for more intuitive display, with **different
scales**:
- `DomainBars.tsx:18` — `(100 - risk) / 10`, a 0–10 scale, used on the disease detail page.
- `CompareClient.tsx:51` — `(100 - risk)`, a 0–100 scale, used for the compare radar chart.

Each is internally consistent with its own chart's axis, so this isn't a display bug, but
it is duplicated conversion logic with no single source of truth — a future change to the
readiness formula (e.g. rounding behavior) requires remembering to update it in two
places. Worth centralizing in `lib/api.ts` or a shared util if touched again.

## Routing / slug contract

Disease slugs are generated **only** server-side, in Python: `slugify()`
(`main.py:43-45`) and its inverse `unslugify_lookup()` (`main.py:48-52`) both live in
`main.py` and operate over the fixed `PORTFOLIO` list. The frontend never generates or
guesses a slug — every link (`DiseaseCard`, `DiseaseTable`, `SearchBar`) uses the `slug`
field the API already returned. This means the round-trip is guaranteed correct by
construction as long as `PORTFOLIO` doesn't change between the list-fetch and the
detail-fetch. It also means **a disease not in `PORTFOLIO` can never resolve to a working
`/disease/[slug]` page**, regardless of whether the backend's free-text resolver
(`resolve_disease()`) could handle it — the public site's routing is scoped to the fixed
portfolio, not the backend's actual free-text capability. See
[CURRENT_STATUS.md](CURRENT_STATUS.md) for the product implication of this gap.

## Deployment

Per root `README.md`: frontend → Vercel (`frontend/`, set `NEXT_PUBLIC_API_URL`); backend
→ Render/Railway/Fly (`backend/`, `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
outbound HTTPS required). `POST /api/admin/refresh` (and `/api/research/pipeline/run` if
Research is kept) must be triggered after each deploy or on a schedule to populate/update
data — the frontend itself is always a live passthrough to whatever the backend currently
has scored, never a cache of old data.
