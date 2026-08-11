# RDTI — Rare Disease Translation Initiative

A public research website replacing the original Streamlit app (`POROS v3.3`).
The scientific engine — resolver, retrieval, cohort-normalized scoring,
provenance, and the manuscript/validation pipeline — is migrated **near
verbatim** from the original `app.py`; nothing about the science was rewritten.
What changed is the interface: a FastAPI backend now serves that engine over
HTTP, and a Next.js site replaces the Streamlit UI.

```
rdti/
├── backend/
│   ├── app/
│   │   ├── engine.py     # the original scoring/retrieval engine, Streamlit UI stripped
│   │   └── main.py       # FastAPI routes wrapping the engine
│   ├── data/              # SQLite DB + exports (created at runtime)
│   ├── seed_demo.py       # optional: seeds 3 diseases with offline demo data
│   └── requirements.txt
└── frontend/
    ├── app/                # Next.js App Router pages
    │   ├── page.tsx                 rdti.org/
    │   ├── diseases/page.tsx        rdti.org/diseases
    │   ├── portfolio/page.tsx       rdti.org/portfolio
    │   ├── disease/[slug]/page.tsx  rdti.org/disease/visceral-myopathy
    │   ├── compare/page.tsx         rdti.org/compare
    │   └── methodology/page.tsx     rdti.org/methodology
    ├── components/
    └── lib/api.ts          # typed fetch client for the backend
```

## Run it locally

**Backend**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
The engine creates its own SQLite DB on first run at
`backend/data/evidence/rdti_evidence_v3.sqlite` — no separate Postgres setup
is required to try it locally (see "Moving to Postgres" below for production).

Since this environment's sandbox blocks outbound calls to
ClinicalTrials.gov / Europe PMC / NIH RePORTER / openFDA, I couldn't run live
retrieval here. Instead, `backend/seed_demo.py` inserts three diseases
(Visceral Myopathy, Spinal Muscular Atrophy, Canavan Disease) with
representative numbers so every page has real data to render against:

```bash
python seed_demo.py
```

In production (Render/Railway/Fly, or anywhere with normal outbound
internet), skip the seed script and instead call the real pipeline:

```bash
curl -X POST http://localhost:8000/api/admin/refresh \
  -H "Content-Type: application/json" -d '{}'
# poll:
curl http://localhost:8000/api/admin/refresh/status
```
That walks the full portfolio (`app.main.PORTFOLIO`, currently the 40 names
from `DEFAULT_MANUSCRIPT_COHORT` — extend this list toward 100+ as you curate
more diseases) through `resolve → type A retrieval → type B retrieval →
aggregate → score`, exactly as the original Streamlit sidebar button did.

**Frontend**
```bash
cd frontend
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at your backend
npm run dev
```
Visit `http://localhost:3000`.

## What's implemented

- **Home** — hero, live portfolio stats, search, highest-risk diseases.
- **Diseases** (`/diseases`) — filterable/sortable index of every disease.
- **Portfolio** (`/portfolio`) — full ranked grid.
- **Disease profile** (`/disease/[slug]`) — TRS, per-domain readiness bars,
  primary barriers (auto-derived from highest-risk ascertained features),
  collapsible per-feature evidence by domain, and a source summary
  (structured records vs. literature) — this is the "trace why a disease got
  its score" view the migration plan called for.
- **Compare** (`/compare`) — pick up to 4 diseases, radar chart across the
  five domains, side-by-side TRS.
- **Methodology** (`/methodology`) — live-rendered from `/api/methodology`,
  so it always matches the running engine's feature set and versions, not a
  hand-maintained copy.
- **API** — `GET /api/diseases`, `GET /api/disease/{slug}`, `GET /api/compare`,
  `GET /api/methodology`, `GET /api/portfolio`, `POST /api/admin/refresh` (+
  status). Interactive docs at `/docs` once the backend is running.

## What's intentionally not built yet

The original engine also includes a manuscript pipeline: cohort outcome
derivation, logistic/predictive modeling, bootstrap AUC, calibration,
counterfactual scenario analysis, a human-validation workflow for the Type B
extractor, and figure/bundle export (`run_full_manuscript_pipeline`,
`counterfactual_for_feature`, `extractor_validation_metrics`, etc. — all
still present, untouched, in `engine.py`). These are research-operator tools
rather than public-site features, so I didn't wrap them in public endpoints.
If you want them, the natural next step is an authenticated `/api/admin/...`
namespace (or a small internal-only Next.js route group) calling those
functions directly — say the word and I'll build it.

## Moving to Postgres / Supabase

`engine.py`'s persistence layer (`db_conn`, `init_db`, and every `sqlite3`
call) is currently SQLite, matching the original app. For the
Supabase/Postgres setup from the migration plan, that data layer is the one
piece that needs a real rewrite (query placeholders, `INSERT ... ON
CONFLICT` syntax, and connection handling all differ) — everything upstream
of it (resolver, retrieval, scoring math, provenance) is storage-agnostic and
won't need to change.

## Deploying

- **Frontend → Vercel**: point it at `frontend/`, set `NEXT_PUBLIC_API_URL`
  to your deployed backend URL.
- **Backend → Render/Railway/Fly**: point it at `backend/`, start command
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Make sure outbound
  HTTPS is allowed (it wasn't in this sandbox) so `engine.py` can reach
  ClinicalTrials.gov, Europe PMC, NIH RePORTER, and openFDA.
- Trigger `/api/admin/refresh` once after each deploy (or on a schedule) to
  populate/update snapshots.
