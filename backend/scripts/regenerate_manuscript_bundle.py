"""One-off: regenerate the manuscript export bundle (incl. figures, now that
matplotlib is installed) from an already-completed pipeline run, without re-running
retrieval. Uses the cohort_id/dates captured from the completed run's final status.
Safe to delete after use — not part of the app's runtime.
"""
import sys
sys.path.insert(0, ".")
from app import engine as eng

COHORT_ID = "manuscript_99262879ff"
BASELINE_DATE = "2015-12-31"
FOLLOWUP_END = "2025-12-31"
OUTCOME = "Phase3Outcome"

df = eng.manuscript_dataset(COHORT_ID, BASELINE_DATE, BASELINE_DATE, FOLLOWUP_END)
print("dataset rows:", len(df))
analyses = eng.run_manuscript_analyses(df, OUTCOME)
counterfactuals = eng.cohort_counterfactual_analysis(df, BASELINE_DATE, COHORT_ID, OUTCOME)
print("counterfactual rows:", len(counterfactuals))
bundle = eng.export_manuscript_bundle(df, analyses, counterfactuals, COHORT_ID, BASELINE_DATE, OUTCOME)
print("bundle:", bundle)
print("matplotlib available:", eng.MATPLOTLIB_AVAILABLE)
