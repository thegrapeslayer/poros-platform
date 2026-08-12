# Scoring Methodology

Status: **manuscript-frozen core logic** — this describes `backend/app/engine.py` as it
exists today (`MODEL_VERSION = "TRS_v3_empirical"`, `EXTRACTOR_VERSION = "typeB_rules_v3.1"`).
Do not change the math or classification rules described here without bumping
`MODEL_VERSION` and/or `EXTRACTOR_VERSION` in `engine.py` — see
[CLAUDE.md](../CLAUDE.md#things-future-claude-sessions-must-not-accidentally-change).

Source of truth for everything below is `backend/app/engine.py`. Where this document
and the code ever disagree, the code wins — flag the mismatch instead of trusting this
file blindly (see [CURRENT_STATUS.md](CURRENT_STATUS.md) for known open questions).

## 1. Two evidence types, not two domains

Every feature in `FEATURE_SPECS` (`engine.py:254-349`) is one of two **evidence types**.
This is *not* the same axis as the five scoring **domains** (§3) — a common source of
confusion in the current UI (see [CURRENT_STATUS.md](CURRENT_STATUS.md)).

| Type | What it means | Source | Value shape |
|---|---|---|---|
| **A — Structured** | A number pulled directly from a public API. No classification judgment involved. | ClinicalTrials.gov API v2, NIH RePORTER API v2, openFDA drug labels, PubMed E-utilities | numeric (count, USD, phase, etc.) |
| **B — Documentary** | A yes/no judgment about whether a specific kind of evidence has been *published and retrieved*, made by a rules-based text classifier. | Europe PMC / PubMed abstracts | boolean-like status: `CONFIRMED_PRESENT`, `NOT_CONFIRMED`, `UNASCERTAINED` |

Internally `FeatureSpec.feature_type` also allows `"C"` but no feature currently uses it.

**Critical distinction for Type B**: `NOT_CONFIRMED` is not "does not exist." It means the
prespecified search-and-classify protocol ran and found no qualifying passage. Retrieval
failure (API down, etc.) is coded separately as `UNASCERTAINED` and must never be treated
as a negative finding. This is stated explicitly in `engine.py`'s module docstring (lines
25-30) and enforced in `classify_type_b()` (`engine.py:1100-1177`).

## 2. Type B classification: paired, disease-proximate, exclusion-aware rules

`TYPE_B_RULES` (`engine.py:359-475`) defines, per feature, a Europe PMC search query plus
a set of **condition groups** and **exclusion patterns**. `run_type_b_retrieval()`
(`engine.py:1180-1203`) executes this per disease per feature:

1. **Retrieve**: `europe_pmc_search()` queries Europe PMC/PubMed for the disease name(s)
   AND the feature's query clause, sorted by citation count, up to 12 results.
2. **Window**: each candidate document's title/abstract is split into sentence-level
   evidence windows (`_split_windows()`, a sentence plus its immediate neighbors) so a
   qualifying phrase and the disease mention that licenses it must sit close together,
   not just anywhere in the same abstract.
3. **Classify** (`classify_type_b()`): a window is `CONFIRMED_PRESENT` only if —
   - the window (or the title, for short abstracts) mentions the disease, **and**
   - every required condition group has at least one regex hit inside that window, **and**
   - no exclusion pattern matches inside that same window.
   The highest-specificity matching window across all retrieved documents wins; its
   document, snippet, and matched phrases are stored as provenance.
4. If retrieval succeeded but nothing satisfied every group, the feature is
   `NOT_CONFIRMED` (confidence 0.70, fixed). If retrieval itself failed, it's
   `UNASCERTAINED` (confidence 0.0) and contributes no signal, positive or negative.

One structured upgrade exists: if a ClinicalTrials.gov trial's outcome text mentions a
biomarker/pharmacodynamic term, `biomarker_in_trial` is force-set to
`CONFIRMED_PRESENT` at confidence 0.98 (`aggregate_features()`, `engine.py:1392-1394`),
because that's Type-A-grade structured evidence, stronger than a text-classifier hit.

This extractor is explicitly **not** a validated high-precision classifier — its
docstring says so directly, and its real-world precision/recall/Cohen's κ must be read
off `GET /api/research/extractor-metrics` (backed by human-labeled samples from
`/research/validation`) before trusting it for any manuscript claim. See
[MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md).

## 3. The five scoring domains

`DOMAIN_LABELS` (`engine.py:351-357`) — every feature belongs to exactly one:

