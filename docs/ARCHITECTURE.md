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
    │   ├── diseases/page.tsx           /diseases    — the disease list: search/filter table,
    │   │                                              refresh-all + per-disease "Score now",
    │   │                                              ranked by TRS. Single merged page — see
    │   │                                              "Diseases/portfolio merge" below.
    │   ├── portfolio/page.tsx          /portfolio   — redirects to /diseases (old links)
    │   ├── disease/[slug]/page.tsx     /disease/:slug — one disease's full profile
    │   ├── compare/page.tsx            /compare     — up to 4 diseases, radar chart
    │   ├── methodology/page.tsx        /methodology — domains/features, plain-language evidence types
    │   ├── pipeline/page.tsx           /pipeline    — manuscript pipeline explainer (public-facing)
    │   └── research/                   /research/*  — operator tools, see "Research namespace" below
    ├── components/               shared UI: Nav, Footer, DiseaseCard/Table, SearchBar,
    │                              DomainBars, RiskBadge, EvidenceSection, CompareClient,
    │                              ScoreDiseaseButton, PortfolioRefresh, ResearchNav
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
  homepage, `/diseases`, `SearchBar`)
- `GET /api/disease/{slug}` — full profile: TRS, domain breakdown, primary barriers,
  provenance. 404s if the slug isn't in the portfolio; returns a distinguishable
  "no snapshot yet" error if it's in the portfolio but unscored (the frontend tells these
  two cases apart — see "Diseases/portfolio merge" below)
- `GET /api/compare?names=...` — same shape as `/api/diseases` but for a comma-separated
  subset. Its error-path shape now matches the success shape (`trs`/`domains`/`risk_band`
  all present, `null`/`"UNSCORED"` on failure) so `CompareClient.tsx` can render a real
  "couldn't score this disease" state instead of silently plotting zeros.
- `GET /api/methodology` — domain labels + full feature dictionary, live from
  `FEATURE_SPECS`
- `POST /api/admin/refresh` / `GET /api/admin/refresh/status` — triggers live retrieval.
  Accepts an optional `diseases` list in the POST body — `lib/api.ts`'s
  `startAdminRefresh(diseases?)` uses this to score **one** disease at a time
  (`ScoreDiseaseButton.tsx`) as well as the whole portfolio (`PortfolioRefresh.tsx`).
  There is exactly one background job slot on the backend (`_refresh_status` is a single
  module-level dict, not per-disease), so a single-disease refresh and a full-portfolio
  refresh can't run concurrently — the frontend checks `running` before starting and
  shows "a refresh is already in progress" rather than letting the request 409 silently.

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

## Resolved: `/api/compare` error path (was breaking the comparison UI)

`compare_diseases()` (`main.py:219-240`) used to return a different, smaller shape for a
disease that failed to resolve/score than for one that succeeded — missing `trs`,
`domains`, and `risk_band` entirely — which `CompareClient.tsx` didn't guard against, so
a failed comparison silently rendered as an empty risk badge and a false "0/100 on every
domain" radar plot. Fixed on both sides: the error-path payload now includes
`trs: null, domains: null, risk_band: "UNSCORED"` (matching `list_diseases()`'s existing
fallback shape), and `CompareClient.tsx` explicitly splits `results` into `scored`/`failed`
and renders a visible "couldn't be scored" note instead of feeding nulls into the chart.

## Resolved: domain risk now uses the same scale/direction as TRS everywhere

Domain values from the API are always **risk** (0 = best, 100 = worst) — same direction
as TRS. `DomainBars.tsx` and `CompareClient.tsx` used to each independently invert this to
a "readiness" concept for display, with two different, undocumented scales (0–10 on the
disease page, 0–100 on the compare radar), which read as confusing/contradictory next to
the TRS headline directly above them. Both components now display **risk directly, 0–100,
same direction as TRS**, each with an explicit caption saying so
(`DomainBars.tsx`'s `riskColor()` bucket coloring reuses the same HIGH/MODERATE/LOW
thresholds as `RiskBadge`/`risk_band()`). There is no more inversion or duplicated
readiness-conversion math anywhere in the frontend.

## Diseases/portfolio merge

`/diseases` and `/portfolio` used to be two separate pages rendering the same
`GET /api/diseases` data in different layouts (a filterable table vs. a card grid) — a
maintenance duplication with no functional difference. Merged into one page at
`/diseases`: the search/band-filter table (`DiseaseTable.tsx`) plus the refresh-all widget
(`PortfolioRefresh.tsx`) that used to live only on `/portfolio`. `/portfolio/page.tsx` is
now a one-line `redirect("/diseases")` so old links/bookmarks still resolve. `Nav.tsx` has
a single "Diseases" entry.

Each unscored row in that table also gets its own `ScoreDiseaseButton` (`name={d.name}`,
`variant="default"`) so a single disease can be scored without running the full
~100-disease refresh — the same button (in `variant="primary"` form) also appears on a
disease's own page when it hits the "not yet scored" state, with the canonical disease
name parsed out of the backend's `"No snapshot for '{name}' yet"` error text via
`loadDisease()` in `disease/[slug]/page.tsx`, avoiding an extra round trip.

## Search-triggered scoring

`SearchBar.tsx` (homepage) now knows each option's `trs`. Selecting an already-scored
disease navigates immediately, same as before. Selecting an **unscored** one instead
starts a single-disease refresh and only navigates once it completes — the search bar
itself becomes the loading state (input replaced by a "Scoring {name}…" status line)
rather than sending the user to the disease page first to discover it isn't scored yet
and has to be scored from there. `ScoreDiseaseButton.tsx` and `SearchBar.tsx` both build
on a shared `useAdminScore()` hook (`lib/useAdminScore.ts`) — start-refresh-then-poll
logic lived only in `ScoreDiseaseButton` before this and would have been duplicated
rather than reused.

Homepage (`app/page.tsx`) and `/diseases` both set `export const dynamic =
"force-dynamic"` so their stats (disease/scored/high-risk counts, the "highest risk right
now" preview) are never served from Next's client-side route cache — a score triggered
from search or a table row must be reflected the moment either page is next visited, not
up to ~30s later from a stale cached render.

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
