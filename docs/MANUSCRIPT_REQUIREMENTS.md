# Manuscript Requirements

Status: **manuscript-frozen methodology, actively used pipeline**. This document exists
so a future session (human or Claude) doesn't casually "clean up" or "simplify" code that
is load-bearing for a specific scientific claim. If you're about to change anything listed
under "Do not touch without a version bump" below, stop and re-read
[CLAUDE.md](../CLAUDE.md#things-future-claude-sessions-must-not-accidentally-change) first.

## What the manuscript needs from this codebase

The project's own source documents (`../Objective Scoring/*.docx`,
`../Manuscript Bundle/*`) describe a research plan with these required components, all
implemented in `engine.py`:

1. **A frozen cohort and feature dictionary** — `DEFAULT_MANUSCRIPT_COHORT` (100 named
   diseases, `engine.py:126-227`) and `FEATURE_SPECS` (29 features,
   [FEATURE_DICTIONARY.md](FEATURE_DICTIONARY.md)). "Frozen" means: don't add/remove
   diseases or features mid-analysis without understanding you're changing what the
   manuscript is about, not just tuning a parameter.
2. **Objective evidence extraction and normalization** — Type A structured retrieval +
   Type B rules-based classification, cohort-relative empirical normalization. See
   [SCORING_METHODOLOGY.md §1-4](SCORING_METHODOLOGY.md).
3. **Evidence provenance/auditability** — every observation and classification decision
   is persisted with source, URL, snippet, and retrieval timestamp
   (`raw_observations`, `feature_evidence`, `documents` tables — see
   [DATA_SOURCES.md](DATA_SOURCES.md)). `provenance_table()` (`engine.py:1665-1680`)
   assembles the full audit trail for one disease/snapshot, surfaced via
   `GET /api/disease/{slug}`'s `provenance` field and rendered by
   `EvidenceSection.tsx`.
4. **Translation Risk Score (TRS) methodology** — [SCORING_METHODOLOGY.md §3-5](SCORING_METHODOLOGY.md).
5. **Evidence-completeness analyses** — ascertainment completeness and evidence coverage,
   reported *alongside* TRS rather than folded into it, precisely so a reviewer can tell
   "low risk" apart from "we don't have enough evidence to say."
6. **Validation analyses** — Type B extractor precision/recall/accuracy/specificity and
   Cohen's κ against human-reviewed labels (`extractor_validation_metrics()`,
   `engine.py:2017-2047`), exposed at `GET /api/research/extractor-metrics` and the
   `/research/validation` operator page. The function's own `rater_note` is explicit that
   this is a repair/QA pass, **not** a formal independent second-rater — a manuscript
   inter-rater-reliability claim needs an actual independent human reviewer blind to the
   machine output, which this codebase does not (and structurally cannot) provide on its
   own.
