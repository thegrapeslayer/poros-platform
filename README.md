# RDTI — Rare Disease Translation Initiative

A public research website replacing the original Streamlit app (`POROS v3.3`).
The scientific engine — resolver, retrieval, cohort-normalized scoring,
provenance, manuscript/validation pipeline — is migrated **near verbatim**
from the original `app.py`; nothing about the science was rewritten. What
changed is the interface: a FastAPI backend serves that engine over HTTP, and
a Next.js site replaces the Streamlit UI.

```
rdti/
├── backend/
│   ├── app/
│   │   ├── engine.py     # the original scoring/retrieval engine, Streamlit UI stripped
│   │   └── main.py       # FastAPI routes wrapping the engine (public + research)
│   ├── data/              # SQLite DB + exports (created at runtime)
│   ├── seed_demo.py       # optional: seeds 3 diseases with offline demo data
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx                     rdti.org/
    │   ├── diseases/page.tsx            rdti.org/diseases
    │   ├── portfolio/page.tsx           rdti.org/portfolio
    │   ├── disease/[slug]/page.tsx      rdti.org/disease/visceral-myopathy
    │   ├── compare/page.tsx             rdti.org/compare
    │   ├── methodology/page.tsx         rdti.org/methodology
    │   └── research/                    rdti.org/research/*  (operator tools — see below)
    │       ├── page.tsx                  overview + pipeline run/status
    │       ├── cohort/page.tsx           manuscript dataset + AUC/univariate stats
    │       ├── validation/page.tsx       Type B extractor QA sample + Cohen's kappa
    │       ├── counterfactual/page.tsx   single + ranked + cohort-wide scenarios
    │       └── export/page.tsx           methods snapshot + bundle download
    ├── components/
    └── lib/api.ts          # typed fetch client for the backend
```

## What's in this version (v4)

- **Portfolio scaled to 100 diseases** (`engine.DEFAULT_MANUSCRIPT_COHORT`,
  used as `main.PORTFOLIO`). Public pages (home, `/diseases`, `/portfolio`,
  `/disease/[slug]`, `/compare`) score and browse the full 100 once you run
  a refresh — see "Populating real data" below.
- **Research section fully wired** (`/research/*`): everything the original
  engine could already do — historical-cohort scoring, outcome derivation,
  predictive/univariate statistics, Type B extractor validation with Cohen's
  kappa, single/ranked/cohort-wide counterfactual scenarios, and manuscript
  bundle export — is now reachable from the site, not just from `engine.py`
  function calls. You said you'll remove this section later; when you do,
  delete `frontend/app/research/`, remove the `Research` link in
  `components/Nav.tsx`, and optionally un-mount the `/api/research/*` routes
  in `backend/app/main.py` (search for "Research namespace").
- **Live API calls are the real thing**, not mocked: ClinicalTrials.gov,
  Europe PMC/PubMed, NIH RePORTER, and openFDA, exactly as in the original
  Streamlit engine. This sandbox's network policy blocks those hosts, so I
  could not run a live 100-disease refresh here — I verified the full data
  path (API → scoring → SSR pages) using `seed_demo.py`'s 3 offline
  diseases instead, and confirmed real rendered HTML for the homepage,
  a disease profile, and two Research pages. Run a real refresh once you
  deploy somewhere with outbound internet (see below).

## Run it locally

**Backend**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
Creates its own SQLite DB on first run at
`backend/data/evidence/rdti_evidence_v3.sqlite` — no Postgres setup needed to
try it locally (see "Moving to Postgres" below for production).

Optional offline demo data (3 diseases, no internet needed):
```bash
python seed_demo.py
```

**Frontend**
```bash
cd frontend
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at your backend
npm run dev
```
Visit `http://localhost:3000`.

## Populating real data (needs outbound internet)

