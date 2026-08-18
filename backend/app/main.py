from __future__ import annotations

"""
RDTI API — FastAPI wrapper around the POROS v3.3 translation-risk engine
(engine.py, migrated near-verbatim from the original Streamlit app).

This layer adds no new scientific logic. It exposes the existing resolver,
retrieval, aggregation, scoring, and provenance functions over HTTP so a
Next.js frontend (or anything else) can drive them.
"""

import io
import re
import traceback
from typing import Any

import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from . import engine as eng

app = FastAPI(title="POROS API", version=eng.APP_VERSION)

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

DEFAULT_BASELINE_DATE = eng.DEFAULT_BASELINE_DATE
DEFAULT_FOLLOWUP_END = eng.DEFAULT_FOLLOWUP_END


class RefreshRequest(BaseModel):
    diseases: list[str] | None = None  # defaults to full portfolio
    as_of_date: str | None = None
    force_refresh: bool = False


class PipelineRequest(BaseModel):
    diseases: list[str] | None = None  # defaults to full 100-disease portfolio
    baseline_date: str = DEFAULT_BASELINE_DATE
    followup_end: str = DEFAULT_FOLLOWUP_END
    force_refresh: bool = False


class ValidationLabelRequest(BaseModel):
    human_label: str  # "CONFIRMED_PRESENT" | "NOT_CONFIRMED" | "AMBIGUOUS"
    note: str | None = None


class WipeRequest(BaseModel):
    confirm: bool = False


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
            out.append({
                "name": name, "slug": slugify(name), "trs": None, "domains": None,
                "ascertainment_completeness": None, "evidence_coverage": None,
                "risk_band": "UNSCORED", "error": str(e),
            })
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
            "hand-picked anchors. Structured evidence comes from ClinicalTrials.gov, "
            "NIH RePORTER, and openFDA; each numeric feature is converted to an empirical "
            "percentile risk against the current portfolio. Literature-derived evidence is "
            "retrieved from Europe PMC/PubMed and classified with paired, disease-proximate, "
            "exclusion-aware rules; presence of qualifying evidence lowers risk, "
            "non-confirmation raises it, and failure to retrieve evidence is reported as "
            "ascertainment status rather than treated as proof of absence. Domain scores are "
            "the mean of their features' risk values; TRS is the mean of the available domain "
            "scores."
        ),
    }


