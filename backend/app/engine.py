from __future__ import annotations

"""
POROS v3.3 — end-to-end rare-disease translation research engine.

Design goals
------------
1) Any free-text disease query can be profiled; the app is not limited to a preset catalog.
2) Structured Type A evidence is collected from public biomedical APIs.
3) Documentary Type B evidence is retrieved from Europe PMC/PubMed and classified with
   paired, disease-proximate, exclusion-aware rules; an optional external classifier hook
   can be added, but no LLM is required for the core workflow. This is a rules-based
   extractor, not a validated high-precision classifier — its per-feature error rate must
   be checked against the human-reviewed validation sample (Validation tab) before its
   outputs are trusted for manuscript statistics.
4) Every raw observation, document, feature decision, score, outcome, and analysis run is
   persisted in SQLite with snapshot dates and provenance.
5) Numeric scoring is cohort-derived, not based on hand-picked anchors.
6) Historical snapshots are separated from contemporary data to reduce leakage.
7) Counterfactuals operate on in-memory copies and use either the descriptive TRS or a
   fitted predictive model; the evidence database is never mutated for a scenario.
8) The app can build a manuscript cohort, derive outcomes, run validation analyses,
   generate figures/tables, and export a manuscript-ready bundle.

Important scientific caveat
---------------------------
The automated Type B layer identifies *documented evidence under a prespecified retrieval
protocol*. Failure to retrieve qualifying evidence is not proof that a resource or study
cannot exist. RDTI therefore reports both evidence coverage and ascertainment status, and
its counterfactual outputs are model-based scenarios rather than causal effects.
"""

import io
import json
import math
import os
import re
import sqlite3
import statistics
import tempfile
import time
import uuid
import zipfile
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    import streamlit as st
except Exception:  # permits CLI/module testing without Streamlit installed
    st = None

try:
    import plotly.express as px
    import plotly.graph_objects as go
except Exception:
    px = go = None

# scikit-learn and statsmodels power the manuscript-pipeline statistics
# (predictive models, ROC/AUC, validation metrics). Neither is needed for the
# resolver, scoring, or counterfactual tabs, so a missing install must not
# take down the whole app — every symbol degrades to None and call sites
# below check SKLEARN_AVAILABLE before using them.
try:
    from sklearn.calibration import calibration_curve
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (
        accuracy_score,
        brier_score_loss,
        cohen_kappa_score,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
        roc_curve,
    )
    from sklearn.model_selection import LeaveOneOut, StratifiedKFold, cross_val_predict
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except Exception:
    calibration_curve = LogisticRegression = accuracy_score = brier_score_loss = None
    confusion_matrix = precision_score = recall_score = roc_auc_score = roc_curve = None
    cohen_kappa_score = f1_score = None
    LeaveOneOut = StratifiedKFold = cross_val_predict = Pipeline = StandardScaler = None
    SKLEARN_AVAILABLE = False

try:
    import statsmodels.api as sm
except Exception:
    sm = None

try:
    import matplotlib
    matplotlib.use("Agg")
    MATPLOTLIB_AVAILABLE = True
except Exception:
    MATPLOTLIB_AVAILABLE = False


# =============================================================================
# Configuration
# =============================================================================

APP_VERSION = "3.3"
MODEL_VERSION = "TRS_v3_empirical"
EXTRACTOR_VERSION = "typeB_rules_v3.1"
DEFAULT_BASELINE_DATE = "2015-12-31"
DEFAULT_FOLLOWUP_END = "2025-12-31"
CURRENT_SNAPSHOT = "current"

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "evidence" / "rdti_evidence_v3.sqlite"
EXPORT_DIR = DATA_DIR / "exports"
FIGURE_DIR = EXPORT_DIR / "figures"

DEFAULT_MANUSCRIPT_COHORT = [
    "Spinal Muscular Atrophy",
    "Duchenne Muscular Dystrophy",
    "Rett Syndrome",
    "Canavan Disease",
    "Metachromatic Leukodystrophy",
    "Friedreich Ataxia",
    "Angelman Syndrome",
    "Dravet Syndrome",
    "Niemann-Pick Disease Type C",
    "Gaucher Disease",
    "Fabry Disease",
    "Pompe Disease",
    "Primary Hyperoxaluria Type 1",
    "Ornithine Transcarbamylase Deficiency",
    "Cystinosis",
    "Mucopolysaccharidosis Type I",
    "Krabbe Disease",
    "Batten Disease CLN2",
    "Sickle Cell Disease",
    "Beta Thalassemia",
    "Hemophilia A",
    "Hereditary Angioedema",
    "WHIM Syndrome",
    "Chronic Granulomatous Disease",
    "Cystic Fibrosis",
    "Primary Ciliary Dyskinesia",
    "Lymphangioleiomyomatosis",
    "Hereditary Transthyretin Amyloidosis",
    "Visceral Myopathy",
    "Chronic Intestinal Pseudo-Obstruction",
    "Barth Syndrome",
    "CDKL5 Deficiency Disorder",
    "GNE Myopathy",
    "Facioscapulohumeral Muscular Dystrophy",
    "X-linked Adrenoleukodystrophy",
    "GM1 Gangliosidosis",
    "Acid Sphingomyelinase Deficiency",
    "Wiskott-Aldrich Syndrome",
    "Deficiency of Adenosine Deaminase 2",
    "Pulmonary Arterial Hypertension",
    "Idiopathic Multicentric Castleman Disease",
    "Hutchinson-Gilford Progeria Syndrome",
    "Alport Syndrome",
    "Recessive Dystrophic Epidermolysis Bullosa",
    "Wilson Disease",
    "Mucopolysaccharidosis Type II",
    "Mucopolysaccharidosis Type III",
    "Mucopolysaccharidosis Type IV A",
    "Mucopolysaccharidosis Type VI",
    "Alexander Disease",
    "Pelizaeus-Merzbacher Disease",
    "Batten Disease CLN3",
    "Tay-Sachs Disease",
    "Sandhoff Disease",
    "MPS VII (Sly Syndrome)",
    "Wolman Disease / LAL Deficiency",
    "Phenylketonuria",
    "Maple Syrup Urine Disease",
    "Methylmalonic Acidemia",
    "Propionic Acidemia",
    "Homocystinuria",
    "Tyrosinemia Type I",
    "Hereditary Fructose Intolerance",
    "Glutaric Acidemia Type I",
    "Medium-chain Acyl-CoA Dehydrogenase Deficiency",
    "Very Long-chain Acyl-CoA Dehydrogenase Deficiency",
    "Long-chain 3-Hydroxyacyl-CoA Dehydrogenase Deficiency",
    "Glycogen Storage Disease Type I",
    "Glycogen Storage Disease Type III",
    "Glycogen Storage Disease Type V",
    "Mitochondrial Encephalomyopathy, Lactic Acidosis, and Stroke-like Episodes",
    "Leber Hereditary Optic Neuropathy",
    "Thymidine Kinase 2 Deficiency",
    "POLG-related Disorders",
    "Lennox-Gastaut Syndrome",
    "Prader-Willi Syndrome",
    "Fragile X Syndrome",
    "Tuberous Sclerosis Complex",
    "Neurofibromatosis Type 1",
    "Neurofibromatosis Type 2",
    "Amyotrophic Lateral Sclerosis",
    "Multiple System Atrophy",
    "Progressive Supranuclear Palsy",
    "Hereditary Spastic Paraplegia",
    "Charcot-Marie-Tooth Disease Type 1A",
    "Myotonic Dystrophy Type 1",
    "Limb-Girdle Muscular Dystrophy R2",
    "Congenital Myasthenic Syndrome",
    "Generalized Myasthenia Gravis",
    "Paroxysmal Nocturnal Hemoglobinuria",
    "Atypical Hemolytic Uremic Syndrome",
    "Immune Thrombocytopenia",
    "Hemophilia B",
    "Congenital Thrombotic Thrombocytopenic Purpura",
    "Cryopyrin-Associated Periodic Syndromes",
    "Familial Mediterranean Fever",
    "Severe Combined Immunodeficiency",
    "Idiopathic Pulmonary Fibrosis",
    "Huntington Disease",
    "Alpha-1 Antitrypsin Deficiency",
]

DEVELOPMENT_PILOT = [
    "Visceral Myopathy",
    "Spinal Muscular Atrophy",
    "Canavan Disease",
    "Rett Syndrome",
    "Metachromatic Leukodystrophy",
]


# =============================================================================
# Feature definitions
# =============================================================================

@dataclass(frozen=True)
class FeatureSpec:
    feature_id: str
    label: str
    domain: str
    feature_type: str  # A, B, C
    direction: str = "favorable_high"  # numeric only: favorable_high / risk_high
    modifiable: bool = False
    scoreable: bool = True
    description: str = ""


FEATURE_SPECS: dict[str, FeatureSpec] = {
    # Biological tractability
    "causal_molecular_basis": FeatureSpec(
        "causal_molecular_basis", "Causal molecular basis documented", "biological", "B", modifiable=False,
        description="Qualifying human-genetic or molecular evidence documents a causal gene, lesion, or mechanism.",
    ),
    "actionable_target": FeatureSpec(
        "actionable_target", "Actionable therapeutic target documented", "biological", "B", modifiable=True,
        description="Documented preclinical evidence identifies a specific target or rescuable molecular process.",
    ),
    "human_disease_model": FeatureSpec(
        "human_disease_model", "Human-relevant disease model documented", "biological", "B", modifiable=True,
        description="Patient-derived cells, iPSC, organoid, ex vivo tissue, or equivalent human model reproduces disease biology.",
    ),
    "in_vivo_model": FeatureSpec(
        "in_vivo_model", "In vivo disease model documented", "biological", "B", modifiable=True,
        description="An animal/in vivo model is explicitly described for the disease.",
    ),
    "preclinical_rescue": FeatureSpec(
        "preclinical_rescue", "Preclinical phenotypic rescue documented", "biological", "B", modifiable=True,
        description="An intervention improves or rescues a disease-relevant phenotype in a model.",
    ),

    # Clinical development
    "natural_history_study": FeatureSpec(
        "natural_history_study", "Prospective/longitudinal natural-history evidence", "clinical", "B", modifiable=True,
        description="A natural-history or longitudinal observational study characterizes disease course.",
    ),
    "patient_registry": FeatureSpec(
        "patient_registry", "Disease-specific registry documented", "clinical", "B", modifiable=True,
        description="Documentary evidence identifies a disease-specific patient registry.",
    ),
    "validated_outcome_measure": FeatureSpec(
        "validated_outcome_measure", "Validated/trial-tested outcome measure documented", "clinical", "B", modifiable=True,
        description="A validated, qualified, or explicitly trial-tested disease-relevant outcome measure is documented.",
    ),
    "biomarker_in_trial": FeatureSpec(
        "biomarker_in_trial", "Biomarker used prospectively in a trial", "clinical", "B", modifiable=True,
        description="A biomarker is used prospectively as an endpoint, stratifier, or pharmacodynamic measure.",
    ),
    "trial_count": FeatureSpec("trial_count", "Trials existing by snapshot", "clinical", "A"),
    "completed_by_snapshot": FeatureSpec("completed_by_snapshot", "Trials completed by snapshot", "clinical", "A"),
    "highest_phase_by_snapshot": FeatureSpec("highest_phase_by_snapshot", "Highest phase reached by snapshot", "clinical", "A"),
    "median_enrollment": FeatureSpec("median_enrollment", "Median trial enrollment", "clinical", "A"),
    "unique_trial_sites": FeatureSpec("unique_trial_sites", "Unique trial sites", "clinical", "A"),

    # Regulatory pathway
    "orphan_designation_evidence": FeatureSpec(
        "orphan_designation_evidence", "Orphan designation evidence", "regulatory", "B", modifiable=True,
        description="A qualifying source documents orphan/rare-disease regulatory designation for a therapeutic program.",
    ),
    "expedited_designation_evidence": FeatureSpec(
        "expedited_designation_evidence", "Expedited regulatory designation evidence", "regulatory", "B", modifiable=True,
        description="A qualifying source documents Fast Track, Breakthrough, RMAT, PRIME, or equivalent designation.",
    ),
    "surrogate_endpoint_precedent": FeatureSpec(
        "surrogate_endpoint_precedent", "Surrogate/intermediate endpoint precedent", "regulatory", "B", modifiable=True,
        description="A qualifying source documents surrogate/intermediate endpoint acceptance or use in regulatory development.",
    ),
    "fda_label_signal": FeatureSpec(
        "fda_label_signal", "FDA label indication signal", "regulatory", "A", scoreable=False,
        description="Best-effort present-day label signal; not authoritative approval history.",
    ),

    # Economic sustainability
    "unique_sponsors": FeatureSpec("unique_sponsors", "Unique trial sponsors", "economic", "A"),
    "industry_sponsors": FeatureSpec("industry_sponsors", "Unique industry sponsors", "economic", "A"),
    "industry_trials": FeatureSpec("industry_trials", "Industry-sponsored trials", "economic", "A"),
    "nih_funded_projects": FeatureSpec("nih_funded_projects", "NIH-funded projects, five-year window", "economic", "A"),
    "nih_funding_total": FeatureSpec("nih_funding_total", "NIH funding, five-year window", "economic", "A"),

    # Translation infrastructure
    "patient_organization": FeatureSpec(
        "patient_organization", "Patient organization documented", "infrastructure", "B", modifiable=True,
        description="A disease-specific foundation, alliance, association, or patient advocacy organization is documented.",
    ),
    "biobank": FeatureSpec(
        "biobank", "Biobank/biospecimen resource documented", "infrastructure", "B", modifiable=True,
        description="A disease-specific or disease-accessible biobank/biospecimen resource is documented.",
    ),
    "natural_history_consortium": FeatureSpec(
        "natural_history_consortium", "Natural-history consortium documented", "infrastructure", "B", modifiable=True,
        description="A multicenter consortium/network explicitly conducts disease natural-history work.",
    ),
    "multicenter_network": FeatureSpec(
        "multicenter_network", "Multicenter clinical/research network documented", "infrastructure", "B", modifiable=True,
        description="A disease-focused multicenter consortium, network, or coordinated program is documented.",
    ),
    "consensus_guidance": FeatureSpec(
        "consensus_guidance", "Consensus diagnostic/management guidance documented", "infrastructure", "B", modifiable=True,
        description="Published consensus diagnostic criteria, practice recommendations, or management guidelines exist.",
    ),
    "nih_funding_institutions": FeatureSpec(
        "nih_funding_institutions", "NIH-funded institutions, five-year window", "infrastructure", "A"
    ),
}