**Public portfolio** (100 diseases, current-day evidence):
```bash
curl -X POST http://localhost:8000/api/admin/refresh -H "Content-Type: application/json" -d '{}'
curl http://localhost:8000/api/admin/refresh/status   # poll until running: false
```
This can take a while for all 100 — pass `{"diseases": ["Name A", "Name B"]}`
in the body to refresh a subset first while testing.

**Research/manuscript pipeline** (historical cohort, outcome derivation,
stats, counterfactuals, export) — same 100-disease list by default:
```bash
curl -X POST http://localhost:8000/api/research/pipeline/run \
  -H "Content-Type: application/json" -d '{}'
curl http://localhost:8000/api/research/pipeline/status
```
Or trigger both from the site itself: `/research` has a "Run pipeline"
button with live status polling.

## How to update the site going forward

**Changing the science** (feature definitions, scoring, retrieval, Type B
rules, counterfactual logic): edit `backend/app/engine.py` only. Every route
in `main.py` calls into `engine.py` — the frontend never encodes scoring
logic — so a change there is immediately live everywhere once you redeploy
the backend. Bump `EXTRACTOR_VERSION` or `MODEL_VERSION` at the top of
`engine.py` when you change classifier rules or scoring math, exactly as the
original app's versioning convention did; this keeps old evidence
distinguishable from new.

**Adding/removing diseases from the public portfolio**: edit
`main.PORTFOLIO` in `backend/app/main.py` (currently
`list(eng.DEFAULT_MANUSCRIPT_COHORT)`), or edit the cohort list itself in
`engine.py`. Re-run `/api/admin/refresh` after changing it.

**Changing an API response shape**: edit the relevant route function in
`backend/app/main.py`, then update the matching TypeScript type/function in
`frontend/lib/api.ts` so the frontend stays type-safe against the new shape.

**Changing a page's look or content**: edit the relevant file under
`frontend/app/` or `frontend/components/`. Shared visual tokens (colors,
fonts) live in `frontend/tailwind.config.js` and `frontend/app/globals.css`
— change them once there rather than per-page.

**Redeploying after a change**:
- Backend on Render/Railway/Fly: push to your connected branch; it rebuilds
  and restarts automatically. Then hit `/api/admin/refresh` (and
  `/api/research/pipeline/run` if you're keeping Research) once so the new
  code has current data to serve.
- Frontend on Vercel: push to your connected branch; it rebuilds and
  redeploys automatically. No manual refresh step needed on the frontend
  side — it always reads live from the backend (`cache: "no-store"` on every
  fetch in `lib/api.ts`), so it can't serve stale data once the backend has
  new scores.

## What's intentionally not built yet

Auth on `/api/research/*` and `/research/*` — there is none. This mirrors
the original Streamlit app (only the operator ran it locally), but this
namespace is now reachable from a public URL if you deploy it as-is. Since
you're planning to remove the Research section later anyway, I didn't add
auth for a feature with a known expiration date; if you want to keep it
longer-term, put it behind a login before that deploy.

## Moving to Postgres / Supabase

`engine.py`'s persistence layer (`db_conn`, `init_db`, and every `sqlite3`
call) is currently SQLite, matching the original app. For Postgres/Supabase,
that data layer is the one piece needing a real rewrite (placeholders,
`INSERT ... ON CONFLICT` syntax, connection handling all differ) — everything
upstream of it (resolver, retrieval, scoring math, provenance, the new
research endpoints) is storage-agnostic and won't need to change.

## Deploying

- **Frontend → Vercel**: point it at `frontend/`, set `NEXT_PUBLIC_API_URL`
  to your deployed backend URL.
- **Backend → Render/Railway/Fly**: point it at `backend/`, start command
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Make sure outbound
  HTTPS is allowed (it wasn't in this sandbox) so `engine.py` can reach
  ClinicalTrials.gov, Europe PMC, NIH RePORTER, and openFDA.
- Trigger `/api/admin/refresh` (and `/api/research/pipeline/run` if keeping
  Research) once after each deploy, or on a schedule, to populate/update data.