@app.get("/api/provenance")
def provenance_summary() -> dict[str, Any]:
    """Live version/coverage state of the current public portfolio — answers "what
    exactly produced the scores I'm looking at right now." Distinct from the frozen
    manuscript bundle (../Manuscript Bundle/), which was generated under an older
    extractor version (typeB_rules_v3.0) and is not updated by this endpoint or by
    /api/admin/refresh — see docs/CURRENT_STATUS.md for that unresolved version gap."""
    cohort_id = portfolio_cohort_id()
    disease_ids = eng.get_disease_ids_for_names(PORTFOLIO)
    placeholders = ",".join("?" for _ in disease_ids)
    scored_count = 0
    latest_retrieved_at = None
    if disease_ids:
        with eng.db_conn() as conn:
            row = conn.execute(
                f"""SELECT COUNT(DISTINCT disease_id) FROM feature_values
                    WHERE disease_id IN ({placeholders}) AND snapshot_date=?""",
                (*disease_ids, eng.CURRENT_SNAPSHOT),
            ).fetchone()
            scored_count = row[0] if row else 0
            row2 = conn.execute(
                f"""SELECT MAX(retrieved_at) FROM raw_observations
                    WHERE disease_id IN ({placeholders}) AND snapshot_date=?""",
                (*disease_ids, eng.CURRENT_SNAPSHOT),
            ).fetchone()
            latest_retrieved_at = row2[0] if row2 else None
    return {
        "cohort_label": "Frozen manuscript cohort (DEFAULT_MANUSCRIPT_COHORT)",
        "cohort_id": cohort_id,
        "cohort_size": len(PORTFOLIO),
        "diseases_scored": scored_count,
        "app_version": eng.APP_VERSION,
        "model_version": eng.MODEL_VERSION,
        "extractor_version": eng.EXTRACTOR_VERSION,
        "latest_evidence_retrieved_at": latest_retrieved_at,
        "snapshot": eng.CURRENT_SNAPSHOT,
        "note": (
            "This reflects the live, current-code state of the public portfolio, scored "
            "under the extractor/model versions above. It is separate from the frozen "
            "manuscript bundle checked into the repo (../Manuscript Bundle/), which was "
            "generated under extractor version typeB_rules_v3.0 and has not been "
            "regenerated under the current version. See docs/CURRENT_STATUS.md."
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


# =============================================================================
# Research namespace — wraps the manuscript pipeline (engine.py) that already
# existed but wasn't exposed over HTTP: historical cohort scoring, outcome
# derivation, predictive/univariate analyses, the Type B validation/QA
# workflow (with Cohen's kappa), counterfactual scenarios, and export.
#
# This is a research-operator surface, not a hardened public API — there's
# no auth here, matching the original Streamlit app (which only the operator
# ran locally). If you deploy this publicly and want to keep the Research
# section, put it behind a login before shipping; if you don't, un-mount
# this router (see bottom of file) and the rest of the site is unaffected.
# =============================================================================

_pipeline_status: dict[str, Any] = {
    "running": False, "step": "", "done": 0, "total": 0, "errors": [],
    "cohort_id": None, "baseline_date": None, "followup_end": None,
    "analysis_id": None, "bundle_path": None, "finished_at": None,
}


def _run_pipeline(names: list[str], baseline_date: str, followup_end: str, force_refresh: bool) -> None:
    _pipeline_status.update(
        running=True, step="Starting", done=0, total=len(names), errors=[],
        cohort_id=None, baseline_date=baseline_date, followup_end=followup_end,
        analysis_id=None, bundle_path=None, finished_at=None,
    )

    def progress(done: int, total: int, step: str) -> None:
        _pipeline_status.update(done=done, total=total, step=step)

    try:
        result = eng.run_full_manuscript_pipeline(
            names, baseline_date=baseline_date, followup_end=followup_end,
            force_refresh=force_refresh, progress_callback=progress,
        )
        _pipeline_status.update(
            cohort_id=result["cohort_id"], analysis_id=result["analysis_id"],
            bundle_path=str(result["bundle"]), errors=result["errors"],
            step="Complete",
        )
    except Exception as exc:
        _pipeline_status["errors"].append({"error": str(exc), "trace": traceback.format_exc()})
        _pipeline_status["step"] = "Failed"
    finally:
        _pipeline_status["running"] = False
        _pipeline_status["finished_at"] = eng.now_iso()


@app.post("/api/research/pipeline/run")
def research_pipeline_run(req: PipelineRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Runs the full manuscript pipeline: historical snapshot -> score ->
    outcome derivation -> predictive/univariate analyses -> counterfactual
    scan of high-risk diseases -> exportable bundle. This calls out to
    ClinicalTrials.gov / Europe PMC / NIH RePORTER / openFDA for every
    disease at the historical cutoff, so it needs real outbound internet and
    can take a while for 20-40+ diseases. Requires >= 8 diseases."""
    if _pipeline_status["running"]:
        raise HTTPException(409, "A research pipeline run is already in progress.")
    names = req.diseases or eng.DEFAULT_MANUSCRIPT_COHORT
    if len(names) < 8:
        raise HTTPException(400, "Use at least 8 diseases for manuscript analysis; 20-40 is preferable.")
    background_tasks.add_task(_run_pipeline, names, req.baseline_date, req.followup_end, req.force_refresh)
    return {"started": True, "count": len(names), "baseline_date": req.baseline_date, "followup_end": req.followup_end}


@app.get("/api/research/pipeline/status")
def research_pipeline_status() -> dict[str, Any]:
    return _pipeline_status


@app.get("/api/research/pipeline/config")
def research_pipeline_config() -> dict[str, Any]:
    return {
        "default_baseline_date": DEFAULT_BASELINE_DATE,
        "default_followup_end": DEFAULT_FOLLOWUP_END,
        "default_cohort_size": len(eng.DEFAULT_MANUSCRIPT_COHORT),
        "default_cohort": eng.DEFAULT_MANUSCRIPT_COHORT,
        "outcome_definition": (
            "Primary outcome (Phase3Outcome): first Phase III interventional study start date falls within "
            "[baseline_date, followup_end]. Composite LateStageOutcome additionally counts an openFDA label "
            "effective date in that window as a supplementary approval signal."
        ),
    }


def _require_last_pipeline() -> dict[str, str]:
    if not _pipeline_status.get("cohort_id"):
        raise HTTPException(
            404,
            "No completed research pipeline run yet. POST /api/research/pipeline/run first "
            "(needs outbound internet access to ClinicalTrials.gov / Europe PMC / NIH RePORTER / openFDA).",
        )
    return {
        "cohort_id": _pipeline_status["cohort_id"],
        "baseline_date": _pipeline_status["baseline_date"],
        "followup_end": _pipeline_status["followup_end"],
    }


@app.get("/api/research/dataset")
def research_dataset() -> dict[str, Any]:
    """The frozen manuscript_dataset.csv equivalent: one row per disease with
    domain scores, TRS, completeness/coverage, and derived outcomes."""
    ctx = _require_last_pipeline()
    df = eng.manuscript_dataset(ctx["cohort_id"], ctx["baseline_date"], ctx["baseline_date"], ctx["followup_end"])
    return {"cohort_id": ctx["cohort_id"], "baseline_date": ctx["baseline_date"], "followup_end": ctx["followup_end"],
            "rows": df.to_dict(orient="records"), "n": len(df)}


@app.get("/api/research/analyses")
def research_analyses(outcome: str = "Phase3Outcome") -> dict[str, Any]:
    """Predictive/univariate statistics: model AUCs (bootstrap CI), per-domain
    univariate logistic regressions (OR, CI, p-value), and a domain
    correlation matrix — the Results-section numbers for the manuscript."""
    ctx = _require_last_pipeline()
    df = eng.manuscript_dataset(ctx["cohort_id"], ctx["baseline_date"], ctx["baseline_date"], ctx["followup_end"])
    if df.empty:
        raise HTTPException(404, "Dataset is empty for the last pipeline run.")
    return eng.run_manuscript_analyses(df, outcome)


@app.get("/api/research/counterfactual")
def research_counterfactual(disease: str = Query(...), feature: str = Query(...)) -> dict[str, Any]:
    """Change one modifiable, factual Type B input for one disease and
    rerun the identical scoring function — a model-based scenario, not a
    causal claim (see engine.py's counterfactual_for_feature docstring)."""
    ctx = _require_last_pipeline()
    name = unslugify_lookup(slugify(disease)) or disease
    identity = eng.resolve_disease(name)
    if feature not in eng.FEATURE_SPECS:
        raise HTTPException(404, f"Unknown feature_id '{feature}'. See /api/methodology for valid feature ids.")
    try:
        result = eng.counterfactual_for_feature(
            identity["disease_id"], ctx["baseline_date"], ctx["cohort_id"], feature,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    result["disease"] = identity.get("canonical_name") or name
    return result


@app.get("/api/research/counterfactual/rank")
def research_counterfactual_rank(disease: str = Query(...)) -> dict[str, Any]:
    """Every eligible modifiable feature for one disease, ranked by
    model-predicted ΔTRS — 'which lever matters most for this disease'."""
    ctx = _require_last_pipeline()
    name = unslugify_lookup(slugify(disease)) or disease
    identity = eng.resolve_disease(name)
    df = eng.rank_counterfactuals(identity["disease_id"], ctx["baseline_date"], ctx["cohort_id"])
    return {"disease": identity.get("canonical_name") or name, "rows": df.to_dict(orient="records") if len(df) else []}


@app.get("/api/research/counterfactual/cohort")
def research_counterfactual_cohort(outcome: str = "Phase3Outcome", top_fraction: float = 0.25) -> dict[str, Any]:
    """Runs the ranked counterfactual scan across the highest-risk quartile
    (default) of the cohort — answers whether one intervention dominates
    across diseases or the best lever is idiosyncratic per disease."""
    ctx = _require_last_pipeline()
    df = eng.manuscript_dataset(ctx["cohort_id"], ctx["baseline_date"], ctx["baseline_date"], ctx["followup_end"])
    if df.empty:
        raise HTTPException(404, "Dataset is empty for the last pipeline run.")
    cf = eng.cohort_counterfactual_analysis(df, ctx["baseline_date"], ctx["cohort_id"], outcome, top_fraction)
    return {"rows": cf.to_dict(orient="records") if len(cf) else [], "n": len(cf)}


@app.get("/api/research/manuscript-validation-plan")
def research_manuscript_validation_plan() -> dict[str, Any]:
    """Per-feature eligible-class audit for the locked manuscript validation protocol
    (historical snapshot only, class-balanced where feasible) — computed without
    drawing the sample, so the proposed counts can be reviewed before any rows are
    fetched for review."""
    return eng.manuscript_validation_plan()


@app.get("/api/research/manuscript-validation-sample")
def research_manuscript_validation_sample() -> dict[str, Any]:
    """The locked manuscript validation sample: historical 2015-12-31 snapshot only,
    20 rows/feature, class-balanced (10 CONFIRMED_PRESENT / 10 NOT_CONFIRMED) where both
    classes have enough eligible rows, gracefully degraded (never fabricated) where one
    class is scarce. Deterministic — same rows every call. This is the ONLY sample
    /research/validation uses; the general-purpose GET /api/research/validation-sample
    below still exists for ad hoc QA but is not wired into that page."""
    df, plan = eng.manuscript_validation_sample()
    rows = df.to_dict(orient="records") if len(df) else []
    for r in rows:
        spec = eng.FEATURE_SPECS.get(r["feature_id"])
        r["feature_label"] = spec.label if spec else r["feature_id"]
        r["feature_description"] = spec.description if spec else ""
    return {"plan": plan, "rows": rows, "n": len(rows)}


@app.get("/api/research/validation-sample")
def research_validation_sample(
    n: int = Query(75, ge=10, le=500),
    per_feature: int | None = Query(None, ge=1, le=100, description="Override: sample exactly this many rows per feature instead of splitting n across features."),
) -> dict[str, Any]:
    """Sample of Type B extractor decisions for human QA review, stratified across
    every feature_id so a per-feature precision/recall breakdown is actually possible
    (see GET /api/research/extractor-metrics). Per the project's own audit: this is an
    extractor QA pass, not a formal independent second human rater — see the
    rater_note on the metrics endpoint below. Deterministic for a given (n, per_feature)
    pair (fixed seed) — reloading with the same params reproduces the same rows, so
    already-reviewed ones are simply the ones with `reviewed: true` in the response;
    resuming a review session means re-requesting the same params, not tracking state
    client-side."""
    df = eng.validation_sample(n, per_feature=per_feature)
    rows = df.to_dict(orient="records") if len(df) else []
    for r in rows:
        spec = eng.FEATURE_SPECS.get(r["feature_id"])
        r["feature_label"] = spec.label if spec else r["feature_id"]
        r["feature_description"] = spec.description if spec else ""
    return {"rows": rows, "n": len(rows)}


@app.post("/api/research/validation-sample/{evidence_id}")
def research_validation_label(evidence_id: int, req: ValidationLabelRequest) -> dict[str, Any]:
    if req.human_label not in eng.VALID_HUMAN_LABELS:
        raise HTTPException(400, f"human_label must be one of {eng.VALID_HUMAN_LABELS}.")
    eng.save_human_validation(evidence_id, req.human_label, req.note)
    return {"saved": True, "evidence_id": evidence_id, "human_label": req.human_label}


@app.get("/api/research/extractor-metrics")
def research_extractor_metrics() -> dict[str, Any]:
    """Accuracy/precision/recall/specificity/Cohen's kappa of the Type B
    extractor against whatever human labels have been saved so far via the
    validation-sample endpoint above."""
    return eng.extractor_validation_metrics()


@app.get("/api/research/validation-export")
def research_validation_export() -> Response:
    """CSV of every human-reviewed row (disease, feature, machine status, human
    label/note, evidence snippet, source) — the manuscript validation supplement.
    Read-only over already-saved labels; does not touch scoring or extraction."""
    df = eng.validation_export()
    return Response(
        content=df.to_csv(index=False),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=validation_labels.csv"},
    )


@app.post("/api/research/validation-import")
async def research_validation_import(
    file: UploadFile = File(...),
    dry_run: bool = Query(True, description="Default true — always dry-run first to see the classification report before applying."),
    overwrite_conflicts: bool = Query(False, description="If true, rows that already have a DIFFERENT saved label are overwritten; otherwise they're left untouched and reported as conflicts."),
) -> dict[str, Any]:
    """Restore human validation labels from a previously exported validation CSV (see
    GET /api/research/validation-export for the matching export format) — e.g. after
    losing application state before running the export. Every row is checked against
    the CURRENT frozen manuscript validation sample (recomputed fresh, not stored)
    before being accepted. Only feature_evidence.reviewed/human_label/human_note are
    ever written, via the same save_human_validation() path a normal label click uses —
    never diseases, evidence, feature_values, scores, or the cohort/snapshot
    definition. The raw upload is preserved as an audit artifact under
    backend/app/data/exports/validation_imports/ regardless of outcome."""
    raw = await file.read()

    audit_dir = eng.EXPORT_DIR / "validation_imports"
    audit_dir.mkdir(parents=True, exist_ok=True)
    stamp = eng.now_iso().replace(":", "-")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "upload.csv")
    audit_path = audit_dir / f"{stamp}_{safe_name}"
    audit_path.write_bytes(raw)

    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        return {"ok": False, "error": f"Couldn't parse this file as CSV: {exc}", "audit_copy": str(audit_path)}

    result = eng.import_validation_csv(df, overwrite_conflicts=overwrite_conflicts, dry_run=dry_run)
    result["audit_copy"] = str(audit_path)
    return result


@app.get("/api/research/extractor-versions/stale")
def research_stale_versions() -> dict[str, Any]:
    return {"stale_versions": eng.stale_extractor_versions(), "current_version": eng.EXTRACTOR_VERSION}


@app.post("/api/research/extractor-versions/wipe")
def research_wipe_stale(req: WipeRequest) -> dict[str, Any]:
    if not req.confirm:
        raise HTTPException(400, "Pass {\"confirm\": true} to actually delete stale extractor evidence.")
    n = eng.wipe_type_b_evidence(exclude_version=eng.EXTRACTOR_VERSION)
    return {"deleted_rows": n, "kept_version": eng.EXTRACTOR_VERSION}


@app.get("/api/research/methods-snapshot")
def research_methods_snapshot() -> dict[str, str]:
    """Plain-text Methods-section paragraph, generated from the live
    cohort/version state rather than hand-maintained separately."""
    ctx = _require_last_pipeline()
    text = eng.methods_snapshot_text(ctx["cohort_id"], ctx["baseline_date"], "Phase3Outcome")
    return {"text": text}


@app.get("/api/research/export")
def research_export() -> FileResponse:
    """Rebuilds and returns the full manuscript bundle zip: dataset CSV,
    analysis JSON, counterfactual CSV, univariate CSV, methods snapshot,
    feature dictionary, figures, and a provenance copy of the database."""
    ctx = _require_last_pipeline()
    df = eng.manuscript_dataset(ctx["cohort_id"], ctx["baseline_date"], ctx["baseline_date"], ctx["followup_end"])
    if df.empty:
        raise HTTPException(404, "Dataset is empty for the last pipeline run.")
    analyses = eng.run_manuscript_analyses(df, "Phase3Outcome")
    counterfactuals = eng.cohort_counterfactual_analysis(df, ctx["baseline_date"], ctx["cohort_id"], "Phase3Outcome")
    bundle = eng.export_manuscript_bundle(
        df, analyses, counterfactuals, ctx["cohort_id"], ctx["baseline_date"], "Phase3Outcome"
    )
    return FileResponse(str(bundle), filename=bundle.name, media_type="application/zip")


@app.get("/api/research/smoke-test")
def research_smoke_test() -> dict[str, Any]:
    """Runs engine.smoke_test_math() — a pure in-memory check that scoring
    logic behaves correctly (e.g. confirming a modifiable feature can only
    ever lower or hold risk, never raise it). No network calls."""
    return eng.smoke_test_math()
