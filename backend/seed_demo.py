"""Seeds a few diseases with representative numbers so the API/frontend can be
exercised without live network access to ClinicalTrials.gov/Europe PMC/NIH
RePORTER/openFDA (those are blocked in this sandbox but work in normal
hosting). Delete this file once real retrieval is wired up in production."""
import sys; sys.path.insert(0, ".")
from app import engine as eng
from app.main import PORTFOLIO, portfolio_cohort_id, slugify

DEMO = {
    "Visceral Myopathy": dict(trial_count=3, completed_by_snapshot=0, highest_phase_by_snapshot=2,
        median_enrollment=12, unique_trial_sites=7, unique_sponsors=2, industry_sponsors=0,
        industry_trials=0, nih_funded_projects=4, nih_funding_total=2400000, nih_funding_institutions=3,
        b=dict(causal_molecular_basis=True, actionable_target=False, human_disease_model=False,
               in_vivo_model=True, preclinical_rescue=False, natural_history_study=False,
               patient_registry=True, validated_outcome_measure=False, biomarker_in_trial=False,
               orphan_designation_evidence=True, expedited_designation_evidence=False,
               surrogate_endpoint_precedent=False, patient_organization=True, biobank=False,
               natural_history_consortium=False, multicenter_network=False, consensus_guidance=False)),
    "Spinal Muscular Atrophy": dict(trial_count=42, completed_by_snapshot=19, highest_phase_by_snapshot=4,
        median_enrollment=64, unique_trial_sites=120, unique_sponsors=14, industry_sponsors=9,
        industry_trials=30, nih_funded_projects=38, nih_funding_total=61000000, nih_funding_institutions=22,
        b=dict(causal_molecular_basis=True, actionable_target=True, human_disease_model=True,
               in_vivo_model=True, preclinical_rescue=True, natural_history_study=True,
               patient_registry=True, validated_outcome_measure=True, biomarker_in_trial=True,
               orphan_designation_evidence=True, expedited_designation_evidence=True,
               surrogate_endpoint_precedent=True, patient_organization=True, biobank=True,
               natural_history_consortium=True, multicenter_network=True, consensus_guidance=True)),
    "Canavan Disease": dict(trial_count=6, completed_by_snapshot=1, highest_phase_by_snapshot=1,
        median_enrollment=15, unique_trial_sites=5, unique_sponsors=3, industry_sponsors=1,
        industry_trials=2, nih_funded_projects=7, nih_funding_total=5100000, nih_funding_institutions=4,
        b=dict(causal_molecular_basis=True, actionable_target=True, human_disease_model=False,
               in_vivo_model=True, preclinical_rescue=True, natural_history_study=False,
               patient_registry=True, validated_outcome_measure=False, biomarker_in_trial=False,
               orphan_designation_evidence=True, expedited_designation_evidence=False,
               surrogate_endpoint_precedent=False, patient_organization=True, biobank=False,
               natural_history_consortium=False, multicenter_network=False, consensus_guidance=False)),
}

for name, d in DEMO.items():
    identity = eng.resolve_disease(name)
    type_a = {"trials": {"values": {k: d[k] for k in [
        "trial_count","completed_by_snapshot","highest_phase_by_snapshot","median_enrollment",
        "unique_trial_sites","unique_sponsors","industry_sponsors","industry_trials"]}},
        "nih": {k: d[k] for k in ["nih_funded_projects","nih_funding_total","nih_funding_institutions"]},
        "fda": {"count": 0}, "errors": []}
    type_b = {k: {"value": v, "status": "CONFIRMED_PRESENT" if v else "NOT_CONFIRMED",
                  "confidence": 0.9 if v else 0.3, "document_id": "demo-seed"} for k, v in d["b"].items()}
    eng.aggregate_features(identity, None, type_a, type_b)
    print("seeded", name, "->", slugify(name))

snap = eng.snapshot_key(None)
refs = eng.fit_reference_stats(eng.get_disease_ids_for_names(list(DEMO.keys())), snap, portfolio_cohort_id())
print("reference features fitted:", len(refs))
