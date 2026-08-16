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
6. **Validation analyses** — Type B extractor accuracy/precision/recall/F1/specificity
   and Cohen's κ against human-reviewed labels, both pooled and **per feature**
   (`extractor_validation_metrics()` in `engine.py`), exposed at
   `GET /api/research/extractor-metrics` and the `/research/validation` operator page.
   The sampling that feeds this (`validation_sample()`) is stratified by `feature_id` (a
   target row count per feature, not uniform-random across all evidence), so a
   per-feature breakdown has a real chance of being reportable rather than being starved
   of labels for low-volume features. **The metrics infrastructure is complete; the
   actual human labels are not** — as of this pass, `feature_evidence.reviewed=1` rows
   still need to be produced by a person going through `/research/validation` (or
   pulling `GET /api/research/validation-sample` and labeling offline), which this
   codebase cannot do on its own without invalidating the point of the check. The
   function's own `rater_note` is explicit that this is a repair/QA pass, **not** a
   formal independent second-rater — a manuscript inter-rater-reliability claim needs an
   actual independent human reviewer blind to the machine output.
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

## The frozen bundle — current authoritative version

**`../Manuscript Bundle/frozen_2026-08-14_typeB_rules_v3.1_n100/`** (one directory above
`poros-platform/`) is the **current authoritative frozen manuscript dataset** — generated
2026-08-14 by running `POST /api/research/pipeline/run` against this machine's real
outbound internet for the full `DEFAULT_MANUSCRIPT_COHORT` (100 diseases), under the
extractor and model versions currently in `engine.py`. **100/100 diseases resolved and
scored, 0 retrieval errors.** Its own `README.txt` documents cohort_id
(`manuscript_99262879ff`), exact versions, top-line AUCs, and contents; not repeated here.
Cite *this* bundle going forward, not the older one below.

This directly resolves the extractor-version reconciliation issue that was open in
earlier passes of this document: rather than trying to reconstruct what changed between
`typeB_rules_v3.0` and `typeB_rules_v3.1` in the old bundle (nothing in the repo recorded
that), this bundle sidesteps the question by simply being **current and complete** —
generated under whatever `TYPE_B_RULES`/`FEATURE_SPECS` exist in `engine.py` today, with
every one of the 100 cohort diseases represented, not a 40-disease subset.

Reproduction script: `backend/scripts/regenerate_manuscript_bundle.py` — regenerates the
dataset/analyses/counterfactuals/figures from an already-completed pipeline run's
`cohort_id`/dates without re-hitting external APIs (useful after installing
`matplotlib`, which is what triggered this bundle's second, figures-included pass).

**Freezing discipline going forward**: this bundle is a point-in-time export, not a live
view. If `engine.py`'s scoring math, `TYPE_B_RULES`, or `FEATURE_SPECS` change after this
date (see [CLAUDE.md](../CLAUDE.md#things-future-claude-sessions-must-not-accidentally-change)
for why that requires a version bump), this bundle becomes historical too, and a new
dated bundle should be generated and archived the same way — not overwritten in place.

### Prior bundle — superseded, kept for history

`../Manuscript Bundle/` (no dated suffix) is the **original, now-superseded** bundle:
40 of the 100 cohort diseases (not every disease resolved/scored successfully in that
run), generated under `Extractor: typeB_rules_v3.0`, `Cohort ID: manuscript_0076424080`.
Left in place for audit-trail purposes, not deleted. Do not cite this one going forward —
use the dated bundle above.

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

## Known data-quality flags in the current frozen bundle (for whoever writes Results text)

Re-checked directly against the current `frozen_2026-08-14_typeB_rules_v3.1_n100`
bundle (not the old 40-disease one — some flags from that bundle no longer apply and are
noted as resolved below):

- **Resolved**: `AscertainmentCompleteness` was constant (100.0, no variance, undefined
  CI/p-value) in the old 40-disease bundle. In the current 100-disease bundle it takes
  two values (96.4, 100.0) and its univariate fit now produces a real (if wide) CI:
  OR 102.0, 95% CI 0.59–17,574, p=0.078. Still not a significant predictor, but no longer
  a degenerate/uncomputable one.
- **Still open**: **`Regulatory`'s univariate odds ratio has no CI or p-value**
  (blank in `univariate_results.csv`) — same convergence/separation issue as the old
  bundle, persists in the new run too. Not explained anywhere in the bundle's own text;
  worth a statistician's look before citing a Regulatory-domain odds ratio.
- **Resolved / re-characterized**: the old bundle's `counterfactual_results.csv` (126
  rows, 10 diseases) looked like an unexplained subset. In the current bundle it's 370
  rows across exactly 25 diseases — **25 = 100 × the documented default
  `top_fraction=0.25`** (`cohort_counterfactual_analysis()`, top-risk quartile only). This
  is the documented, intended behavior, not an unexplained selection — safe to describe
  as "the top translation-risk quartile" in manuscript text.
- **`Biological` domain score is `0.0` (best possible / lowest risk) for 11 of 100
  diseases** in the current bundle (was "several of the best-characterized diseases
  sampled" in the old 40-disease bundle, not independently counted at the time). Plausibly
  a genuine floor effect (all qualifying Biological Type B features confirmed present for
  well-studied diseases) rather than a scoring bug, but still not independently verified
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
