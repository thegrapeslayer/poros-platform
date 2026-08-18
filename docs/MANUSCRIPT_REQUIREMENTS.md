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

## Extractor validation labeling workflow

Step-by-step, for whoever actually does the human review (does not modify the frozen
dataset — this only ever writes to `feature_evidence.reviewed`/`human_label`/`human_note`
in the live database, never to `scores`, `feature_values`, or any exported bundle file):

1. **Where**: `/research/validation` in the running frontend (or
   `GET /api/research/manuscript-validation-sample` directly if reviewing offline/
   programmatically).
2. **How many**: **locked at 20 labeled rows per feature, 340 total** across the 17 Type
   B features — this is now a fixed, approved protocol
   (`MANUSCRIPT_VALIDATION_PER_FEATURE`/`_PER_CLASS_TARGET`/`_SEED` in `engine.py`), not
   a configurable input on the page. (The general-purpose `GET
   /api/research/validation-sample` with an adjustable `per_feature` still exists for ad
   hoc QA outside the manuscript claim, but `/research/validation` no longer uses it.)
3. **Sample construction**: `manuscript_validation_sample()` in `engine.py` restricts to
   **`snapshot_date='2015-12-31'` only** — the exact historical evidence the frozen
   dataset's TRS scores are built from, not the live public-site snapshot — then
   stratifies by `feature_id` **and by the extractor's own predicted class**
   (`CONFIRMED_PRESENT`/`NOT_CONFIRMED`), targeting 10 of each per feature so a feature's
   precision/recall isn't computed from a near-single-class sample. Where one class has
   fewer than 10 eligible rows, all of it is taken (never duplicated) and the shortfall
   is filled from the other class up to 20 — see `manuscript_validation_plan()` for the
   exact per-feature audit, surfaced as the "Sampling plan" table on the page before any
   row is fetched for review. **Deterministic** (fixed seed 42) — always the same 340 rows.
4. **What you're labeling**: for each row — disease, `feature_id` and its human-readable
   label/definition (from `FEATURE_SPECS`), the extractor's own prediction (`status`:
   `CONFIRMED_PRESENT`/`NOT_CONFIRMED`/`UNASCERTAINED`), the evidence passage
   (`supporting_snippet`), and the source it came from (title, URL, PMID, PMCID, DOI —
   joined from the `documents` table). Judge whether the passage actually supports the
   feature being present for that disease.
5. **Allowed values**: `CONFIRMED_PRESENT` (evidence genuinely supports it),
   `NOT_CONFIRMED` (it doesn't), `AMBIGUOUS` (can't confidently judge — excluded from the
   confusion matrix/precision/recall/F1/κ entirely, not counted as an error either way).
   An optional free-text note can go with any of the three.
6. **Saving**: click a label (and optionally type a note) then "Save & Next" — calls
   `POST /api/research/validation-sample/{evidence_id}` with `{human_label, note}`, sets
   `reviewed=1`.
7. **Progress**: "Item N of TOTAL · M still need a label" on the page; the aggregate
   metrics section above it updates live after every save.
8. **Resuming without duplicating work**: reload the page and click "Start / resume
   labeling" again — the sample is fixed, so it's always the same 340 rows;
   already-labeled ones show as reviewed with their saved label/note pre-filled and
   editable via Back or "Jump to an item," so nothing is redrawn or lost.
9. **Final precision/recall/F1/κ**: `GET /api/research/extractor-metrics` — pooled and
   **broken out per `feature_id`** (`by_feature`), computed by `extractor_validation_metrics()`.
   `AMBIGUOUS` rows are tallied separately (`ambiguous_count`) and excluded from these
   numbers.
10. **Export for the manuscript supplement**: `GET /api/research/validation-export` — CSV
    of every reviewed row (disease, feature, machine prediction, human label/note,
    evidence snippet, source, extractor version), or the "Export completed validation
    labels" link on the page itself. This same CSV is also now bundled automatically as
    `validation_labels.csv` + `validation_metrics.json` inside `RDTI_manuscript_bundle.zip`
    whenever `export_manuscript_bundle()` runs — whatever's been reviewed at export time,
    possibly nothing, is included; it never blocks or alters the rest of the bundle.
11. **Recovering lost review state**: if application state is lost before the export step
    (e.g. browser/session reset), and a previously exported `validation_labels.csv` still
    exists, the "Restore from CSV" section on the same page (or
    `POST /api/research/validation-import`) re-applies it. Matched on the CSV's own
    `evidence_id` column against the **current** frozen sample (recomputed fresh on every
    import call, never cached) — a row only restores if that `evidence_id` is still part
    of the locked 340-row sample and, where the CSV also carries `feature_id`/`disease`/
    `snapshot_date`/`machine_status`, those match what's actually on file for it.
    **Always dry-runs first** (`dry_run=true`, the default) — returns a classification
    report (`importable`/`identical`/`conflict`/`duplicate`/`unmatched`/`malformed`/
    `invalid_label`) without writing anything; only a second call with `dry_run=false`
    writes. A row whose evidence_id already has a *different* saved label is a
    `conflict` and is left untouched unless `overwrite_conflicts=true` is explicitly
    passed. Writes go through the exact same `save_human_validation()` path a normal
    label click uses — nothing outside `feature_evidence.reviewed`/`human_label`/
    `human_note` is ever touched, and the sample itself is never re-drawn. Every
    uploaded file, whether accepted or rejected, is preserved verbatim under
    `backend/app/data/exports/validation_imports/` as an audit artifact.

## The frozen bundle — current authoritative version

**`../Manuscript Bundle/frozen_2026-08-14_typeB_rules_v3.1_n100/`** (one directory above
`poros-platform/`) is the **current authoritative frozen manuscript dataset** — generated
2026-08-14 by running `POST /api/research/pipeline/run` against this machine's real
outbound internet for the full `DEFAULT_MANUSCRIPT_COHORT` (100 diseases), under the
extractor and model versions currently in `engine.py`. **100/100 diseases resolved and
scored, 0 retrieval errors.** Its own `README.txt` documents cohort_id
(`manuscript_99262879ff`), exact versions, top-line AUCs, and contents; not repeated here.
`FREEZE_MANIFEST.json`/`.md` in that same directory carry the exact git commit
(`d4d4dbfabcbc908f7ac367163924688b11bd8138`) and a SHA-256 checksum for every file in the
bundle — use those to verify a copy of this bundle hasn't been altered. Cite *this*
bundle going forward, not the older one below.

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
