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