7. **Counterfactual / CTR (Counterfactual Translation Risk) analyses** —
   [SCORING_METHODOLOGY.md §7](SCORING_METHODOLOGY.md#7-counterfactual-analysis), matching
   `Objective Scoring/06_Counterfactual_Translation_Risk_Scoring.docx`.
8. **Manuscript-ready outputs** — `export_manuscript_bundle()` (`engine.py:2153-2193`)
   produces, zipped: `manuscript_dataset.csv`, `analysis_results.json`,
   `counterfactual_results.csv`, `univariate_results.csv`, `methods_snapshot.txt`,
   `feature_dictionary.csv`, four figures (domain heatmap, ROC, TRS-vs-coverage scatter,
   counterfactual frequency bar chart — `generate_figures()`, `engine.py:2060-2138`), and
   a provenance copy of the full SQLite database. Reachable via
   `GET /api/research/export` and the `/research/export` page.

## The frozen bundle already in this repo

`../Manuscript Bundle/` (one directory above `poros-platform/`) is a **real prior output**
of this exact pipeline — not a mockup:

- `manuscript_dataset.csv` — 40 diseases scored (a subset of the 100-name cohort; not
  every disease resolved/scored successfully in that run), with domain scores, TRS,
  ascertainment/coverage, and derived outcomes.
- `methods_snapshot.txt` — states `Model: TRS_v3_empirical`, `Extractor: typeB_rules_v3.0`,
  `Cohort ID: manuscript_0076424080`, `Snapshot: 2015-12-31`, `Outcome: Phase3Outcome`.
- `analysis_results.json`, `univariate_results.csv`, `counterfactual_results.csv` — the
  statistical outputs described in [SCORING_METHODOLOGY.md §8](SCORING_METHODOLOGY.md#8-outcome-derivation-for-validation-not-for-scoring).
- `figures/` — the four generated PNGs.
- `provenance/rdti_evidence_v3.sqlite` — the evidence database as it stood at export time.

**Open reconciliation issue** (see [CURRENT_STATUS.md](CURRENT_STATUS.md) for the full
flag): this bundle's extractor version (`typeB_rules_v3.0`) is one version behind the
`typeB_rules_v3.1` currently in `engine.py`. That means `TYPE_B_RULES` changed after this
bundle was generated, so re-running the pipeline today would very likely reclassify some
Type B features differently and produce a numerically different dataset from the one
already sitting in this repo. Nobody has annotated *what* changed between v3.0 and v3.1
(no changelog entry exists for it), and this document does not attempt to guess. If the
manuscript cites numbers from the frozen bundle, they should be treated as tied to
extractor v3.0 specifically, not to "the current app."

## The Objective Scoring rubric specifies more than is implemented

`../Objective Scoring/*.docx` (six documents: a master index plus one per domain 01-05,
plus 06 for the counterfactual/CTR layer) is the **conceptual scoring protocol/rubric**.
It is broader than what `FEATURE_SPECS` actually implements. A full variable-by-variable
audit — every rubric item checked against the live code, not summarized from memory —
lives in [VARIABLE_DISPOSITION.md](VARIABLE_DISPOSITION.md): **46 specified, 24
implemented cleanly, 3 merged (registry evidence and consensus-guidance wording each
collapse two rubric items into one scored feature), 16 excluded, 3 deferred as future
work, 0 unresolved.** Every exclusion cites a specific code capability limit (which API
could supply it, what the Type B classifier can structurally distinguish, what
`as_of_date` can reconstruct) rather than "not implemented" as a bare reason — including
one exclusion (present-day FDA approval status) that traces directly to the rubric's own
Master Index non-negotiable exclusion against predictor/outcome leakage. **That document
is still a proposal for the project owner's review, not a finished manuscript decision**
— in particular the MERGED and FUTURE WORK rows are the ones most likely to change if the
owner decides differently.

**"Type A" / "Type B" is implementation vocabulary, not manuscript vocabulary.** A full
text search of all six Objective Scoring docx files found zero occurrences of "Type A" or
"Type B" — the docx set instead classifies variables by "Raw type" (Binary, Count,
Continuous, Ordinal, Derived continuous). The A/B labels are specific to
`feature_dictionary.csv`'s `feature_type` column, the sqlite `feature_values.feature_type`
column, and the `typeB_rules_v3.1` extractor-version naming in `engine.py` — i.e., they're
this codebase's own internal shorthand for "structured/API-sourced" vs.
"documentary/text-classified," not a term the manuscript's own methodology documents use
or require. **This directly supports rewriting user-facing "Type A"/"Type B" labels into
plain language** (see [CURRENT_STATUS.md](CURRENT_STATUS.md)) — doing so does not
contradict or diverge from the manuscript's own methodology vocabulary, since the
manuscript never used "Type A/B" as user-facing terminology in the first place.

The docx domain-scoring formula is phrased generically as "weighted mean of prespecified
normalized feature risks" (allowing either equal or trained-and-frozen weights), while
`methods_snapshot.txt` and the Master Index both confirm the manuscript's actual
convention is **unweighted, equal-weight** averaging at both the feature→domain and
domain→composite levels — matching `calculate_score_from_values()`. Not a contradiction
(the docx permits equal weighting as one valid option) but worth knowing the docx's
"weighted mean" phrasing doesn't imply fitted weights were used.

## Known data-quality flags in the frozen bundle (for whoever writes Results text)

Surfaced by direct inspection of `../Manuscript Bundle/`'s CSVs, JSON, and provenance
sqlite — not resolved here, flagged for the person writing manuscript statistics:

- **`AscertainmentCompleteness` is constant (100.0) across all 40 scored diseases** in
  `manuscript_dataset.csv`. A constant predictor has no variance, which is why its
  univariate logistic regression (`univariate_results.csv`) has an odds ratio but
  undefined/blank CI and p-value — it cannot be evaluated as a predictor in this cohort.
  Do not report a significance test on this variable as-is.
- **The `Regulatory` domain's univariate odds ratio has no CI or p-value** (`null` in both
  `univariate_results.csv` and `analysis_results.json`) — consistent with a
  convergence/separation issue in that specific logistic fit, not explained anywhere in
  the bundle's own text.
- **`counterfactual_results.csv` (126 rows, 10 diseases) is a subset**, not a full dump —
  the provenance sqlite's `counterfactual_runs` table has 133 rows and implicitly covers
  more of the cohort. No file in the bundle documents the selection criterion for which
  10 diseases were exported to the CSV. Don't describe the CSV as exhaustive in manuscript
  text without first confirming the selection logic with whoever generated it.
- **Provenance sqlite `calculated_at` timestamps read as very recent** (matching this
  audit's own date), distinct from the historical snapshot date (`2015-12-31`) the actual
  scores are computed *as of*. This may simply mean the scores were (re)computed recently
  from historical-cutoff evidence — which is expected and correct — but it's worth
  explicitly confirming with the project owner before calling this bundle a long-frozen,
  untouched artifact in manuscript methods language.
- **`Biological` domain score reads as `0.0` (best possible / lowest risk) for several of
  the best-characterized diseases** sampled (Cystic Fibrosis, Fabry Disease, Sickle Cell
  Disease, DMD, SMA, Pompe, Beta Thalassemia, PAH). This is plausibly a genuine floor
  effect (all qualifying Biological Type B features confirmed present for
  well-studied diseases) rather than a scoring bug, but it was not independently verified
  against every row — flagged as unconfirmed, not asserted either way.

## Do not touch without a version bump

Changing any of the following without bumping `MODEL_VERSION` and/or
`EXTRACTOR_VERSION` (`engine.py:114-115`) silently invalidates the ability to compare old
and new evidence/scores:

- `TYPE_B_RULES` (any query, group, or exclude pattern)
- `FEATURE_SPECS` (adding/removing/redefining a feature, changing `direction`,
  `modifiable`, or `scoreable`)
- `calculate_score_from_values()`, `empirical_risk()`, `feature_risk()` — the scoring math
- `derive_outcome()` — the outcome definition
- `DEFAULT_MANUSCRIPT_COHORT` — changing cohort membership changes every disease's
  cohort-relative percentile score, not just the added/removed disease's own score

## Downstream consumers of this pipeline

- `/research/*` frontend pages (operator tools — run pipeline, inspect dataset/analyses,
  label validation samples, run counterfactuals, download the bundle)
- `GET /api/methodology` and the public `/methodology` page (live feature dictionary —
  always current, not frozen, since it reads `FEATURE_SPECS` directly)
- The manuscript itself (external to this repo) — cites the frozen bundle's numbers, the
  methods snapshot text, and the generated figures

See [CURRENT_STATUS.md](CURRENT_STATUS.md) for what in this list is currently
working end-to-end vs. blocked by the lack of live network access in this environment.