DOMAIN_LABELS = {
    "biological": "Biological tractability",
    "clinical": "Clinical development",
    "regulatory": "Regulatory pathway",
    "economic": "Economic sustainability",
    "infrastructure": "Translation infrastructure",
}

TYPE_B_RULES = {
    # Each rule is now a set of paired/grouped conditions rather than a single
    # regex hit: every entry in "groups" must have at least one match inside
    # the SAME evidence window (see WINDOW logic below), and no "exclude"
    # pattern may match inside that same window. A single-group rule is still
    # required to co-occur with a disease-identifying term in the window —
    # that disease-proximity check is applied uniformly, not per-feature.
    "causal_molecular_basis": {
        "query": '(mutation OR variant OR gene OR molecular OR pathogenic)',
        "groups": [[r"pathogenic variant", r"caused by", r"mutations? in", r"variants? in", r"causal gene", r"molecular basis"]],
        "exclude": [r"unrelated (disease|condition)", r"in contrast to"],
    },
    "actionable_target": {
        "query": '(("therapeutic target" OR targeting OR inhibitor OR agonist OR antagonist OR rescue) AND (preclinical OR "in vitro" OR "in vivo" OR cell OR mouse OR model))',
        "groups": [
            [r"therapeutic target", r"targeting", r"inhibit(or|ion)", r"agonist", r"antagonist", r"rescuable"],
            [r"preclinical", r"in vitro", r"in vivo", r"cell model", r"mouse model", r"animal model", r"organoid", r"ipsc"],
        ],
        "exclude": [r"no (validated |identified )?target", r"target (remains )?unknown", r"lack(s|ing) .* target"],
    },
    "human_disease_model": {
        "query": '(iPSC OR organoid OR "patient-derived" OR "human model" OR "ex vivo")',
        "groups": [[r"ipsc", r"organoid", r"patient[- ]derived", r"ex vivo", r"human .* model"]],
        "exclude": [r"mouse model only", r"murine[- ]only"],
    },
    "in_vivo_model": {
        "query": '("animal model" OR "mouse model" OR murine OR knockout OR knock-in OR zebrafish)',
        "groups": [[r"animal model", r"mouse model", r"murine model", r"knockout (mouse|mice)", r"knock-in (mouse|mice)", r"zebrafish model"]],
        "exclude": [],
    },
    "preclinical_rescue": {
        "query": '((rescue OR rescued OR restored OR ameliorated OR reversed) AND (model OR mice OR cells) AND (treated OR administered OR knockdown OR "gene therapy" OR inhibitor))',
        "groups": [
            [r"mouse model", r"animal model", r"\bmice\b", r"\bcells?\b", r"organoid", r"ipsc"],
            [r"treated with", r"administer(ed|ation)", r"knockdown", r"gene therapy", r"inhibitor", r"injected"],
            [r"rescu(ed|e)", r"restored", r"ameliorated", r"reversed .* phenotype", r"improved .* phenotype"],
        ],
        "exclude": [r"failed to rescue", r"no (significant )?improvement", r"did not (restore|rescue|ameliorate)"],
    },
    "natural_history_study": {
        "query": '(("natural history" OR longitudinal OR prospective) AND (untreated OR "disease course" OR "prior to treatment" OR observational))',
        "groups": [
            [r"natural history", r"longitudinal .* (study|cohort|follow)", r"prospective .* (study|cohort|follow)", r"disease course", r"observational .* (study|cohort)"],
        ],
        # Treatment follow-up is NOT natural history — exclude if the passage is
        # actually describing a therapeutic/interventional follow-up.
        "exclude": [r"post[- ]treatment follow[- ]up", r"treated with", r"following (treatment|therapy)",
                    r"randomized (controlled )?trial", r"efficacy (of|and safety)"],
    },
    "patient_registry": {
        "query": '(registry OR "patient registry")',
        "groups": [[r"patient registry", r"disease registry", r"registry .* patients", r"registry study"]],
        "exclude": [r"trial registry", r"clinicaltrials\.gov registration"],
    },
    "validated_outcome_measure": {
        "query": '(("outcome measure" OR endpoint OR scale OR "clinical outcome assessment") AND (validat* OR qualified OR reliability OR responsiveness OR "psychometric"))',
        "groups": [
            [r"outcome measure", r"\bendpoint\b", r"\bscale\b", r"clinical outcome assessment", r"rating scale", r"functional scale"],
            [r"validat(ed|ion)", r"qualified", r"reliability", r"responsiveness", r"psychometric"],
        ],
        # A validated biomarker/assay is NOT the same as a validated clinical
        # outcome measure — exclude passages where "validated" attaches only
        # to an assay/biomarker rather than a measure/scale/endpoint.
        "exclude": [r"validated (biomarker|assay|immunoassay|elisa)(?!.*\b(scale|endpoint|outcome measure)\b)"],
    },
    "biomarker_in_trial": {
        "query": '(biomarker AND (trial OR prospective OR endpoint OR pharmacodynamic OR stratification OR enrollment))',
        "groups": [
            [r"\bbiomarker\b", r"pharmacodynamic marker"],
            [r"prospective trial", r"clinical trial", r"as an? endpoint", r"stratif(y|ication)", r"enrollment criteri", r"pharmacodynamic (endpoint|response)"],
        ],
        "exclude": [r"retrospective(ly)? (analysis|cohort)", r"biomarker discovery only", r"exploratory analysis only"],
    },
    "orphan_designation_evidence": {
        "query": '("orphan designation" OR "orphan drug designation" OR "orphan medicinal product")',
        "groups": [[r"orphan drug designation", r"orphan designation", r"orphan medicinal product"]],
        "exclude": [r"designation (was )?(denied|withdrawn|revoked)"],
    },
    "expedited_designation_evidence": {
        "query": '("breakthrough therapy" OR "fast track" OR RMAT OR PRIME OR "priority medicines")',
        "groups": [[r"breakthrough therapy designation", r"fast track designation", r"rmat designation", r"prime designation", r"priority medicines"]],
        "exclude": [r"designation (was )?(denied|withdrawn|not granted)"],
    },
    "surrogate_endpoint_precedent": {
        "query": '("surrogate endpoint" OR "intermediate endpoint" OR "accelerated approval")',
        "groups": [[r"surrogate endpoint", r"intermediate endpoint", r"accelerated approval .* endpoint"]],
        "exclude": [r"surrogate endpoint (was )?(rejected|not accepted|insufficient)"],
    },
    "patient_organization": {
        "query": '(foundation OR alliance OR association OR "patient advocacy" OR "patient organization")',
        "groups": [[r"patient advocacy", r"patient organization", r"patient foundation", r"foundation .* (patients|disease)", r"alliance .* (patients|disease)"]],
        "exclude": [],
    },
    "biobank": {
        "query": '(biobank OR biospecimen OR "tissue repository")',
        "groups": [[r"biobank", r"biospecimen repository", r"tissue repository"]],
        "exclude": [],
    },
    "natural_history_consortium": {
        "query": '((consortium OR network OR multicenter) AND "natural history")',
        "groups": [
            [r"consortium", r"network", r"multicenter"],
            [r"natural history"],
        ],
        "exclude": [r"post[- ]treatment follow[- ]up", r"randomized (controlled )?trial"],
    },
    "multicenter_network": {
        "query": '(consortium OR "clinical network" OR "research network" OR multicenter)',
        "groups": [[r"clinical network", r"research network", r"multicenter consortium", r"disease consortium", r"consortium .* centers"]],
        "exclude": [],
    },
    "consensus_guidance": {
        "query": '(consensus OR guideline OR "diagnostic criteria" OR recommendations)',
        "groups": [[r"consensus guideline", r"consensus recommendations", r"diagnostic criteria", r"management guideline", r"practice guideline"]],
        "exclude": [r"lack(s|ing) of consensus", r"no (established |consensus )?guideline"],
    },
}