| Domain key | Label | Roughly answers |
|---|---|---|
| `biological` | Biological tractability | Is there a known causal mechanism and a way to intervene on it? |
| `clinical` | Clinical development | Is the disease actually being studied in trials, with the infrastructure trials need? |
| `regulatory` | Regulatory pathway | Has the regulatory system already engaged with this disease (designations, precedent)? |
| `economic` | Economic sustainability | Is there funding and sponsor interest behind development? |
| `infrastructure` | Translation infrastructure | Do the non-trial support structures (registries, biobanks, consensus guidance, patient orgs) exist? |

These five map directly onto the six `Objective Scoring` source documents in
`../Objective Scoring/` (01–05 cover one domain each; 06 covers the counterfactual/CTR
layer in §7 below) — see [MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md) for how
those source documents relate to the code.

## 4. From raw value to a 0–100 risk number

`feature_risk()` (`engine.py:1496-1504`) converts one feature's value into a **risk**
score, 0 = best/lowest risk, 100 = worst/highest risk:

- **Type B** (documentary): binary by construction.
  `True → 0` (evidence confirmed present, no risk), `False → 100` (not confirmed, full
  risk), `None → excluded` (unascertained, contributes nothing rather than being treated
  as risk).
- **Type A** (structured numeric): **empirical cohort-relative percentile**, not a
  hand-picked threshold. `empirical_risk()` (`engine.py:1481-1493`) ranks the disease's
  value against the current reference cohort's distribution for that same feature
  (mid-rank handling for ties), then inverts it if higher-is-better
  (`direction="favorable_high"`, e.g. more trials = lower risk) or keeps it direct if
  higher-is-worse (`direction="risk_high"` — currently unused by any feature, but
  supported). A feature not marked `scoreable` (e.g. `fda_label_signal`) is retrieved and
  displayed but never contributes to any score.

This is why scores are cohort-dependent: the same raw trial count can score differently
depending on which other diseases are in the reference cohort at the time
(`fit_reference_stats()`, `engine.py:1452-1469`). Two different reference cohorts exist in
practice — the **public portfolio cohort** (`main.PORTFOLIO`, currently the same 100
names as `DEFAULT_MANUSCRIPT_COHORT`) and the **manuscript's historical cohort** (frozen
at `baseline_date`, see §6). They are stored under different `cohort_id`s
(`cohort_id_for()`, a hash of the sorted disease-name list) and must never be conflated.

## 5. Domain scores and the composite Translation Risk Score (TRS)

`calculate_score_from_values()` (`engine.py:1507-1555`):

1. **Domain score** = unweighted mean of that domain's available (non-null) feature risks.
   A domain with zero ascertained scoreable features is `None`, not 0 — an unscored
   domain must never silently read as "zero risk."
2. **TRS** = weighted mean of the available domain scores. Default weights are all `1.0`
   (equal-weight), overridable via `domain_weights`, but no call site currently passes
   non-default weights. If a domain is `None` it is excluded from both the numerator and
   the weight denominator — TRS is never penalized just because one domain has no data.
3. Two coverage metrics are reported alongside TRS, not folded into it:
   - **Ascertainment completeness** = % of all eligible `FEATURE_SPECS` entries that have
     *any* value (ascertained), regardless of type or what that value is.
   - **Evidence coverage** = % of Type B features specifically that are
     `CONFIRMED_PRESENT`.

