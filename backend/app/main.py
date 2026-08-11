from __future__ import annotations

"""
RDTI API — FastAPI wrapper around the POROS v3.3 translation-risk engine
(engine.py, migrated near-verbatim from the original Streamlit app).

This layer adds no new scientific logic. It exposes the existing resolver,
retrieval, aggregation, scoring, and provenance functions over HTTP so a
Next.js frontend (or anything else) can drive them.
"""

import re
import traceback
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import engine as eng

app = FastAPI(title="RDTI API", version=eng.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your deployed frontend origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# Portfolio: the fixed set of diseases the public site indexes and scores
# diseases relative to (cohort-derived scoring needs a shared reference set).
# Start from the manuscript cohort already defined in the engine; add more
# names here (or via POST /api/portfolio) as the dataset grows toward 100+.
# -----------------------------------------------------------------------------
PORTFOLIO: list[str] = list(eng.DEFAULT_MANUSCRIPT_COHORT)
PORTFOLIO_LABEL = "portfolio"


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s


def unslugify_lookup(slug: str) -> str | None:
    for name in PORTFOLIO:
        if slugify(name) == slug:
            return name
    return None


def portfolio_cohort_id() -> str:
    return eng.cohort_id_for(PORTFOLIO, PORTFOLIO_LABEL)


def domain_breakdown(feature_values: dict[str, Any], reference_stats: dict[str, list[float]]) -> dict[str, list[dict[str, Any]]]:
    """Per-feature risk contributions within each domain, for provenance display."""
    out: dict[str, list[dict[str, Any]]] = {d: [] for d in eng.DOMAIN_LABELS}
    for fid, spec in eng.FEATURE_SPECS.items():
        fv = feature_values.get(fid)
        value = fv.get("value") if fv else None
        risk = eng.feature_risk(spec, value, reference_stats.get(fid, [])) if fv else None
        out[spec.domain].append({
            "feature_id": fid,
            "label": spec.label,
            "type": spec.feature_type,
            "value": value,
            "status": fv.get("status") if fv else "UNASCERTAINED",
            "risk": risk,
            "description": spec.description,
        })
    return out


def primary_barriers(breakdown: dict[str, list[dict[str, Any]]], top_n: int = 4) -> list[str]:
    """Human-readable barrier bullets: highest-risk, scoreable, ascertained features."""
    candidates = []
    for domain, rows in breakdown.items():
        for r in rows:
            if r["risk"] is not None and r["risk"] >= 60:
                candidates.append(r)
    candidates.sort(key=lambda r: r["risk"], reverse=True)
    return [c["label"] for c in candidates[:top_n]]


def disease_summary(name: str, snap: str, refs: dict[str, list[float]]) -> dict[str, Any]:
    identity = eng.resolve_disease(name)
    did = identity["disease_id"]
    fv = eng.load_feature_values(did, snap)
    result = eng.calculate_score_from_values(fv, refs)
    return {
        "name": identity.get("canonical_name") or name,
        "slug": slugify(name),
        "disease_id": did,
        "trs": result["trs"],
        "domains": result["domains"],
        "ascertainment_completeness": result["ascertainment_completeness"],
        "evidence_coverage": result["evidence_coverage"],
    }


def risk_band(trs: float | None) -> str:
    if trs is None:
        return "UNSCORED"
    if trs >= 66:
        return "HIGH"
    if trs >= 33:
        return "MODERATE"
    return "LOW"


# -----------------------------------------------------------------------------
# Schemas
# -----------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    diseases: list[str] | None = None  # defaults to full portfolio
    as_of_date: str | None = None
    force_refresh: bool = False


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "version": eng.APP_VERSION, "model_version": eng.MODEL_VERSION}


@app.get("/api/portfolio")
def get_portfolio() -> dict[str, Any]:
    return {"diseases": PORTFOLIO, "count": len(PORTFOLIO)}


@app.get("/api/diseases")
def list_diseases(snap: str = eng.CURRENT_SNAPSHOT) -> dict[str, Any]:
    """Portfolio landing list: every disease with its current TRS, for the
    homepage/portfolio table and search."""
    cohort_id = portfolio_cohort_id()
    refs = eng.load_reference_stats(cohort_id, snap) or eng.fit_reference_stats(
        eng.get_disease_ids_for_names(PORTFOLIO), snap, cohort_id
    )
    rows = []
    for name in PORTFOLIO:
        try:
            s = disease_summary(name, snap, refs)
            s["risk_band"] = risk_band(s["trs"])
            rows.append(s)
        except Exception:
            rows.append({"name": name, "slug": slugify(name), "trs": None, "risk_band": "UNSCORED", "error": True})
    return {"snapshot": snap, "diseases": rows}