# =============================================================================
# Database
# =============================================================================

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diseases (
    disease_id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    query_text TEXT,
    orpha_id TEXT,
    omim_id TEXT,
    synonyms_json TEXT,
    genes_json TEXT,
    category TEXT,
    created_at TEXT,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS raw_observations (
    observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    raw_value_json TEXT,
    unit TEXT,
    source TEXT,
    source_record_id TEXT,
    source_url TEXT,
    source_date TEXT,
    retrieved_at TEXT,
    query_used TEXT,
    metadata_json TEXT,
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE INDEX IF NOT EXISTS idx_obs_disease_snapshot ON raw_observations(disease_id, snapshot_date);

CREATE TABLE IF NOT EXISTS documents (
    document_id TEXT NOT NULL,
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    source TEXT,
    pmid TEXT,
    pmcid TEXT,
    doi TEXT,
    title TEXT,
    abstract TEXT,
    publication_date TEXT,
    url TEXT,
    query_used TEXT,
    retrieved_at TEXT,
    PRIMARY KEY (document_id, disease_id, snapshot_date),
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE IF NOT EXISTS feature_evidence (
    evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    document_id TEXT,
    supporting_snippet TEXT,
    reason TEXT,
    extractor_version TEXT,
    retrieval_success INTEGER,
    reviewed INTEGER DEFAULT 0,
    human_label TEXT,
    human_note TEXT,
    retrieved_at TEXT,
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE INDEX IF NOT EXISTS idx_ev_disease_snapshot ON feature_evidence(disease_id, snapshot_date);

CREATE TABLE IF NOT EXISTS feature_values (
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    final_value_json TEXT,
    status TEXT,
    evidence_confidence REAL,
    source_count INTEGER,
    last_updated TEXT,
    PRIMARY KEY (disease_id, snapshot_date, feature_id),
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE IF NOT EXISTS reference_stats (
    cohort_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    values_json TEXT NOT NULL,
    n INTEGER NOT NULL,
    calculated_at TEXT,
    PRIMARY KEY (cohort_id, snapshot_date, feature_id)
);

CREATE TABLE IF NOT EXISTS scores (
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    biological_risk REAL,
    clinical_risk REAL,
    regulatory_risk REAL,
    economic_risk REAL,
    infrastructure_risk REAL,
    composite_trs REAL,
    ascertainment_completeness REAL,
    evidence_coverage REAL,
    model_version TEXT,
    calculated_at TEXT,
    PRIMARY KEY (disease_id, snapshot_date, cohort_id, model_version),
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE IF NOT EXISTS outcomes (
    disease_id TEXT NOT NULL,
    index_date TEXT NOT NULL,
    followup_end TEXT NOT NULL,
    phase3_started INTEGER,
    late_stage_advancement INTEGER,
    approval_label_signal INTEGER,
    first_phase3_date TEXT,
    first_label_effective_date TEXT,
    outcome_source TEXT,
    calculated_at TEXT,
    PRIMARY KEY (disease_id, index_date, followup_end)
);

CREATE TABLE IF NOT EXISTS counterfactual_runs (
    counterfactual_id TEXT PRIMARY KEY,
    disease_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    feature_changed TEXT NOT NULL,
    observed_value_json TEXT,
    scenario_value_json TEXT,
    baseline_trs REAL,
    scenario_trs REAL,
    delta_trs REAL,
    baseline_probability REAL,
    scenario_probability REAL,
    delta_probability REAL,
    model_id TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_runs (
    analysis_id TEXT PRIMARY KEY,
    cohort_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    outcome_name TEXT NOT NULL,
    settings_json TEXT,
    results_json TEXT,
    created_at TEXT
);
"""


@contextmanager
def db_conn():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "evidence").mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db_conn() as conn:
        conn.executescript(SCHEMA)
        # CREATE TABLE IF NOT EXISTS in SCHEMA above doesn't add columns to an
        # already-existing table — additive, idempotent migration for databases created
        # before human_note existed. Pure QA/review metadata, not a scoring input.
        cols = {row[1] for row in conn.execute("PRAGMA table_info(feature_evidence)").fetchall()}
        if "human_note" not in cols:
            conn.execute("ALTER TABLE feature_evidence ADD COLUMN human_note TEXT")


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def snapshot_key(as_of_date: str | None) -> str:
    return as_of_date or CURRENT_SNAPSHOT


def disease_id_for(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    return "D_" + slug[:80]


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def json_loads(value: str | None) -> Any:
    if value in (None, ""):
        return None
    try:
        return json.loads(value)
    except Exception:
        return value


# =============================================================================
# HTTP utilities
# =============================================================================


def make_session() -> requests.Session:
    retry = Retry(
        total=3,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
        respect_retry_after_header=True,
    )
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update({"User-Agent": "RDTI-Research-App/3.3 (rare-disease translation research)"})
    return session


HTTP = make_session()


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, requests.exceptions.Timeout):
        return "timeout"
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "connection error"
    if isinstance(exc, requests.exceptions.HTTPError):
        return f"HTTP {getattr(exc.response, 'status_code', '?')}"
    return type(exc).__name__


def parse_date_loose(value: str | None) -> str | None:
    if not value:
        return None
    value = str(value).strip()
    patterns = ["%Y-%m-%d", "%Y-%m", "%Y", "%Y %b %d", "%Y %b", "%Y %b"]
    for fmt in patterns:
        try:
            d = datetime.strptime(value, fmt)
            if fmt == "%Y":
                return f"{d.year:04d}-12-31"
            if fmt == "%Y-%m" or fmt.endswith("%b"):
                return f"{d.year:04d}-{d.month:02d}-28"
            return d.strftime("%Y-%m-%d")
        except Exception:
            pass
    m = re.search(r"(19|20)\d{2}", value)
    return f"{m.group(0)}-12-31" if m else None


def date_leq(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    return a <= b


def date_between(x: str | None, start: str, end: str) -> bool:
    return bool(x and start <= x <= end)


# =============================================================================
# Disease resolution
# =============================================================================


def resolve_disease(query: str) -> dict[str, Any]:
    """Free-text resolver.

    RDTI never rejects a disease merely because it is absent from a local catalog.
    The entered query is always usable. If an Orphadata subscription key is supplied,
    the hook below can enrich identity metadata; otherwise the query itself becomes
    the canonical label and downstream retrieval operates on it directly.
    """
    query = " ".join(query.strip().split())
    if not query:
        raise ValueError("Disease query is empty")

    canonical = query
    synonyms: list[str] = []
    genes: list[str] = []
    orpha_id = None
    omim_id = None

    # Safe fallback: no external identity service is required for arbitrary search.
    # Optional manually configured synonym map may improve retrieval without limiting scope.
    synonym_map_path = ROOT_DIR / "config" / "synonyms.json"
    if synonym_map_path.exists():
        try:
            mapping = json.loads(synonym_map_path.read_text(encoding="utf-8"))
            hit = mapping.get(query.lower())
            if hit:
                canonical = hit.get("canonical", query)
                synonyms = list(hit.get("synonyms", []))
                genes = list(hit.get("genes", []))
                orpha_id = hit.get("orpha_id")
                omim_id = hit.get("omim_id")
        except Exception:
            pass

    did = disease_id_for(canonical)
    ts = now_iso()
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO diseases(disease_id, canonical_name, query_text, orpha_id, omim_id, synonyms_json,
                                 genes_json, category, created_at, last_updated)
            VALUES(?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(disease_id) DO UPDATE SET
              canonical_name=excluded.canonical_name,
              query_text=excluded.query_text,
              orpha_id=COALESCE(excluded.orpha_id,diseases.orpha_id),
              omim_id=COALESCE(excluded.omim_id,diseases.omim_id),
              synonyms_json=excluded.synonyms_json,
              genes_json=excluded.genes_json,
              last_updated=excluded.last_updated
            """,
            (did, canonical, query, orpha_id, omim_id, json_dumps(synonyms), json_dumps(genes), None, ts, ts),
        )
    return {
        "disease_id": did,
        "canonical_name": canonical,
        "query": query,
        "synonyms": synonyms,
        "genes": genes,
        "orpha_id": orpha_id,
        "omim_id": omim_id,
    }


def disease_search_terms(identity: dict[str, Any]) -> list[str]:
    terms = [identity["canonical_name"], identity.get("query")]
    terms.extend(identity.get("synonyms") or [])
    out = []
    for term in terms:
        if term and term.lower() not in {x.lower() for x in out}:
            out.append(term)
    return out[:8]


# =============================================================================
# Persistence helpers
# =============================================================================


def save_observation(
    disease_id: str,
    snap: str,
    feature_id: str,
    value: Any,
    unit: str,
    source: str,
    source_record_id: str = "",
    source_url: str = "",
    source_date: str = "",
    query_used: str = "",
    metadata: dict[str, Any] | None = None,
) -> None:
    with db_conn() as conn:
        conn.execute(
            """INSERT INTO raw_observations
               (disease_id,snapshot_date,feature_id,raw_value_json,unit,source,source_record_id,source_url,
                source_date,retrieved_at,query_used,metadata_json)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                disease_id,
                snap,
                feature_id,
                json_dumps(value),
                unit,
                source,
                source_record_id,
                source_url,
                source_date,
                now_iso(),
                query_used,
                json_dumps(metadata or {}),
            ),
        )


def latest_observation(disease_id: str, snap: str, feature_id: str) -> Any:
    with db_conn() as conn:
        row = conn.execute(
            """SELECT raw_value_json FROM raw_observations
               WHERE disease_id=? AND snapshot_date=? AND feature_id=?
               ORDER BY observation_id DESC LIMIT 1""",
            (disease_id, snap, feature_id),
        ).fetchone()
    return json_loads(row[0]) if row else None


def snapshot_exists(disease_id: str, snap: str) -> bool:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM feature_values WHERE disease_id=? AND snapshot_date=?",
            (disease_id, snap),
        ).fetchone()
    return bool(row and row[0] >= 5)


# =============================================================================
# ClinicalTrials.gov Type A retrieval
# =============================================================================


def _ctg_fetch_all(disease_name: str, max_records: int = 1000) -> list[dict[str, Any]]:
    studies: list[dict[str, Any]] = []
    page_token = None
    while len(studies) < max_records:
        params = {
            "query.cond": disease_name,
            "pageSize": min(100, max_records - len(studies)),
            "format": "json",
            "countTotal": "true",
            "fields": (
                "NCTId,BriefTitle,StudyType,OverallStatus,Phase,StartDate,CompletionDate,"
                "StudyFirstPostDate,LeadSponsorName,LeadSponsorClass,EnrollmentCount,"
                "LocationFacility,LocationCity,LocationCountry,PrimaryOutcomeMeasure,SecondaryOutcomeMeasure"
            ),
        }
        if page_token:
            params["pageToken"] = page_token
        r = HTTP.get("https://clinicaltrials.gov/api/v2/studies", params=params, timeout=30)
        r.raise_for_status()
        payload = r.json()
        studies.extend(payload.get("studies", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break
        time.sleep(0.05)
    return studies


def _study_extract(study: dict[str, Any]) -> dict[str, Any]:
    p = study.get("protocolSection", {})
    ident = p.get("identificationModule", {})
    status = p.get("statusModule", {})
    design = p.get("designModule", {})
    sponsor = p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {})
    locmod = p.get("contactsLocationsModule", {})
    outcomes = p.get("outcomesModule", {})

    phases = design.get("phases", []) or []
    phase_map = {"EARLY_PHASE1": 1, "PHASE1": 1, "PHASE2": 2, "PHASE3": 3, "PHASE4": 4}
    phase_max = max([phase_map.get(x, 0) for x in phases] or [0])
    enrollment = design.get("enrollmentInfo", {}).get("count")
    sites = []
    for loc in locmod.get("locations", []) or []:
        key = "|".join(str(loc.get(k, "")) for k in ("facility", "city", "country"))
        if key.strip("|"):
            sites.append(key)
    outcome_text = " ".join(
        [o.get("measure", "") for o in outcomes.get("primaryOutcomes", []) or []]
        + [o.get("measure", "") for o in outcomes.get("secondaryOutcomes", []) or []]
    )
    return {
        "nct_id": ident.get("nctId", ""),
        "title": ident.get("briefTitle", ""),
        "study_type": design.get("studyType") or p.get("designModule", {}).get("studyType") or "",
        "status_current": status.get("overallStatus", ""),
        "start_date": parse_date_loose(status.get("startDateStruct", {}).get("date")),
        "completion_date": parse_date_loose(status.get("completionDateStruct", {}).get("date")),
        "first_post_date": parse_date_loose(status.get("studyFirstPostDateStruct", {}).get("date")),
        "phase": phase_max,
        "sponsor": sponsor.get("name", ""),
        "sponsor_class": sponsor.get("class", ""),
        "enrollment": enrollment,
        "sites": sites,
        "outcome_text": outcome_text,
    }


def fetch_clinical_trials(identity: dict[str, Any], as_of_date: str | None = None) -> dict[str, Any]:
    name = identity["canonical_name"]
    did = identity["disease_id"]
    snap = snapshot_key(as_of_date)
    raw = _ctg_fetch_all(name)
    records = [_study_extract(s) for s in raw]

    # Only studies that were publicly posted by the historical cutoff are allowed in a historical snapshot.
    # This avoids using present-day trial existence to infer a past state.
    if as_of_date:
        eligible = [
            r for r in records
            if r["start_date"] and r["start_date"] <= as_of_date
            and (not r["first_post_date"] or r["first_post_date"] <= as_of_date)
        ]
    else:
        eligible = records

    current_active_statuses = {
        "RECRUITING", "NOT_YET_RECRUITING", "ACTIVE_NOT_RECRUITING", "ENROLLING_BY_INVITATION"
    }
    if as_of_date:
        active_count = None  # cannot reconstruct reliably from current OverallStatus
    else:
        active_count = sum(r["status_current"] in current_active_statuses for r in eligible)

    completed_by_snapshot = sum(
        bool(r["completion_date"] and (not as_of_date or r["completion_date"] <= as_of_date)) for r in eligible
    )
    phase_max = max([r["phase"] for r in eligible] or [0])
    enrollments = [float(r["enrollment"]) for r in eligible if isinstance(r["enrollment"], (int, float))]
    median_enrollment = float(np.median(enrollments)) if enrollments else None
    sites = {s for r in eligible for s in r["sites"]}
    sponsors = {r["sponsor"] for r in eligible if r["sponsor"]}
    industry_sponsors = {r["sponsor"] for r in eligible if r["sponsor"] and r["sponsor_class"] == "INDUSTRY"}
    industry_trials = sum(r["sponsor_class"] == "INDUSTRY" for r in eligible)

    # Structured Type B assist: biomarker endpoint wording in trial outcomes.
    biomarker_trial_signal = any(re.search(r"\bbiomarker\b|pharmacodynamic", r["outcome_text"], re.I) for r in eligible)

    values = {
        "trial_count": len(eligible),
        "completed_by_snapshot": completed_by_snapshot,
        "highest_phase_by_snapshot": phase_max,
        "median_enrollment": median_enrollment,
        "unique_trial_sites": len(sites),
        "unique_sponsors": len(sponsors),
        "industry_sponsors": len(industry_sponsors),
        "industry_trials": industry_trials,
        "active_trials_current": active_count,
        "biomarker_trial_signal": biomarker_trial_signal,
    }
    url = f"https://clinicaltrials.gov/search?cond={quote_plus(name)}"
    for fid, value in values.items():
        save_observation(did, snap, fid, value, "count" if isinstance(value, (int, float)) else "boolean",
                         "ClinicalTrials.gov API v2", source_url=url, query_used=name)

    return {"values": values, "records": eligible, "all_records": records}


# =============================================================================
# Europe PMC / PubMed documentary retrieval
# =============================================================================


def europe_pmc_search(
    identity: dict[str, Any], feature_id: str, as_of_date: str | None = None, limit: int = 12
) -> tuple[list[dict[str, Any]], bool, str]:
    spec = TYPE_B_RULES[feature_id]
    terms = disease_search_terms(identity)
    disease_clause = " OR ".join(f'TITLE_ABS:"{t}"' for t in terms[:5])
    query = f"({disease_clause}) AND {spec['query']}"
    if as_of_date:
        query += f" AND FIRST_PDATE:[1900-01-01 TO {as_of_date}]"
    params = {
        "query": query,
        "format": "json",
        "pageSize": limit,
        "resultType": "core",
        "sort": "CITED desc",
    }
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    try:
        r = HTTP.get(url, params=params, timeout=25)
        r.raise_for_status()
        payload = r.json()
        docs: list[dict[str, Any]] = []
        for row in payload.get("resultList", {}).get("result", []) or []:
            pmid = row.get("pmid") or ""
            pmcid = row.get("pmcid") or ""
            doi = row.get("doi") or ""
            title = row.get("title") or ""
            abstract = row.get("abstractText") or ""
            pub_date = row.get("firstPublicationDate") or row.get("journalInfo", {}).get("printPublicationDate") or ""
            doc_id = f"EPMC_{pmcid or pmid or doi or uuid.uuid4().hex[:10]}"
            source_url = row.get("fullTextUrlList", {}).get("fullTextUrl", [{}])[0].get("url") if row.get("fullTextUrlList") else ""
            if not source_url:
                source_url = f"https://europepmc.org/article/MED/{pmid}" if pmid else "https://europepmc.org/"
            doc = {
                "document_id": doc_id,
                "pmid": pmid,
                "pmcid": pmcid,
                "doi": doi,
                "title": title,
                "abstract": abstract,
                "publication_date": parse_date_loose(pub_date) or pub_date,
                "url": source_url,
                "query": query,
            }
            docs.append(doc)
            with db_conn() as conn:
                conn.execute(
                    """INSERT OR REPLACE INTO documents
                       (document_id,disease_id,snapshot_date,source,pmid,pmcid,doi,title,abstract,publication_date,
                        url,query_used,retrieved_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        doc_id, identity["disease_id"], snapshot_key(as_of_date), "Europe PMC", pmid, pmcid, doi,
                        title, abstract, doc["publication_date"], source_url, query, now_iso(),
                    ),
                )
        return docs, True, query
    except Exception as exc:
        return [], False, f"{query} [ERROR: {friendly_error(exc)}]"


def _split_windows(text: str, span: int = 1) -> list[str]:
    """Sentence-based evidence windows. A window is one sentence plus its
    immediate neighbors, so a qualifying phrase and the disease mention that
    licenses it must appear close together rather than merely somewhere in
    the same abstract."""
    compact = re.sub(r"\s+", " ", text or "").strip()
    if not compact:
        return []
    sentences = re.split(r"(?<=[.!?])\s+", compact)
    windows = []
    for i in range(len(sentences)):
        lo, hi = max(0, i - span), min(len(sentences), i + span + 1)
        windows.append(" ".join(sentences[lo:hi]))
    return windows or [compact]


def classify_type_b(feature_id: str, docs: list[dict[str, Any]], retrieval_success: bool,
                     disease_terms: Sequence[str] | None = None) -> dict[str, Any]:
    """Paired-condition, disease-proximate, exclusion-aware documentary
    classifier.

    Status meanings:
      CONFIRMED_PRESENT  every required evidence group co-occurs with a
                         disease-identifying term in the same window, in a
                         retrieved source, with no exclusion phrase present
                         in that same window.
      NOT_CONFIRMED      search ran but no window satisfied all conditions.
      UNASCERTAINED      retrieval failed, so no negative inference is allowed.

    This is a rules-based extractor operating on titles/abstracts only, not a
    validated high-precision classifier — its false-positive rate on any
    given feature should be checked against the human-reviewed validation
    sample (Validation tab) before being trusted for manuscript statistics.
    """
    if not retrieval_success:
        return {
            "status": "UNASCERTAINED", "value": None, "confidence": 0.0,
            "document_id": None, "snippet": "", "reason": "Document retrieval failed.",
            "retrieval_success": 0,
        }
    spec = TYPE_B_RULES[feature_id]
    groups = spec.get("groups") or [spec.get("must_any", [])]
    exclude = spec.get("exclude", [])
    disease_terms_lower = [t.lower() for t in (disease_terms or []) if t]

    candidates = []
    for doc in docs:
        title = doc.get("title", "") or ""
        abstract = doc.get("abstract", "") or ""
        title_has_disease = any(t in title.lower() for t in disease_terms_lower) if disease_terms_lower else True
        for section_name, section_text in (("abstract", abstract), ("title", title)):
            for window in _split_windows(section_text):
                lower = window.lower()
                # Disease-proximity check: the window itself must mention the
                # disease, unless the title already establishes the disease
                # as the article's subject (common for short single-topic
                # abstracts where the disease name isn't repeated every line).
                window_has_disease = any(t in lower for t in disease_terms_lower) if disease_terms_lower else True
                if not (window_has_disease or (title_has_disease and section_name == "abstract")):
                    continue
                if any(re.search(p, lower, re.I) for p in exclude):
                    continue  # exclusion phrase present in this window — disqualified regardless of other matches
                group_hits = []
                satisfied = True
                for group in groups:
                    hit = next((p for p in group if re.search(p, lower, re.I)), None)
                    if hit is None:
                        satisfied = False
                        break
                    group_hits.append(hit)
                if not satisfied:
                    continue
                specificity = min(0.97, 0.72 + 0.06 * len(groups) + (0.05 if section_name == "abstract" else 0.0)
                                   + (0.04 if window_has_disease else 0.0))
                candidates.append((specificity, len(window), doc, window, group_hits))

    if candidates:
        candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
        conf, _, doc, window, group_hits = candidates[0]
        return {
            "status": "CONFIRMED_PRESENT", "value": True, "confidence": round(conf, 3),
            "document_id": doc["document_id"], "snippet": window[:420],
            "reason": f"All {len(groups)} required condition group(s) co-occurred with a disease-identifying "
                      f"term in one evidence window, with no exclusion phrase present ({', '.join(group_hits)}).",
            "retrieval_success": 1,
        }
    return {
        "status": "NOT_CONFIRMED", "value": False, "confidence": 0.70,
        "document_id": docs[0]["document_id"] if docs else None,
        "snippet": docs[0].get("title", "") if docs else "No candidate documents retrieved.",
        "reason": "Search completed but no evidence window satisfied every required condition group "
                  "(with disease proximity and no exclusion phrase) under the prespecified rule.",
        "retrieval_success": 1,
    }


def run_type_b_retrieval(identity: dict[str, Any], as_of_date: str | None = None) -> dict[str, dict[str, Any]]:
    snap = snapshot_key(as_of_date)
    terms = disease_search_terms(identity)
    results: dict[str, dict[str, Any]] = {}
    for feature_id in TYPE_B_RULES:
        docs, ok, query = europe_pmc_search(identity, feature_id, as_of_date)
        result = classify_type_b(feature_id, docs, ok, disease_terms=terms)
        results[feature_id] = result
        with db_conn() as conn:
            conn.execute(
                """INSERT INTO feature_evidence
                   (disease_id,snapshot_date,feature_id,status,confidence,document_id,supporting_snippet,reason,
                    extractor_version,retrieval_success,reviewed,human_label,retrieved_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    identity["disease_id"], snap, feature_id, result["status"], result["confidence"],
                    result.get("document_id"), result.get("snippet"), result.get("reason"), EXTRACTOR_VERSION,
                    result.get("retrieval_success", 0), 0, None, now_iso(),
                ),
            )
        # Save the retrieval protocol itself as provenance.
        save_observation(identity["disease_id"], snap, f"search::{feature_id}", query, "query",
                         "Europe PMC REST API", source_url="https://europepmc.org/RestfulWebService", query_used=query)
    return results


# =============================================================================
# PubMed / NIH / FDA Type A retrieval
# =============================================================================


def fetch_pubmed_count(identity: dict[str, Any], as_of_date: str | None = None) -> int | None:
    terms = disease_search_terms(identity)
    disease_clause = " OR ".join(f'"{t}"[Title/Abstract]' for t in terms[:5])
    term = f"({disease_clause})"
    if as_of_date:
        y, m, d = as_of_date.split("-")
        term += f' AND ("1900/01/01"[Date - Publication] : "{y}/{m}/{d}"[Date - Publication])'
    try:
        r = HTTP.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "pubmed", "term": term, "retmode": "json", "retmax": 0}, timeout=20,
        )
        r.raise_for_status()
        count = int(r.json()["esearchresult"]["count"])
        save_observation(identity["disease_id"], snapshot_key(as_of_date), "pubmed_count", count, "count",
                         "NCBI PubMed E-utilities", query_used=term)
        return count
    except Exception:
        return None


def fetch_nih_funding(identity: dict[str, Any], as_of_date: str | None = None) -> dict[str, Any]:
    end_year = int(as_of_date[:4]) if as_of_date else datetime.now(timezone.utc).year
    years = list(range(end_year - 4, end_year + 1))
    rows = []
    offset = 0
    while offset < 2000:
        payload = {
            "criteria": {
                "advanced_text_search": {
                    "operator": "and", "search_field": "all", "search_text": identity["canonical_name"]
                },
                "fiscal_years": years,
            },
            "include_fields": ["ProjectNum", "AwardAmount", "FiscalYear", "Organization"],
            "offset": offset,
            "limit": 500,
        }
        try:
            r = HTTP.post("https://api.reporter.nih.gov/v2/projects/search", json=payload, timeout=30)
            r.raise_for_status()
            chunk = r.json().get("results", [])
            rows.extend(chunk)
            if len(chunk) < 500:
                break
            offset += 500
        except Exception:
            break
    funding = sum(int(x.get("award_amount") or 0) for x in rows)
    projects = len({x.get("project_num") or x.get("project_number") for x in rows if x.get("project_num") or x.get("project_number")})
    institutions = {
        (x.get("organization") or {}).get("org_name") for x in rows
        if isinstance(x.get("organization"), dict) and (x.get("organization") or {}).get("org_name")
    }
    values = {
        "nih_funded_projects": projects,
        "nih_funding_total": funding,
        "nih_funding_institutions": len(institutions),
    }
    for fid, value in values.items():
        save_observation(identity["disease_id"], snapshot_key(as_of_date), fid, value,
                         "usd" if fid == "nih_funding_total" else "count", "NIH RePORTER API v2",
                         query_used=identity["canonical_name"], metadata={"fiscal_years": years})
    return values


def fetch_fda_label_signal(identity: dict[str, Any]) -> dict[str, Any]:
    name = identity["canonical_name"]
    try:
        r = HTTP.get(
            "https://api.fda.gov/drug/label.json",
            params={"search": f'indications_and_usage:"{name}"', "limit": 100}, timeout=20,
        )
        if r.status_code == 404:
            values = {"count": 0, "earliest_effective_date": None, "brands": []}
        else:
            r.raise_for_status()
            payload = r.json()
            results = payload.get("results", [])
            dates = []
            brands = set()
            for row in results:
                eff = row.get("effective_time")
                if eff and re.match(r"^\d{8}$", str(eff)):
                    dates.append(f"{eff[:4]}-{eff[4:6]}-{eff[6:8]}")
                for b in row.get("openfda", {}).get("brand_name", []) or []:
                    brands.add(b)
            values = {
                "count": int(payload.get("meta", {}).get("results", {}).get("total", len(results))),
                "earliest_effective_date": min(dates) if dates else None,
                "brands": sorted(brands)[:20],
            }
    except Exception:
        values = {"count": None, "earliest_effective_date": None, "brands": []}
    save_observation(identity["disease_id"], CURRENT_SNAPSHOT, "fda_label_signal", values["count"], "count",
                     "openFDA drug labels", query_used=name,
                     metadata={"earliest_effective_date": values["earliest_effective_date"], "brands": values["brands"]})
    return values


def run_type_a_retrieval(identity: dict[str, Any], as_of_date: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    errors = []
    try:
        out["trials"] = fetch_clinical_trials(identity, as_of_date)
    except Exception as exc:
        errors.append(f"ClinicalTrials.gov: {friendly_error(exc)}")
        out["trials"] = {"values": {}, "records": [], "all_records": []}
    out["pubmed_count"] = fetch_pubmed_count(identity, as_of_date)
    try:
        out["nih"] = fetch_nih_funding(identity, as_of_date)
    except Exception as exc:
        errors.append(f"NIH RePORTER: {friendly_error(exc)}")
        out["nih"] = {}
    if not as_of_date:
        out["fda"] = fetch_fda_label_signal(identity)
    out["errors"] = errors
    return out


# =============================================================================
# Feature aggregation
# =============================================================================


def upsert_feature_value(
    disease_id: str, snap: str, feature_id: str, value: Any, status: str,
    confidence: float, source_count: int,
) -> None:
    spec = FEATURE_SPECS[feature_id]
    with db_conn() as conn:
        conn.execute(
            """INSERT INTO feature_values
               (disease_id,snapshot_date,feature_id,feature_type,final_value_json,status,evidence_confidence,source_count,last_updated)
               VALUES(?,?,?,?,?,?,?,?,?)
               ON CONFLICT(disease_id,snapshot_date,feature_id) DO UPDATE SET
                 feature_type=excluded.feature_type, final_value_json=excluded.final_value_json,
                 status=excluded.status, evidence_confidence=excluded.evidence_confidence,
                 source_count=excluded.source_count,last_updated=excluded.last_updated""",
            (disease_id, snap, feature_id, spec.feature_type, json_dumps(value), status, confidence, source_count, now_iso()),
        )


def aggregate_features(identity: dict[str, Any], as_of_date: str | None, type_a: dict[str, Any], type_b: dict[str, Any]) -> None:
    did = identity["disease_id"]
    snap = snapshot_key(as_of_date)
    tvals = (type_a.get("trials") or {}).get("values", {})
    nvals = type_a.get("nih") or {}

    numeric_map = {
        "trial_count": tvals.get("trial_count"),
        "completed_by_snapshot": tvals.get("completed_by_snapshot"),
        "highest_phase_by_snapshot": tvals.get("highest_phase_by_snapshot"),
        "median_enrollment": tvals.get("median_enrollment"),
        "unique_trial_sites": tvals.get("unique_trial_sites"),
        "unique_sponsors": tvals.get("unique_sponsors"),
        "industry_sponsors": tvals.get("industry_sponsors"),
        "industry_trials": tvals.get("industry_trials"),
        "nih_funded_projects": nvals.get("nih_funded_projects"),
        "nih_funding_total": nvals.get("nih_funding_total"),
        "nih_funding_institutions": nvals.get("nih_funding_institutions"),
    }
    if not as_of_date:
        numeric_map["fda_label_signal"] = (type_a.get("fda") or {}).get("count")

    for fid, value in numeric_map.items():
        if fid not in FEATURE_SPECS:
            continue
        upsert_feature_value(did, snap, fid, value,
                             "OBSERVED" if value is not None else "UNASCERTAINED",
                             1.0 if value is not None else 0.0, 1 if value is not None else 0)

    # Documentary feature results.
    for fid, result in type_b.items():
        if fid not in FEATURE_SPECS:
            continue
        upsert_feature_value(
            did, snap, fid, result.get("value"), result.get("status", "UNASCERTAINED"),
            float(result.get("confidence") or 0), 1 if result.get("document_id") else 0,
        )

    # ClinicalTrials structured evidence can upgrade biomarker evidence to positive.
    if tvals.get("biomarker_trial_signal"):
        upsert_feature_value(did, snap, "biomarker_in_trial", True, "CONFIRMED_PRESENT", 0.98, 1)


def build_disease_snapshot(
    disease_query: str,
    as_of_date: str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    identity = resolve_disease(disease_query)
    snap = snapshot_key(as_of_date)
    if snapshot_exists(identity["disease_id"], snap) and not force_refresh:
        return {"identity": identity, "snapshot": snap, "cached": True, "errors": []}
    type_a = run_type_a_retrieval(identity, as_of_date)
    type_b = run_type_b_retrieval(identity, as_of_date)
    aggregate_features(identity, as_of_date, type_a, type_b)
    return {
        "identity": identity,
        "snapshot": snap,
        "cached": False,
        "errors": type_a.get("errors", []),
        "type_a": type_a,
        "type_b": type_b,
    }


def load_feature_values(disease_id: str, snap: str) -> dict[str, dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM feature_values WHERE disease_id=? AND snapshot_date=?",
            (disease_id, snap),
        ).fetchall()
    return {
        r["feature_id"]: {
            "value": json_loads(r["final_value_json"]),
            "type": r["feature_type"],
            "status": r["status"],
            "confidence": r["evidence_confidence"],
            "source_count": r["source_count"],
        }
        for r in rows
    }


# =============================================================================
# Cohort-derived normalization and scoring
# =============================================================================


def cohort_id_for(diseases: Sequence[str], label: str = "cohort") -> str:
    normalized = "|".join(sorted(x.strip().lower() for x in diseases if x.strip()))
    import hashlib
    return f"{label}_{hashlib.sha1(normalized.encode()).hexdigest()[:10]}"


def get_disease_ids_for_names(names: Sequence[str]) -> list[str]:
    return [resolve_disease(x)["disease_id"] for x in names]


def fit_reference_stats(disease_ids: Sequence[str], snap: str, cohort_id: str) -> dict[str, list[float]]:
    stats: dict[str, list[float]] = {}
    for fid, spec in FEATURE_SPECS.items():
        if spec.feature_type != "A" or not spec.scoreable:
            continue
        vals = []
        for did in disease_ids:
            value = load_feature_values(did, snap).get(fid, {}).get("value")
            if isinstance(value, (int, float)) and not isinstance(value, bool) and np.isfinite(value):
                vals.append(float(value))
        stats[fid] = vals
        with db_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO reference_stats
                   (cohort_id,snapshot_date,feature_id,values_json,n,calculated_at) VALUES(?,?,?,?,?,?)""",
                (cohort_id, snap, fid, json_dumps(vals), len(vals), now_iso()),
            )
    return stats


def load_reference_stats(cohort_id: str, snap: str) -> dict[str, list[float]]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT feature_id,values_json FROM reference_stats WHERE cohort_id=? AND snapshot_date=?",
            (cohort_id, snap),
        ).fetchall()
    return {r["feature_id"]: [float(x) for x in json_loads(r["values_json"]) or []] for r in rows}


def empirical_risk(value: float, reference: Sequence[float], direction: str) -> float | None:
    if value is None or not reference:
        return None
    arr = np.array(reference, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size < 2:
        return 50.0
    # Mid-rank empirical percentile handles ties deterministically.
    less = np.sum(arr < value)
    equal = np.sum(arr == value)
    pct = (less + 0.5 * equal) / arr.size
    risk = (1 - pct) * 100 if direction == "favorable_high" else pct * 100
    return round(float(np.clip(risk, 0, 100)), 1)


def feature_risk(spec: FeatureSpec, value: Any, reference: Sequence[float] | None = None) -> float | None:
    if value is None or not spec.scoreable:
        return None
    if spec.feature_type == "B":
        # This is an evidence-presence score, not a claim of ontological absence.
        return 0.0 if value is True else 100.0 if value is False else None
    if spec.feature_type == "A" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return empirical_risk(float(value), reference or [], spec.direction)
    return None


def calculate_score_from_values(
    feature_values: dict[str, dict[str, Any]],
    reference_stats: dict[str, list[float]],
    domain_weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    domain_weights = domain_weights or {d: 1.0 for d in DOMAIN_LABELS}
    domain_signals: dict[str, list[tuple[str, float]]] = {d: [] for d in DOMAIN_LABELS}
    eligible = 0
    ascertained = 0
    evidence_features = 0
    positive_evidence = 0

    for fid, spec in FEATURE_SPECS.items():
        fv = feature_values.get(fid)
        if fv is None:
            continue
        eligible += 1
        value = fv.get("value")
        if value is not None:
            ascertained += 1
        if spec.feature_type == "B":
            evidence_features += 1
            if value is True:
                positive_evidence += 1
        risk = feature_risk(spec, value, reference_stats.get(fid, []))
        if risk is not None and spec.scoreable:
            domain_signals[spec.domain].append((fid, risk))

    domains: dict[str, float | None] = {}
    for domain, rows in domain_signals.items():
        domains[domain] = round(float(np.mean([r for _, r in rows])), 1) if rows else None

    available = {d: v for d, v in domains.items() if v is not None}
    if available:
        denom = sum(domain_weights.get(d, 1.0) for d in available)
        trs = sum(v * domain_weights.get(d, 1.0) / denom for d, v in available.items())
        trs = round(float(trs), 1)
    else:
        trs = None

    ascertainment = round(100 * ascertained / eligible, 1) if eligible else None
    evidence_coverage = round(100 * positive_evidence / evidence_features, 1) if evidence_features else None
    return {
        "domains": domains,
        "trs": trs,
        "ascertainment_completeness": ascertainment,
        "evidence_coverage": evidence_coverage,
        "domain_signals": domain_signals,
    }


def score_cohort(disease_ids: Sequence[str], snap: str, cohort_id: str) -> pd.DataFrame:
    refs = fit_reference_stats(disease_ids, snap, cohort_id)
    rows = []
    for did in disease_ids:
        fv = load_feature_values(did, snap)
        result = calculate_score_from_values(fv, refs)
        with db_conn() as conn:
            name = conn.execute("SELECT canonical_name FROM diseases WHERE disease_id=?", (did,)).fetchone()[0]
            conn.execute(
                """INSERT OR REPLACE INTO scores
                   (disease_id,snapshot_date,cohort_id,biological_risk,clinical_risk,regulatory_risk,economic_risk,
                    infrastructure_risk,composite_trs,ascertainment_completeness,evidence_coverage,model_version,calculated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    did, snap, cohort_id,
                    result["domains"]["biological"], result["domains"]["clinical"],
                    result["domains"]["regulatory"], result["domains"]["economic"],
                    result["domains"]["infrastructure"], result["trs"],
                    result["ascertainment_completeness"], result["evidence_coverage"], MODEL_VERSION, now_iso(),
                ),
            )
        rows.append({
            "Disease": name,
            "disease_id": did,
            "Biological": result["domains"]["biological"],
            "Clinical": result["domains"]["clinical"],
            "Regulatory": result["domains"]["regulatory"],
            "Economic": result["domains"]["economic"],
            "Infrastructure": result["domains"]["infrastructure"],
            "TRS": result["trs"],
            "Ascertainment completeness %": result["ascertainment_completeness"],
            "Evidence coverage %": result["evidence_coverage"],
        })
    return pd.DataFrame(rows)


# =============================================================================
# Outcome derivation
# =============================================================================


def derive_outcome(identity: dict[str, Any], index_date: str, followup_end: str) -> dict[str, Any]:
    """Automatically derive the primary robust outcome from trial timing.

    Primary robust signal: first Phase III study start in the follow-up window.
    Supplementary label signal: earliest effective_time from matching openFDA label records.
    The composite late_stage_advancement is Phase III OR the supplementary label signal.
    """
    trials = fetch_clinical_trials(identity, as_of_date=None)
    all_records = trials.get("all_records", [])
    phase3_dates = sorted(
        r["start_date"] for r in all_records
        if r.get("phase", 0) >= 3 and date_between(r.get("start_date"), index_date, followup_end)
    )
    fda = fetch_fda_label_signal(identity)
    eff = fda.get("earliest_effective_date")
    label_in_window = int(date_between(eff, index_date, followup_end)) if eff else 0
    phase3 = int(bool(phase3_dates))
    late = int(bool(phase3 or label_in_window))
    out = {
        "phase3_started": phase3,
        "late_stage_advancement": late,
        "approval_label_signal": label_in_window,
        "first_phase3_date": phase3_dates[0] if phase3_dates else None,
        "first_label_effective_date": eff if label_in_window else None,
    }
    with db_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO outcomes
               (disease_id,index_date,followup_end,phase3_started,late_stage_advancement,approval_label_signal,
                first_phase3_date,first_label_effective_date,outcome_source,calculated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                identity["disease_id"], index_date, followup_end, phase3, late, label_in_window,
                out["first_phase3_date"], out["first_label_effective_date"],
                "ClinicalTrials.gov API v2 + openFDA label signal", now_iso(),
            ),
        )
    return out


# =============================================================================
# Dataset assembly
# =============================================================================


def manuscript_dataset(cohort_id: str, snap: str, index_date: str, followup_end: str) -> pd.DataFrame:
    with db_conn() as conn:
        q = """
        SELECT d.canonical_name AS Disease, s.disease_id,
               s.biological_risk AS Biological, s.clinical_risk AS Clinical,
               s.regulatory_risk AS Regulatory, s.economic_risk AS Economic,
               s.infrastructure_risk AS Infrastructure, s.composite_trs AS TRS,
               s.ascertainment_completeness AS AscertainmentCompleteness,
               s.evidence_coverage AS EvidenceCoverage,
               o.phase3_started AS Phase3Outcome,
               o.late_stage_advancement AS LateStageOutcome,
               o.approval_label_signal AS ApprovalLabelSignal
        FROM scores s
        JOIN diseases d ON d.disease_id=s.disease_id
        LEFT JOIN outcomes o ON o.disease_id=s.disease_id AND o.index_date=? AND o.followup_end=?
        WHERE s.cohort_id=? AND s.snapshot_date=? AND s.model_version=?
        ORDER BY s.composite_trs
        """
        return pd.read_sql_query(q, conn, params=(index_date, followup_end, cohort_id, snap, MODEL_VERSION))


def provenance_table(disease_id: str, snap: str) -> pd.DataFrame:
    """Reporting-only — never used by scoring. Type B rows are LEFT JOINed against
    `documents` so the UI can show the actual PubMed/PMC link and title a classification
    decision was based on, not just the opaque internal document_id. Also carries
    extractor_version per Type B row, since a feature dictionary/rule change can leave
    old and new evidence side by side for the same disease until a wipe+rebuild."""
    with db_conn() as conn:
        obs = pd.read_sql_query(
            """SELECT feature_id AS Variable, raw_value_json AS Value, source AS Source, source_url AS URL,
                      source_date AS SourceDate, retrieved_at AS Retrieved, query_used AS Query, 'A' AS Type,
                      '' AS DocTitle, NULL AS ExtractorVersion
               FROM raw_observations WHERE disease_id=? AND snapshot_date=?""",
            conn, params=(disease_id, snap),
        )
        ev = pd.read_sql_query(
            """SELECT e.feature_id AS Variable, e.status AS Value,
                      CASE WHEN d.pmid != '' THEN 'PubMed PMID:' || d.pmid
                           WHEN d.pmcid != '' THEN 'PMC:' || d.pmcid
                           ELSE COALESCE(e.document_id, '') END AS Source,
                      COALESCE(d.url, '') AS URL, COALESCE(d.publication_date, '') AS SourceDate,
                      e.retrieved_at AS Retrieved, e.supporting_snippet AS Query, 'B' AS Type,
                      COALESCE(d.title, '') AS DocTitle, e.extractor_version AS ExtractorVersion
               FROM feature_evidence e
               LEFT JOIN documents d ON d.document_id = e.document_id AND d.disease_id = e.disease_id
                                        AND d.snapshot_date = e.snapshot_date
               WHERE e.disease_id=? AND e.snapshot_date=?""",
            conn, params=(disease_id, snap),
        )
    return pd.concat([obs, ev], ignore_index=True)


# =============================================================================
# Model analysis
# =============================================================================


def _bootstrap_auc(y: np.ndarray, p: np.ndarray, n_boot: int = 1000, seed: int = 42) -> tuple[float, float] | tuple[None, None]:
    if not SKLEARN_AVAILABLE:
        return None, None
    rng = np.random.default_rng(seed)
    aucs = []
    n = len(y)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        if len(np.unique(y[idx])) < 2:
            continue
        aucs.append(roc_auc_score(y[idx], p[idx]))
    if not aucs:
        return None, None
    return float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))


def _cv_predictions(X: pd.DataFrame, y: pd.Series) -> np.ndarray:
    counts = y.value_counts()
    min_class = int(counts.min()) if len(counts) >= 2 else 0
    model = Pipeline([
        ("scale", StandardScaler()),
        ("logit", LogisticRegression(max_iter=5000, penalty="l2", C=1.0, class_weight="balanced")),
    ])
    if min_class >= 3:
        splits = min(5, min_class)
        cv = StratifiedKFold(n_splits=splits, shuffle=True, random_state=42)
    else:
        cv = LeaveOneOut()
    return cross_val_predict(model, X, y, cv=cv, method="predict_proba")[:, 1]


def evaluate_model(df: pd.DataFrame, features: list[str], outcome: str) -> dict[str, Any]:
    if not SKLEARN_AVAILABLE:
        return {"features": features, "n": 0, "error": "scikit-learn is not installed — run: pip install scikit-learn"}
    sub = df[features + [outcome]].dropna().copy()
    if len(sub) < 8 or sub[outcome].nunique() < 2:
        return {"features": features, "n": len(sub), "error": "Insufficient data/classes"}
    X = sub[features].astype(float)
    y = sub[outcome].astype(int)
    try:
        p = _cv_predictions(X, y)
        auc = float(roc_auc_score(y, p))
        lo, hi = _bootstrap_auc(y.to_numpy(), p)
        brier = float(brier_score_loss(y, p))
        pred = (p >= 0.5).astype(int)
        return {
            "features": features,
            "n": len(sub),
            "events": int(y.sum()),
            "auc": auc,
            "auc_ci_low": lo,
            "auc_ci_high": hi,
            "brier": brier,
            "accuracy": float(accuracy_score(y, pred)),
            "precision": float(precision_score(y, pred, zero_division=0)),
            "recall": float(recall_score(y, pred, zero_division=0)),
            "y": y.tolist(),
            "p": p.tolist(),
            "index": sub.index.tolist(),
        }
    except Exception as exc:
        return {"features": features, "n": len(sub), "error": str(exc)}


def univariate_logit(df: pd.DataFrame, predictor: str, outcome: str) -> dict[str, Any]:
    sub = df[[predictor, outcome]].dropna().copy()
    if len(sub) < 8 or sub[outcome].nunique() < 2:
        return {"predictor": predictor, "n": len(sub), "error": "Insufficient data"}
    x = sub[predictor].astype(float)
    y = sub[outcome].astype(int)
    # scale by 10 points for interpretable ORs
    x10 = x / 10.0
    if not sm and not SKLEARN_AVAILABLE:
        return {"predictor": predictor, "n": len(sub), "error": "Neither statsmodels nor scikit-learn is installed"}
    if sm is not None:
        try:
            X = sm.add_constant(x10)
            model = sm.Logit(y, X).fit(disp=False)
            beta = float(model.params.iloc[1])
            se = float(model.bse.iloc[1])
            return {
                "predictor": predictor,
                "n": len(sub),
                "odds_ratio_per_10": float(math.exp(beta)),
                "ci_low": float(math.exp(beta - 1.96 * se)),
                "ci_high": float(math.exp(beta + 1.96 * se)),
                "p_value": float(model.pvalues.iloc[1]),
            }
        except Exception:
            pass
    # fallback sklearn coefficient without inferential p-value
    if not SKLEARN_AVAILABLE:
        return {"predictor": predictor, "n": len(sub), "error": "statsmodels fit failed and scikit-learn is not installed"}
    try:
        m = LogisticRegression(max_iter=5000).fit(x10.to_numpy().reshape(-1, 1), y)
        return {
            "predictor": predictor, "n": len(sub),
            "odds_ratio_per_10": float(math.exp(m.coef_[0, 0])),
            "ci_low": None, "ci_high": None, "p_value": None,
        }
    except Exception as exc:
        return {"predictor": predictor, "n": len(sub), "error": str(exc)}


def run_manuscript_analyses(df: pd.DataFrame, outcome: str = "Phase3Outcome") -> dict[str, Any]:
    models = {
        "TRS": evaluate_model(df, ["TRS"], outcome),
        "EvidenceCoverage": evaluate_model(df, ["EvidenceCoverage"], outcome),
        "TRS+EvidenceCoverage": evaluate_model(df, ["TRS", "EvidenceCoverage"], outcome),
        "FiveDomains": evaluate_model(df, ["Biological", "Clinical", "Regulatory", "Economic", "Infrastructure"], outcome),
    }
    univariates = [
        univariate_logit(df, pred, outcome)
        for pred in ["TRS", "EvidenceCoverage", "AscertainmentCompleteness", "Biological", "Clinical", "Regulatory", "Economic", "Infrastructure"]
    ]
    correlations = df[["TRS", "EvidenceCoverage", "AscertainmentCompleteness", "Biological", "Clinical", "Regulatory", "Economic", "Infrastructure"]].corr(numeric_only=True)
    return {
        "outcome": outcome,
        "n_total": int(len(df)),
        "n_outcomes": int(df[outcome].notna().sum()) if outcome in df else 0,
        "events": int(df[outcome].fillna(0).sum()) if outcome in df else 0,
        "models": models,
        "univariate": univariates,
        "correlations": correlations.to_dict(),
    }


def fit_final_probability_model(df: pd.DataFrame, outcome: str = "Phase3Outcome") -> tuple[Any, list[str]] | tuple[None, list[str]]:
    features = ["TRS", "EvidenceCoverage"]
    if not SKLEARN_AVAILABLE:
        return None, features
    sub = df[features + [outcome]].dropna()
    if len(sub) < 10 or sub[outcome].nunique() < 2:
        return None, features
    model = Pipeline([
        ("scale", StandardScaler()),
        ("logit", LogisticRegression(max_iter=5000, penalty="l2", C=1.0, class_weight="balanced")),
    ])
    model.fit(sub[features].astype(float), sub[outcome].astype(int))
    return model, features


# =============================================================================
# Counterfactual analysis
# =============================================================================


def counterfactual_for_feature(
    disease_id: str,
    snap: str,
    cohort_id: str,
    feature_id: str,
    fitted_model: Any = None,
    model_features: list[str] | None = None,
    observed_dataset_row: pd.Series | None = None,
) -> dict[str, Any]:
    refs = load_reference_stats(cohort_id, snap)
    fv = load_feature_values(disease_id, snap)
    spec = FEATURE_SPECS[feature_id]
    observed = fv.get(feature_id, {}).get("value")
    if not spec.modifiable:
        raise ValueError(f"{feature_id} is not modifiable")
    if observed is True:
        return {"feature_id": feature_id, "eligible": False, "reason": "Already present"}

    baseline = calculate_score_from_values(fv, refs)
    scenario_fv = {k: dict(v) for k, v in fv.items()}
    scenario_fv.setdefault(feature_id, {"value": None, "status": "SCENARIO", "type": spec.feature_type})
    if spec.feature_type == "B":
        scenario_fv[feature_id]["value"] = True
        scenario_value = True
    else:
        # Count-based counterfactual target: median among upper half of reference distribution.
        arr = refs.get(feature_id, [])
        if not arr:
            return {"feature_id": feature_id, "eligible": False, "reason": "No cohort reference"}
        target = float(np.percentile(arr, 75))
        scenario_fv[feature_id]["value"] = target
        scenario_value = target

    scenario = calculate_score_from_values(scenario_fv, refs)
    delta_trs = None if baseline["trs"] is None or scenario["trs"] is None else round(scenario["trs"] - baseline["trs"], 2)

    base_prob = scen_prob = delta_prob = None
    if fitted_model is not None and observed_dataset_row is not None and model_features:
        base_row = observed_dataset_row.copy()
        scen_row = observed_dataset_row.copy()
        # Model currently uses TRS and EvidenceCoverage; update both from scenario.
        if "TRS" in model_features:
            scen_row["TRS"] = scenario["trs"]
        if "EvidenceCoverage" in model_features:
            scen_row["EvidenceCoverage"] = scenario["evidence_coverage"]
        try:
            base_prob = float(fitted_model.predict_proba(pd.DataFrame([[base_row[f] for f in model_features]], columns=model_features))[0, 1])
            scen_prob = float(fitted_model.predict_proba(pd.DataFrame([[scen_row[f] for f in model_features]], columns=model_features))[0, 1])
            delta_prob = scen_prob - base_prob
        except Exception:
            pass

    cfid = f"CF_{uuid.uuid4().hex[:12]}"
    with db_conn() as conn:
        conn.execute(
            """INSERT INTO counterfactual_runs
               (counterfactual_id,disease_id,snapshot_date,cohort_id,feature_changed,observed_value_json,
                scenario_value_json,baseline_trs,scenario_trs,delta_trs,baseline_probability,scenario_probability,
                delta_probability,model_id,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                cfid, disease_id, snap, cohort_id, feature_id, json_dumps(observed), json_dumps(scenario_value),
                baseline["trs"], scenario["trs"], delta_trs, base_prob, scen_prob, delta_prob,
                "TRS+EvidenceCoverage" if fitted_model is not None else MODEL_VERSION, now_iso(),
            ),
        )
    return {
        "counterfactual_id": cfid,
        "feature_id": feature_id,
        "label": spec.label,
        "eligible": True,
        "observed": observed,
        "scenario": scenario_value,
        "baseline_trs": baseline["trs"],
        "scenario_trs": scenario["trs"],
        "delta_trs": delta_trs,
        "baseline_probability": base_prob,
        "scenario_probability": scen_prob,
        "delta_probability": delta_prob,
    }


def rank_counterfactuals(
    disease_id: str, snap: str, cohort_id: str, fitted_model: Any = None,
    model_features: list[str] | None = None, observed_dataset_row: pd.Series | None = None,
) -> pd.DataFrame:
    rows = []
    for fid, spec in FEATURE_SPECS.items():
        if spec.modifiable and spec.feature_type == "B":
            try:
                res = counterfactual_for_feature(
                    disease_id, snap, cohort_id, fid, fitted_model, model_features, observed_dataset_row
                )
                if res.get("eligible"):
                    rows.append(res)
            except Exception:
                continue
    df = pd.DataFrame(rows)
    if len(df):
        if df["delta_probability"].notna().any():
            df = df.sort_values("delta_probability", ascending=False)
        else:
            df = df.sort_values("delta_trs", ascending=True)
    return df


def cohort_counterfactual_analysis(
    dataset: pd.DataFrame, snap: str, cohort_id: str, outcome: str = "Phase3Outcome", top_fraction: float = 0.25
) -> pd.DataFrame:
    work = dataset.dropna(subset=["TRS"]).copy()
    if work.empty:
        return pd.DataFrame()
    threshold = work["TRS"].quantile(1 - top_fraction)
    high = work[work["TRS"] >= threshold].copy()
    fitted, feats = fit_final_probability_model(dataset, outcome)
    all_rows = []
    for _, row in high.iterrows():
        cf = rank_counterfactuals(row["disease_id"], snap, cohort_id, fitted, feats, row)
        if cf.empty:
            continue
        cf.insert(0, "Disease", row["Disease"])
        cf["rank"] = np.arange(1, len(cf) + 1)
        all_rows.append(cf)
    return pd.concat(all_rows, ignore_index=True) if all_rows else pd.DataFrame()


# =============================================================================
# Type B validation sampling
# =============================================================================


def validation_sample(n: int = 100, seed: int = 42, per_feature: int | None = None) -> pd.DataFrame:
    """Sample of retrieval-successful feature_evidence rows for human QA review.

    Stratified by feature_id (roughly `n` divided across every Type B feature, or an
    explicit `per_feature` count) rather than uniform-random across all evidence rows.
    Uniform sampling would let high-volume features dominate the sample and leave
    low-volume ones with too few labels to compute a meaningful per-feature
    precision/recall — see extractor_validation_metrics()'s `by_feature` breakdown,
    which this sampling strategy exists to support.
    """
    with db_conn() as conn:
        df = pd.read_sql_query(
            """SELECT e.evidence_id,d.canonical_name AS Disease,e.snapshot_date,e.feature_id,e.status,e.confidence,
                      e.supporting_snippet,e.document_id,e.reviewed,e.human_label,e.human_note,
                      e.extractor_version,
                      COALESCE(doc.title,'') AS source_title, COALESCE(doc.url,'') AS source_url,
                      COALESCE(doc.pmid,'') AS pmid, COALESCE(doc.pmcid,'') AS pmcid,
                      COALESCE(doc.doi,'') AS doi
               FROM feature_evidence e
               JOIN diseases d ON d.disease_id=e.disease_id
               LEFT JOIN documents doc ON doc.document_id=e.document_id AND doc.disease_id=e.disease_id
                                          AND doc.snapshot_date=e.snapshot_date
               WHERE e.retrieval_success=1""",
            conn,
        )
    if df.empty:
        return df
    n_features = df["feature_id"].nunique()
    target = per_feature or max(1, n // max(1, n_features))
    # Explicit per-group sample + concat rather than groupby(...).apply(...): pandas
    # 2.2+ can silently drop the grouping column from what's passed to the callback
    # (the "exclude grouping columns" behavior change), which would strip feature_id
    # out of the result — this loop sidesteps that entirely.
    parts = [g.sample(n=min(len(g), target), random_state=seed) for _, g in df.groupby("feature_id")]
    return pd.concat(parts, ignore_index=True) if parts else df.iloc[0:0]


# =============================================================================
# Locked manuscript validation sample
#
# Approved protocol (see docs/MANUSCRIPT_REQUIREMENTS.md): validate the extractor
# against the exact evidence the frozen 100-disease dataset's TRS scores are built
# from — the historical 2015-12-31 snapshot only, not the live public-site snapshot —
# stratified by feature_id AND, where feasible, by the extractor's own predicted class
# (CONFIRMED_PRESENT / NOT_CONFIRMED), so a feature's per-class precision/recall isn't
# built from a near-single-class sample. This is a fixed, named protocol (not a
# general-purpose parameterized tool) precisely so the sample used for the manuscript
# validation claim can't silently drift mid-review.
# =============================================================================

MANUSCRIPT_VALIDATION_SNAPSHOT = "2015-12-31"
MANUSCRIPT_VALIDATION_PER_FEATURE = 20
MANUSCRIPT_VALIDATION_PER_CLASS_TARGET = 10
MANUSCRIPT_VALIDATION_SEED = 42


def manuscript_validation_plan(seed: int = MANUSCRIPT_VALIDATION_SEED) -> dict[str, Any]:
    """Per-feature eligible CONFIRMED_PRESENT/NOT_CONFIRMED counts in the historical
    snapshot, and the proposed sampled count of each — computed but not yet drawn.
    Where one class has fewer than MANUSCRIPT_VALIDATION_PER_CLASS_TARGET eligible rows,
    all of it is taken (never duplicated/fabricated) and the shortfall is filled from
    the other class up to MANUSCRIPT_VALIDATION_PER_FEATURE, not silently dropped."""
    with db_conn() as conn:
        df = pd.read_sql_query(
            """SELECT feature_id, status, COUNT(*) AS n FROM feature_evidence
               WHERE retrieval_success=1 AND snapshot_date=?
               GROUP BY feature_id, status""",
            conn, params=(MANUSCRIPT_VALIDATION_SNAPSHOT,),
        )
    counts = {fid: {"CONFIRMED_PRESENT": 0, "NOT_CONFIRMED": 0} for fid in TYPE_B_RULES}
    for _, row in df.iterrows():
        if row["feature_id"] in counts and row["status"] in ("CONFIRMED_PRESENT", "NOT_CONFIRMED"):
            counts[row["feature_id"]][row["status"]] = int(row["n"])

    per_class_target = MANUSCRIPT_VALIDATION_PER_CLASS_TARGET
    total_target = MANUSCRIPT_VALIDATION_PER_FEATURE
    rows = []
    for fid in sorted(counts):
        eligible_cp = counts[fid]["CONFIRMED_PRESENT"]
        eligible_nc = counts[fid]["NOT_CONFIRMED"]
        base_cp = min(per_class_target, eligible_cp)
        base_nc = min(per_class_target, eligible_nc)
        shortfall = total_target - base_cp - base_nc
        add_cp = min(shortfall, eligible_cp - base_cp) if shortfall > 0 else 0
        shortfall -= add_cp
        add_nc = min(shortfall, eligible_nc - base_nc) if shortfall > 0 else 0
        sampled_cp = base_cp + add_cp
        sampled_nc = base_nc + add_nc
        limitation = None
        if eligible_cp < per_class_target or eligible_nc < per_class_target:
            scarce = "CONFIRMED_PRESENT" if eligible_cp < eligible_nc else "NOT_CONFIRMED"
            limitation = (
                f"{scarce} is scarce ({eligible_cp if scarce=='CONFIRMED_PRESENT' else eligible_nc} "
                f"eligible) — sampled all available rather than fabricating balance; "
                f"remainder filled from the other class."
            )
        rows.append({
            "feature_id": fid,
            "eligible_confirmed_present": eligible_cp,
            "eligible_not_confirmed": eligible_nc,
            "sampled_confirmed_present": sampled_cp,
            "sampled_not_confirmed": sampled_nc,
            "sampled_total": sampled_cp + sampled_nc,
            "limitation": limitation,
        })
    return {
        "snapshot_date": MANUSCRIPT_VALIDATION_SNAPSHOT,
        "extractor_version": EXTRACTOR_VERSION,
        "per_feature_target": total_target,
        "per_class_target": per_class_target,
        "total_target": total_target * len(counts),
        "total_proposed": sum(r["sampled_total"] for r in rows),
        "seed": seed,
        "features": rows,
    }


def manuscript_validation_sample(seed: int = MANUSCRIPT_VALIDATION_SEED) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Draws the locked manuscript validation sample per manuscript_validation_plan()
    — feature- and predicted-class-stratified, historical-snapshot-only, deterministic
    for the fixed seed. Returns (rows, plan) so the caller can show the plan alongside
    the actual rows without a second query."""
    plan = manuscript_validation_plan(seed)
    with db_conn() as conn:
        df = pd.read_sql_query(
            """SELECT e.evidence_id,d.canonical_name AS Disease,e.snapshot_date,e.feature_id,e.status,e.confidence,
                      e.supporting_snippet,e.document_id,e.reviewed,e.human_label,e.human_note,
                      e.extractor_version,
                      COALESCE(doc.title,'') AS source_title, COALESCE(doc.url,'') AS source_url,
                      COALESCE(doc.pmid,'') AS pmid, COALESCE(doc.pmcid,'') AS pmcid,
                      COALESCE(doc.doi,'') AS doi
               FROM feature_evidence e
               JOIN diseases d ON d.disease_id=e.disease_id
               LEFT JOIN documents doc ON doc.document_id=e.document_id AND doc.disease_id=e.disease_id
                                          AND doc.snapshot_date=e.snapshot_date
               WHERE e.retrieval_success=1 AND e.snapshot_date=?""",
            conn, params=(MANUSCRIPT_VALIDATION_SNAPSHOT,),
        )
    if df.empty:
        return df, plan

    parts = []
    for row in plan["features"]:
        fid = row["feature_id"]
        sub = df[df["feature_id"] == fid]
        cp_pool = sub[sub["status"] == "CONFIRMED_PRESENT"]
        nc_pool = sub[sub["status"] == "NOT_CONFIRMED"]
        if row["sampled_confirmed_present"]:
            parts.append(cp_pool.sample(n=row["sampled_confirmed_present"], random_state=seed))
        if row["sampled_not_confirmed"]:
            parts.append(nc_pool.sample(n=row["sampled_not_confirmed"], random_state=seed))
    sampled = pd.concat(parts, ignore_index=True) if parts else df.iloc[0:0]
    return sampled, plan


VALID_HUMAN_LABELS = ("CONFIRMED_PRESENT", "NOT_CONFIRMED", "AMBIGUOUS")


def save_human_validation(evidence_id: int, human_label: str, note: str | None = None) -> None:
    """AMBIGUOUS means the reviewer could not confidently apply CONFIRMED_PRESENT or
    NOT_CONFIRMED to this snippet — it's excluded from the confusion matrix in
    extractor_validation_metrics() (not counted as agreement or disagreement) rather
    than forced into a binary judgment that would misrepresent the review."""
    with db_conn() as conn:
        conn.execute(
            "UPDATE feature_evidence SET reviewed=1,human_label=?,human_note=? WHERE evidence_id=?",
            (human_label, note, evidence_id),
        )


def validation_export() -> pd.DataFrame:
    """Every reviewed (human-labeled) row with full context, for a manuscript
    validation supplement — disease, feature, machine prediction, human label/note,
    evidence snippet, source. Reporting-only; never used by scoring."""
    with db_conn() as conn:
        return pd.read_sql_query(
            """SELECT e.evidence_id, d.canonical_name AS disease, e.feature_id, e.snapshot_date,
                      e.status AS machine_status, e.confidence AS machine_confidence,
                      e.human_label, e.human_note, e.supporting_snippet, e.extractor_version,
                      COALESCE(doc.title,'') AS source_title, COALESCE(doc.url,'') AS source_url,
                      COALESCE(doc.pmid,'') AS pmid, COALESCE(doc.pmcid,'') AS pmcid,
                      COALESCE(doc.doi,'') AS doi
               FROM feature_evidence e
               JOIN diseases d ON d.disease_id=e.disease_id
               LEFT JOIN documents doc ON doc.document_id=e.document_id AND doc.disease_id=e.disease_id
                                          AND doc.snapshot_date=e.snapshot_date
               WHERE e.reviewed=1 AND e.human_label IS NOT NULL
               ORDER BY d.canonical_name, e.feature_id""",
            conn,
        )


# =============================================================================
# Validation label import/restore
#
# Restores human_label/human_note for rows already inside the locked manuscript
# validation sample (manuscript_validation_sample()) from a previously exported CSV —
# e.g. after losing application state before running the export. This ONLY ever writes
# feature_evidence.reviewed/human_label/human_note via the same save_human_validation()
# path a normal UI label-click uses. It never touches diseases, raw_observations,
# feature_values, scores, or the cohort/snapshot definition, and never re-samples —
# every row is checked against the CURRENT frozen sample (recomputed deterministically,
# not stored) before being accepted.
# =============================================================================

_IMPORT_REQUIRED_COLUMNS = ("evidence_id", "human_label")


def _frozen_sample_lookup() -> dict[int, dict[str, Any]]:
    """evidence_id -> {feature_id, Disease, snapshot_date, status} for every row in the
    CURRENT locked manuscript validation sample. Deterministic (fixed seed) — this is
    recomputed on every call, never cached/stored, so an import always checks against
    the sample as it exists right now, not a stale copy."""
    rows, _plan = manuscript_validation_sample()
    if rows.empty:
        return {}
    return {
        int(r["evidence_id"]): {
            "feature_id": r["feature_id"], "Disease": r["Disease"],
            "snapshot_date": r["snapshot_date"], "status": r["status"],
        }
        for _, r in rows.iterrows()
    }


def _historical_evidence_lookup() -> dict[tuple[str, str], dict[str, Any]]:
    """(disease name lowercased, feature_id) -> {evidence_id, status} for every eligible
    row in the historical 2015-12-31 snapshot — the FULL pool (1,700 rows), not just the
    340 currently sampled.

    `evidence_id` is an autoincrement surrogate key: it is NOT portable across separate
    database instances/runs. Two independent pipeline runs over the same cohort produce
    the same *content* (same disease+feature+snapshot classifications, assuming the
    extractor version and the underlying literature haven't changed) but different
    row-insertion order, hence different evidence_id numbers. A CSV exported from a
    different database instance than the one currently running will have evidence_ids
    that don't resolve — this natural key (disease, feature_id) is what actually
    identifies a Type B decision conceptually, and is what import_validation_csv() falls
    back to when the surrogate id doesn't match."""
    with db_conn() as conn:
        df = pd.read_sql_query(
            """SELECT e.evidence_id, d.canonical_name AS Disease, e.feature_id, e.status
               FROM feature_evidence e JOIN diseases d ON d.disease_id=e.disease_id
               WHERE e.retrieval_success=1 AND e.snapshot_date=?""",
            conn, params=(MANUSCRIPT_VALIDATION_SNAPSHOT,),
        )
    return {
        (str(r["Disease"]).strip().lower(), r["feature_id"]): {"evidence_id": int(r["evidence_id"]), "status": r["status"]}
        for _, r in df.iterrows()
    }


def import_validation_csv(
    df: pd.DataFrame, overwrite_conflicts: bool = False, dry_run: bool = True
) -> dict[str, Any]:
    """Validate (and optionally apply) a restore of human validation labels from an
    exported CSV. Matching is two-tiered because `evidence_id` is an autoincrement
    surrogate key, not portable across separate database instances/runs — a CSV
    exported from a different backend instance (a redeploy, a different machine, a
    reset local database) than the one currently running will have evidence_ids that
    simply don't exist here anymore, even though the underlying disease+feature
    evidence is identical:

      1. Try the CSV's own `evidence_id` against the current frozen sample directly.
      2. If that doesn't resolve, fall back to the natural key — (disease, feature_id)
         — against the full historical evidence pool (not just the 340 sampled rows),
         using whichever *current* evidence_id now represents that same conceptual
         decision.

    Every row is classified into exactly one bucket:

      importable            new match (via either method), not yet reviewed
      identical              already reviewed with this exact label (no-op, still restored)
      conflict                already reviewed with a DIFFERENT label — only written if overwrite_conflicts
      duplicate               two rows in this CSV resolve to the same current evidence_id
      unmatched               no evidence_id or (disease, feature_id) match exists at all
      outside_current_sample  real historical evidence, correctly matched, but not part of
                               the CURRENT 340-row locked sample (a different random subset
                               was drawn this time) — never written; the locked sample is
                               not expanded to accommodate it
      invalid_label           human_label isn't CONFIRMED_PRESENT/NOT_CONFIRMED/AMBIGUOUS

    Only `importable`, `identical`, and (if overwrite_conflicts) `conflict` rows are ever
    written, and only when dry_run=False. Nothing is written on a dry run.
    """
    missing_cols = [c for c in _IMPORT_REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        return {
            "ok": False,
            "error": f"CSV is missing required column(s): {', '.join(missing_cols)}. "
                     f"Expected at least: {', '.join(_IMPORT_REQUIRED_COLUMNS)}.",
        }

    frozen = _frozen_sample_lookup()
    historical = _historical_evidence_lookup()
    can_fallback = "disease" in df.columns and "feature_id" in df.columns

    with db_conn() as conn:
        existing_rows = conn.execute(
            "SELECT evidence_id, human_label, human_note FROM feature_evidence WHERE reviewed=1"
        ).fetchall()
    existing = {int(r["evidence_id"]): {"human_label": r["human_label"], "human_note": r["human_note"]} for r in existing_rows}

    raw_eids = pd.to_numeric(df["evidence_id"], errors="coerce")
    raw_dup_ids = set(raw_eids[raw_eids.notna() & raw_eids.duplicated(keep=False)].tolist())

    buckets: dict[str, list[dict[str, Any]]] = {
        "importable": [], "identical": [], "conflict": [], "duplicate": [],
        "unmatched": [], "outside_current_sample": [], "invalid_label": [],
    }
    to_write: list[tuple[int, str, str | None]] = []
    resolved_seen: set[int] = set()

    for _, row in df.iterrows():
        raw_eid = row.get("evidence_id")
        label = row.get("human_label")
        note = row.get("human_note") if "human_note" in df.columns else None
        note = None if (note is None or (isinstance(note, float) and pd.isna(note))) else str(note)
        detail: dict[str, Any] = {"evidence_id": raw_eid, "human_label": label}

        if not isinstance(label, str) or label not in VALID_HUMAN_LABELS:
            buckets["invalid_label"].append({**detail, "reason": f"human_label must be one of {VALID_HUMAN_LABELS}."})
            continue

        try:
            eid = int(raw_eid)
        except (TypeError, ValueError):
            eid = None

        if eid is not None and eid in raw_dup_ids:
            buckets["duplicate"].append({**detail, "reason": "This evidence_id appears more than once in the CSV itself."})
            continue

        resolved_eid: int | None = None
        resolved_status: str | None = None
        match_source: str | None = None

        # A direct evidence_id hit is only trusted if the CSV's own claimed
        # disease/feature_id (when present) actually agree with what that id
        # currently represents. evidence_id is a reshuffle-prone surrogate key
        # (see module docstring above) — an id existing in the frozen sample does
        # NOT by itself mean it still means what the CSV thinks it means. A prior
        # version of this function trusted a direct hit unconditionally, which
        # silently attached a real reviewer's label to the wrong disease/feature
        # whenever ids had drifted; caught via a duplicate-collision case in
        # practice, but content mismatches without a collision would have gone
        # undetected. Falling through to the natural-key path on any mismatch
        # instead of accepting a blind numeric coincidence.
        frozen_row = frozen.get(eid) if eid is not None else None
        if frozen_row is not None:
            csv_disease = row.get("disease") if "disease" in df.columns else None
            csv_feature = row.get("feature_id") if "feature_id" in df.columns else None
            disease_ok = pd.isna(csv_disease) or str(csv_disease).strip().lower() == str(frozen_row["Disease"]).strip().lower()
            feature_ok = pd.isna(csv_feature) or str(csv_feature) == str(frozen_row["feature_id"])
            if disease_ok and feature_ok:
                resolved_eid, resolved_status, match_source = eid, frozen_row["status"], "evidence_id"

        if resolved_eid is None and can_fallback:
            csv_disease = row.get("disease")
            csv_feature = row.get("feature_id")
            if pd.notna(csv_disease) and pd.notna(csv_feature):
                hist_row = historical.get((str(csv_disease).strip().lower(), str(csv_feature)))
                if hist_row is not None:
                    resolved_eid, resolved_status, match_source = hist_row["evidence_id"], hist_row["status"], "disease+feature_id"

        if resolved_eid is None:
            buckets["unmatched"].append({
                **detail,
                "reason": "No evidence_id match, and no (disease, feature_id) fallback match either — "
                          "this row doesn't correspond to any evidence in the current historical snapshot.",
            })
            continue

        if resolved_eid in resolved_seen:
            buckets["duplicate"].append({**detail, "reason": f"Resolves to the same current evidence_id ({resolved_eid}) as an earlier row in this CSV."})
            continue
        resolved_seen.add(resolved_eid)

        status_note = None
        if "machine_status" in df.columns:
            csv_status = row.get("machine_status")
            if pd.notna(csv_status) and resolved_status is not None and str(csv_status) != resolved_status:
                status_note = f"Extractor status changed since this was labeled (was {csv_status}, now {resolved_status})."

        if resolved_eid not in frozen:
            buckets["outside_current_sample"].append({
                **detail,
                "reason": f"Matched via {match_source} to evidence_id {resolved_eid} — real historical evidence, "
                          "but not part of the current 340-row locked sample. " + (status_note or ""),
            })
            continue

        detail["resolved_evidence_id"] = resolved_eid
        detail["match_source"] = match_source
        if status_note:
            detail["note"] = status_note

        prior = existing.get(resolved_eid)
        if prior and prior["human_label"] is not None:
            if prior["human_label"] == label:
                buckets["identical"].append(detail)
                to_write.append((resolved_eid, label, note))
            else:
                detail["existing_label"] = prior["human_label"]
                buckets["conflict"].append(detail)
                if overwrite_conflicts:
                    to_write.append((resolved_eid, label, note))
        else:
            buckets["importable"].append(detail)
            to_write.append((resolved_eid, label, note))

    written = 0
    if not dry_run:
        for wr_eid, wr_label, wr_note in to_write:
            save_human_validation(wr_eid, wr_label, wr_note)
            written += 1

    return {
        "ok": True,
        "dry_run": dry_run,
        "overwrite_conflicts": overwrite_conflicts,
        "rows_in_csv": len(df),
        "counts": {k: len(v) for k, v in buckets.items()},
        "examples": {k: v[:10] for k, v in buckets.items()},
        "written": written,
        "would_write": len(to_write) if dry_run else written,
    }


def stale_extractor_versions() -> list[str]:
    """List extractor versions present in feature_evidence other than the
    current EXTRACTOR_VERSION — a signal that the rule set changed since
    that evidence was generated and it should be rebuilt, not trusted as-is."""
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT extractor_version FROM feature_evidence WHERE extractor_version != ? AND extractor_version IS NOT NULL",
            (EXTRACTOR_VERSION,),
        ).fetchall()
    return sorted({r[0] for r in rows if r[0]})


def wipe_type_b_evidence(exclude_version: str) -> int:
    """Delete feature_evidence rows (and the derived feature_values built
    from them) for every extractor version other than exclude_version, so a
    classifier change can't silently mix old and new decisions in the same
    dataset. Type A observations and scores are untouched here — rebuild the
    cohort afterward to regenerate feature_values and scores cleanly."""
    type_b_ids = tuple(TYPE_B_RULES.keys())
    with db_conn() as conn:
        cur = conn.execute(
            "DELETE FROM feature_evidence WHERE extractor_version != ?", (exclude_version,)
        )
        deleted_evidence = cur.rowcount
        placeholders = ",".join("?" for _ in type_b_ids)
        cur2 = conn.execute(
            f"DELETE FROM feature_values WHERE feature_id IN ({placeholders})", type_b_ids
        )
        deleted_values = cur2.rowcount
    return deleted_evidence + deleted_values


def _confusion_metrics(sub: pd.DataFrame) -> dict[str, Any]:
    machine = (sub["status"] == "CONFIRMED_PRESENT").astype(int)
    human = (sub["human_label"] == "CONFIRMED_PRESENT").astype(int)
    tn, fp, fn, tp = confusion_matrix(human, machine, labels=[0, 1]).ravel()
    # Cohen's kappa, per the original research plan (Section 6): agreement corrected
    # for chance, not just raw percent agreement. Undefined (None) when one rater has
    # no variance in a small per-feature slice — not the same as zero agreement.
    try:
        kappa = float(cohen_kappa_score(human, machine))
    except Exception:
        kappa = None
    return {
        "n": len(sub),
        "accuracy": float(accuracy_score(human, machine)),
        "precision": float(precision_score(human, machine, zero_division=0)),
        "recall": float(recall_score(human, machine, zero_division=0)),
        "f1": float(f1_score(human, machine, zero_division=0)),
        "specificity": float(tn / (tn + fp)) if (tn + fp) else None,
        "cohen_kappa": kappa,
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
    }


def extractor_validation_metrics() -> dict[str, Any]:
    """Aggregate + per-feature accuracy/precision/recall/F1/specificity/Cohen's kappa
    of the Type B extractor against whatever human labels have been saved so far. The
    aggregate figure can hide a feature with poor precision hiding behind others that
    are doing better — the `by_feature` breakdown is what a manuscript methods section
    should actually cite per feature, not just the pooled number.

    Rows labeled AMBIGUOUS are counted in `n_reviewed_total` and `ambiguous_count` but
    excluded from the confusion matrix / precision / recall / F1 / kappa — the reviewer
    explicitly could not apply a binary judgment, so forcing one in would misrepresent
    both the extractor and the review."""
    with db_conn() as conn:
        df = pd.read_sql_query(
            "SELECT feature_id,status,human_label FROM feature_evidence WHERE reviewed=1 AND human_label IS NOT NULL",
            conn,
        )
    if df.empty:
        return {"n": 0}
    ambiguous_count = int((df["human_label"] == "AMBIGUOUS").sum())
    df = df[df["human_label"] != "AMBIGUOUS"]
    if df.empty:
        return {"n": 0, "n_reviewed_total": ambiguous_count, "ambiguous_count": ambiguous_count}
    if not SKLEARN_AVAILABLE:
        return {"n": len(df), "error": "scikit-learn is not installed — run: pip install scikit-learn"}

    overall = _confusion_metrics(df)
    overall["n_reviewed_total"] = len(df) + ambiguous_count
    overall["ambiguous_count"] = ambiguous_count
    overall["by_feature"] = {fid: _confusion_metrics(g) for fid, g in df.groupby("feature_id")}
    overall["rater_note"] = (
        "This audit is a repair/QA pass on the extractor, not an independent human "
        "second-rater. A formal manuscript inter-rater-reliability claim still requires "
        "an independent human reviewer coding the same sample blind to the machine output. "
        "Per-feature n is often small — read per-feature precision/recall/F1 as indicative "
        "of where the extractor may be weaker, not as a stable estimate, until more labels "
        "are collected for that specific feature. AMBIGUOUS-flagged rows are excluded from "
        "these metrics, not counted as errors."
    )
    return overall


# =============================================================================
# Figures and exports
# =============================================================================


def _ensure_export_dirs() -> None:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)


def generate_figures(dataset: pd.DataFrame, analyses: dict[str, Any], counterfactuals: pd.DataFrame) -> list[Path]:
    if not MATPLOTLIB_AVAILABLE:
        return []  # figures are a nice-to-have in the bundle; missing matplotlib must not break the pipeline
    import matplotlib.pyplot as plt

    _ensure_export_dirs()
    paths = []

    # Figure 1: risk heatmap
    cols = ["Biological", "Clinical", "Regulatory", "Economic", "Infrastructure"]
    heat = dataset.dropna(subset=["TRS"]).sort_values("TRS").set_index("Disease")[cols]
    if not heat.empty:
        fig, ax = plt.subplots(figsize=(8, max(5, 0.24 * len(heat))))
        im = ax.imshow(heat.values, aspect="auto")
        ax.set_xticks(range(len(cols)), cols, rotation=30, ha="right")
        ax.set_yticks(range(len(heat)), heat.index)
        ax.set_title("RDTI domain risk by disease")
        fig.colorbar(im, ax=ax, label="Risk (0–100)")
        fig.tight_layout()
        p = FIGURE_DIR / "figure_domain_heatmap.png"
        fig.savefig(p, dpi=220, bbox_inches="tight")
        plt.close(fig)
        paths.append(p)

    # Figure 2: ROC for model comparisons
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    drew = False
    if SKLEARN_AVAILABLE:
        for name, res in analyses.get("models", {}).items():
            if res.get("error") or not res.get("y"):
                continue
            y = np.array(res["y"])
            p_hat = np.array(res["p"])
            fpr, tpr, _ = roc_curve(y, p_hat)
            ax.plot(fpr, tpr, label=f"{name} (AUC={res['auc']:.2f})")
            drew = True
    if drew:
        ax.plot([0, 1], [0, 1], linestyle="--")
        ax.set_xlabel("False-positive rate")
        ax.set_ylabel("True-positive rate")
        ax.set_title("Cross-validated discrimination")
        ax.legend(fontsize=8)
        fig.tight_layout()
        p = FIGURE_DIR / "figure_roc.png"
        fig.savefig(p, dpi=220, bbox_inches="tight")
        paths.append(p)
    plt.close(fig)

    # Figure 3: TRS vs evidence coverage by outcome
    if "Phase3Outcome" in dataset and dataset["Phase3Outcome"].notna().any():
        fig, ax = plt.subplots(figsize=(6.5, 5.5))
        for outcome, grp in dataset.dropna(subset=["TRS", "EvidenceCoverage", "Phase3Outcome"]).groupby("Phase3Outcome"):
            ax.scatter(grp["TRS"], grp["EvidenceCoverage"], label=f"Phase III outcome={int(outcome)}")
        ax.set_xlabel("Translation Risk Score")
        ax.set_ylabel("Evidence coverage (%)")
        ax.set_title("Risk and evidence coverage")
        ax.legend()
        fig.tight_layout()
        p = FIGURE_DIR / "figure_trs_evidence.png"
        fig.savefig(p, dpi=220, bbox_inches="tight")
        plt.close(fig)
        paths.append(p)

    # Figure 4: frequency of top counterfactual interventions
    if counterfactuals is not None and not counterfactuals.empty:
        top = counterfactuals[counterfactuals["rank"] == 1]
        if not top.empty:
            counts = top["label"].value_counts().sort_values()
            fig, ax = plt.subplots(figsize=(7, max(4, 0.35 * len(counts))))
            counts.plot(kind="barh", ax=ax)
            ax.set_xlabel("Number of high-risk diseases where intervention ranked first")
            ax.set_ylabel("")
            ax.set_title("Dominant model-based counterfactual interventions")
            fig.tight_layout()
            p = FIGURE_DIR / "figure_counterfactual_frequency.png"
            fig.savefig(p, dpi=220, bbox_inches="tight")
            plt.close(fig)
            paths.append(p)
    return paths


def methods_snapshot_text(cohort_id: str, snap: str, outcome_name: str) -> str:
    return f"""RDTI v{APP_VERSION} methods snapshot
Model: {MODEL_VERSION}
Extractor: {EXTRACTOR_VERSION}
Cohort ID: {cohort_id}
Snapshot: {snap}
Outcome: {outcome_name}

RDTI derives five translation-risk domains from structured public biomedical APIs and prespecified documentary evidence retrieval. Numeric features are transformed to empirical cohort-relative risk percentiles. Documentary features are coded as confirmed evidence present, not confirmed under the prespecified search protocol, or unascertained if retrieval failed. Domain scores are equal-weight means of available feature risks and the composite TRS is the equal-weight mean of available domains. Ascertainment completeness and evidence coverage are reported separately. Historical analyses restrict documentary evidence by publication date and restrict trial features to studies that started and were posted by the snapshot cutoff. Present-day trial status is not used as a historical status variable. Counterfactual analyses change only prespecified modifiable feature states and rerun the frozen scoring/model pipeline without altering stored evidence; they are interpreted as model-based scenarios, not causal effects.
"""


def export_manuscript_bundle(
    dataset: pd.DataFrame,
    analyses: dict[str, Any],
    counterfactuals: pd.DataFrame,
    cohort_id: str,
    snap: str,
    outcome_name: str,
) -> Path:
    _ensure_export_dirs()
    dataset_path = EXPORT_DIR / "manuscript_dataset.csv"
    analysis_path = EXPORT_DIR / "analysis_results.json"
    cf_path = EXPORT_DIR / "counterfactual_results.csv"
    uni_path = EXPORT_DIR / "univariate_results.csv"
    method_path = EXPORT_DIR / "methods_snapshot.txt"
    dataset.to_csv(dataset_path, index=False)
    analysis_path.write_text(json.dumps(analyses, indent=2, default=str), encoding="utf-8")
    counterfactuals.to_csv(cf_path, index=False)
    pd.DataFrame(analyses.get("univariate", [])).to_csv(uni_path, index=False)
    method_path.write_text(methods_snapshot_text(cohort_id, snap, outcome_name), encoding="utf-8")
    figs = generate_figures(dataset, analyses, counterfactuals)

    # Export feature dictionary for reproducibility.
    fd_path = EXPORT_DIR / "feature_dictionary.csv"
    pd.DataFrame([
        {
            "feature_id": f.feature_id, "label": f.label, "domain": f.domain,
            "feature_type": f.feature_type, "direction": f.direction,
            "modifiable": f.modifiable, "scoreable": f.scoreable, "description": f.description,
        }
        for f in FEATURE_SPECS.values()
    ]).to_csv(fd_path, index=False)

    # Human extractor-validation results, whatever has been labeled so far (possibly
    # none) — additive to the bundle, never required, never blocks export if empty.
    val_metrics_path = EXPORT_DIR / "validation_metrics.json"
    val_metrics_path.write_text(json.dumps(extractor_validation_metrics(), indent=2, default=str), encoding="utf-8")
    val_labels_path = EXPORT_DIR / "validation_labels.csv"
    validation_export().to_csv(val_labels_path, index=False)

    zip_path = EXPORT_DIR / "RDTI_manuscript_bundle.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in [dataset_path, analysis_path, cf_path, uni_path, method_path, fd_path,
                   val_metrics_path, val_labels_path, *figs]:
            if p.exists():
                z.write(p, arcname=p.relative_to(EXPORT_DIR))
        # Include a copy of the database as provenance snapshot.
        if DB_PATH.exists():
            z.write(DB_PATH, arcname="provenance/rdti_evidence_v3.sqlite")
    return zip_path


# =============================================================================
# Full manuscript pipeline
# =============================================================================


def run_full_manuscript_pipeline(
    disease_names: Sequence[str],
    baseline_date: str = DEFAULT_BASELINE_DATE,
    followup_end: str = DEFAULT_FOLLOWUP_END,
    force_refresh: bool = False,
    progress_callback=None,
) -> dict[str, Any]:
    names = [x.strip() for x in disease_names if x and x.strip()]
    if len(names) < 8:
        raise ValueError("Use at least 8 diseases for manuscript analysis; 20–40 is preferable.")
    cohort_id = cohort_id_for(names, "manuscript")
    disease_ids = []
    errors = []

    for i, name in enumerate(names, 1):
        if progress_callback:
            progress_callback(i - 1, len(names), f"Historical snapshot: {name}")
        try:
            out = build_disease_snapshot(name, baseline_date, force_refresh=force_refresh)
            disease_ids.append(out["identity"]["disease_id"])
            errors.extend([f"{name}: {e}" for e in out.get("errors", [])])
        except Exception as exc:
            errors.append(f"{name}: snapshot failed ({friendly_error(exc)})")

    if len(disease_ids) < 8:
        raise RuntimeError("Too few disease snapshots completed to analyze.")

    if progress_callback:
        progress_callback(len(names), len(names), "Scoring historical cohort")
    score_df = score_cohort(disease_ids, baseline_date, cohort_id)

    # Outcomes are derived only after historical predictors have been frozen/scored.
    for i, name in enumerate(names, 1):
        if progress_callback:
            progress_callback(i - 1, len(names), f"Outcome derivation: {name}")
        try:
            ident = resolve_disease(name)
            derive_outcome(ident, baseline_date, followup_end)
        except Exception as exc:
            errors.append(f"{name}: outcome failed ({friendly_error(exc)})")

    dataset = manuscript_dataset(cohort_id, baseline_date, baseline_date, followup_end)
    analyses = run_manuscript_analyses(dataset, "Phase3Outcome")
    counterfactuals = cohort_counterfactual_analysis(dataset, baseline_date, cohort_id, "Phase3Outcome")

    analysis_id = f"AN_{uuid.uuid4().hex[:12]}"
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO analysis_runs(analysis_id,cohort_id,snapshot_date,outcome_name,settings_json,results_json,created_at) VALUES(?,?,?,?,?,?,?)",
            (
                analysis_id, cohort_id, baseline_date, "Phase3Outcome",
                json_dumps({"baseline_date": baseline_date, "followup_end": followup_end, "n_requested": len(names)}),
                json_dumps(analyses), now_iso(),
            ),
        )
    bundle = export_manuscript_bundle(dataset, analyses, counterfactuals, cohort_id, baseline_date, "Phase3Outcome")
    if progress_callback:
        progress_callback(len(names), len(names), "Complete")
    return {
        "cohort_id": cohort_id,
        "dataset": dataset,
        "analyses": analyses,
        "counterfactuals": counterfactuals,
        "bundle": bundle,
        "errors": errors,
        "analysis_id": analysis_id,
    }


# =============================================================================
# Streamlit UI
# =============================================================================


def smoke_test_math() -> dict[str, Any]:
    refs = {"trial_count": [0, 1, 2, 5, 10, 30], "unique_sponsors": [0, 1, 2, 4, 8]}
    fv = {
        "trial_count": {"value": 2, "status": "OBSERVED"},
        "unique_sponsors": {"value": 1, "status": "OBSERVED"},
        "natural_history_study": {"value": False, "status": "NOT_CONFIRMED"},
        "patient_registry": {"value": True, "status": "CONFIRMED_PRESENT"},
    }
    result = calculate_score_from_values(fv, refs)
    assert result["trs"] is not None
    scenario = {k: dict(v) for k, v in fv.items()}
    scenario["natural_history_study"]["value"] = True
    result2 = calculate_score_from_values(scenario, refs)
    assert result2["trs"] <= result["trs"]
    return {"baseline": result, "scenario": result2}


init_db()