TRS is a **risk** score: higher = more translation risk = further from patient access,
not a "goodness" score. The frontend inverts it to "readiness" for some displays — see
[ARCHITECTURE.md](ARCHITECTURE.md#readiness-vs-risk-a-known-duplication) for where that
inversion happens and a known inconsistency in how it's computed.

`main.py`'s `risk_band()` (`main.py:105-112`) buckets TRS into `HIGH` (≥66),
`MODERATE` (≥33), `LOW` (<33), or `UNSCORED` (TRS is `None`) purely for display — this
banding is a `main.py` presentation convenience, not part of `engine.py`'s scoring math.

## 6. Historical snapshots vs. current data

Every retrieval function accepts an optional `as_of_date`. When set:

- ClinicalTrials.gov records are filtered to studies that had **both** started **and**
  been publicly posted by that date (`fetch_clinical_trials()`, `engine.py:958-1015`) —
  present-day trial status is never used to infer a past state.
  `active_trials_current` is deliberately left `None` for historical snapshots because
  current `OverallStatus` can't be reconstructed retroactively.
- Europe PMC queries add a `FIRST_PDATE` upper bound (`europe_pmc_search()`,
  `engine.py:1030-1031`).
- NIH RePORTER funding is windowed to the five fiscal years ending at that date's year.
- openFDA label signal is **not** fetched at all for historical snapshots
  (`run_type_a_retrieval()`, `engine.py:1325-1326`) — it's inherently a present-day
  lookup, used only for the current snapshot and for outcome derivation (§8).

`CURRENT_SNAPSHOT = "current"` is the public site's live snapshot key.
`DEFAULT_BASELINE_DATE = "2015-12-31"` is the manuscript's historical index date;
`DEFAULT_FOLLOWUP_END = "2025-12-31"` is the outcome window end. These are separate
snapshot rows in every evidence/score table, keyed by `(disease_id, snapshot_date, ...)`
— they never overwrite each other.

## 7. Counterfactual analysis

`counterfactual_for_feature()` (`engine.py:1835-1914`) answers "what would this disease's
TRS/predicted probability be if one *specific, modifiable, factual* input changed" —
never a causal claim, purely a rerun of the identical frozen scoring pipeline on an
in-memory copy of that disease's feature values. The stored evidence database is never
mutated by a counterfactual run.

- Only features with `modifiable=True` are eligible (see
  [FEATURE_DICTIONARY.md](FEATURE_DICTIONARY.md) for which ones).
- If the feature is already `True`/present, there's nothing to simulate — not eligible.
- **Type B scenario**: flip the missing feature to `True` (evidence becomes present).
- **Type A scenario**: move the value to the 75th percentile of the current reference
  cohort's distribution for that feature — a plausible "meaningfully better than most
  peers" target, not an arbitrary maximum.
- If a fitted probability model is available (`fit_final_probability_model()`, trained on
  `TRS` + `EvidenceCoverage` against the outcome), the scenario also reports a predicted
  probability delta, not just a TRS delta.

`rank_counterfactuals()` runs every eligible modifiable Type B feature for one disease and
sorts by predicted impact — "which lever matters most for this disease."
`cohort_counterfactual_analysis()` runs that ranking across the top risk quartile of an
entire cohort — "does one intervention dominate, or is the best lever idiosyncratic per
disease." This is the CTR (Counterfactual Translation Risk) layer described in
`Objective Scoring/06_Counterfactual_Translation_Risk_Scoring.docx`.

## 8. Outcome derivation (for validation, not for scoring)

`derive_outcome()` (`engine.py:1599-1636`) computes, for a disease/index-date/follow-up
window, whether it progressed — used only to *validate* whether TRS predicts real
translation progress, never fed back into TRS itself:

- **Primary outcome** (`Phase3Outcome`): did a Phase III interventional study start within
  `[index_date, followup_end]`?
- **Supplementary signal** (`approval_label_signal`): did an openFDA label's
  `effective_time` fall in that same window?
- **Composite** (`late_stage_advancement`): either of the above.

`run_manuscript_analyses()` (`engine.py:1792-1812`) then fits cross-validated logistic
models (TRS alone, evidence coverage alone, both together, all five domains) against
`Phase3Outcome`, reporting bootstrapped AUC, Brier score, accuracy/precision/recall, plus
univariate odds ratios per predictor and a correlation matrix. See
[MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md) for how this feeds the
manuscript's Results section.

## 9. Versioning discipline

`APP_VERSION`, `MODEL_VERSION`, `EXTRACTOR_VERSION` (`engine.py:113-115`) exist precisely
so that changing the scoring math or Type B rules doesn't silently corrupt old evidence.
`stale_extractor_versions()` / `wipe_type_b_evidence()` (`engine.py:1985-2014`) let an
operator detect and purge evidence generated under an older ruleset before treating a
cohort's numbers as internally consistent. **Bump the relevant version string any time you
change `TYPE_B_RULES`, `FEATURE_SPECS` scoring behavior, or `calculate_score_from_values()`
math** — this is a hard rule, see
[CLAUDE.md](../CLAUDE.md#things-future-claude-sessions-must-not-accidentally-change).

The frozen `Manuscript Bundle/methods_snapshot.txt` (one directory above this repo, at
`../Manuscript Bundle/`) was generated under `Extractor: typeB_rules_v3.0` — one version
behind the `typeB_rules_v3.1` currently in `engine.py`. See
[CURRENT_STATUS.md](CURRENT_STATUS.md) for what this means and why it hasn't been
resolved yet.