@app.get("/api/disease/{slug}")
def get_disease(slug: str, snap: str = eng.CURRENT_SNAPSHOT) -> dict[str, Any]:
    name = unslugify_lookup(slug)
    if not name:
        raise HTTPException(404, f"Unknown disease slug '{slug}'. Try /api/diseases for the portfolio list.")
    identity = eng.resolve_disease(name)
    did = identity["disease_id"]

    if not eng.snapshot_exists(did, snap):
        raise HTTPException(
            404,
            f"No snapshot for '{name}' yet. POST /api/admin/refresh to fetch evidence for the portfolio first.",
        )

    cohort_id = portfolio_cohort_id()
    refs = eng.load_reference_stats(cohort_id, snap) or eng.fit_reference_stats(
        eng.get_disease_ids_for_names(PORTFOLIO), snap, cohort_id
    )
    fv = eng.load_feature_values(did, snap)
    result = eng.calculate_score_from_values(fv, refs)
    breakdown = domain_breakdown(fv, refs)

    prov = eng.provenance_table(did, snap)
    provenance = prov.to_dict(orient="records") if not prov.empty else []

    return {
        "name": identity.get("canonical_name") or name,
        "slug": slug,
        "disease_id": did,
        "identity": identity,
        "snapshot": snap,
        "trs": result["trs"],
        "risk_band": risk_band(result["trs"]),
        "domains": result["domains"],
        "ascertainment_completeness": result["ascertainment_completeness"],
        "evidence_coverage": result["evidence_coverage"],
        "domain_breakdown": breakdown,
        "primary_barriers": primary_barriers(breakdown),
        "provenance": provenance,
    }


@app.get("/api/compare")
def compare_diseases(names: str = Query(..., description="Comma-separated disease names or slugs"),
                      snap: str = eng.CURRENT_SNAPSHOT) -> dict[str, Any]:
    requested = [n.strip() for n in names.split(",") if n.strip()]
    resolved_names = []
    for n in requested:
        match = unslugify_lookup(slugify(n)) or n
        resolved_names.append(match)

    cohort_id = portfolio_cohort_id()
    refs = eng.load_reference_stats(cohort_id, snap) or eng.fit_reference_stats(
        eng.get_disease_ids_for_names(PORTFOLIO), snap, cohort_id
    )
    out = []
    for name in resolved_names:
        try:
            s = disease_summary(name, snap, refs)
            s["risk_band"] = risk_band(s["trs"])
            out.append(s)
        except Exception as e:
            out.append({"name": name, "slug": slugify(name), "error": str(e)})
    return {"snapshot": snap, "diseases": out}


@app.get("/api/methodology")
def methodology() -> dict[str, Any]:
    return {
        "app_version": eng.APP_VERSION,
        "model_version": eng.MODEL_VERSION,
        "extractor_version": eng.EXTRACTOR_VERSION,
        "domains": eng.DOMAIN_LABELS,
        "features": {
            fid: {
                "label": spec.label,
                "domain": spec.domain,
                "type": spec.feature_type,
                "modifiable": spec.modifiable,
                "scoreable": spec.scoreable,
                "description": spec.description,
            }
            for fid, spec in eng.FEATURE_SPECS.items()
        },
        "summary": (
            "Translation Risk Score (TRS) is derived from cohort-normalized evidence, not "
            "hand-picked anchors. Type A (structured) evidence comes from ClinicalTrials.gov, "
            "NIH RePORTER, and openFDA; each numeric feature is converted to an empirical "
            "percentile risk against the current portfolio. Type B (documentary) evidence is "
            "retrieved from Europe PMC/PubMed and classified with paired, disease-proximate, "
            "exclusion-aware rules; presence of qualifying evidence lowers risk, "
            "non-confirmation raises it, and failure to retrieve evidence is reported as "
            "ascertainment status rather than treated as proof of absence. Domain scores are "
            "the mean of their features' risk values; TRS is the mean of the available domain "
            "scores."
        ),
    }


# -----------------------------------------------------------------------------
# Admin: trigger evidence retrieval. This calls out to ClinicalTrials.gov,
# Europe PMC, NIH RePORTER, and openFDA — it needs outbound internet access
# and will take a while for the full portfolio, so it runs in the background.
# -----------------------------------------------------------------------------

_refresh_status: dict[str, Any] = {"running": False, "done": 0, "total": 0, "errors": []}


def _run_refresh(diseases: list[str], as_of_date: str | None, force_refresh: bool) -> None:
    _refresh_status.update(running=True, done=0, total=len(diseases), errors=[])
    for name in diseases:
        try:
            eng.build_disease_snapshot(name, as_of_date=as_of_date, force_refresh=force_refresh)
        except Exception as e:
            _refresh_status["errors"].append({"disease": name, "error": str(e), "trace": traceback.format_exc()})
        finally:
            _refresh_status["done"] += 1
    snap = eng.snapshot_key(as_of_date)
    cohort_id = portfolio_cohort_id()
    eng.fit_reference_stats(eng.get_disease_ids_for_names(diseases), snap, cohort_id)
    _refresh_status["running"] = False


@app.post("/api/admin/refresh")
def admin_refresh(req: RefreshRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    if _refresh_status["running"]:
        raise HTTPException(409, "A refresh is already running.")
    diseases = req.diseases or PORTFOLIO
    background_tasks.add_task(_run_refresh, diseases, req.as_of_date, req.force_refresh)
    return {"started": True, "count": len(diseases)}


@app.get("/api/admin/refresh/status")
def refresh_status() -> dict[str, Any]:
    return _refresh_status
