# Feature Dictionary

Status: **manuscript-frozen** — this is a direct transcription of `FEATURE_SPECS` in
`backend/app/engine.py:254-349`, cross-checked against
`../Manuscript Bundle/feature_dictionary.csv` (which `export_manuscript_bundle()` in
`engine.py` generates directly from this same `FEATURE_SPECS` dict, so the two cannot
drift on their own — if they ever look different, someone hand-edited the CSV, which
should not happen). 29 features across 5 domains. See
[SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md) for how these values become risk scores.

**Do not add, remove, rename, or reword a feature here without making the identical
change in `FEATURE_SPECS` (and bumping `MODEL_VERSION`/`EXTRACTOR_VERSION` as
appropriate) — this file is documentation of the code, not an independent spec.**

Columns: **Type** = A (structured, from an API) or B (documentary, text-classified) — see
[SCORING_METHODOLOGY.md §1](SCORING_METHODOLOGY.md#1-two-evidence-types-not-two-domains).
**Modifiable** = eligible as a counterfactual lever (§7 of that doc). **Scoreable** = No
means the feature is retrieved/displayed but excluded from all domain/TRS math.

## Biological tractability (`biological`)

| feature_id | Label | Type | Modifiable | Scoreable | Description |
|---|---|:-:|:-:|:-:|---|
| `causal_molecular_basis` | Causal molecular basis documented | B | No | Yes | Qualifying human-genetic or molecular evidence documents a causal gene, lesion, or mechanism. |
| `actionable_target` | Actionable therapeutic target documented | B | Yes | Yes | Documented preclinical evidence identifies a specific target or rescuable molecular process. |
| `human_disease_model` | Human-relevant disease model documented | B | Yes | Yes | Patient-derived cells, iPSC, organoid, ex vivo tissue, or equivalent human model reproduces disease biology. |
| `in_vivo_model` | In vivo disease model documented | B | Yes | Yes | An animal/in vivo model is explicitly described for the disease. |
| `preclinical_rescue` | Preclinical phenotypic rescue documented | B | Yes | Yes | An intervention improves or rescues a disease-relevant phenotype in a model. |

`causal_molecular_basis` is the one Type B feature marked non-modifiable: whether a
disease's genetic/molecular cause is already known isn't a lever a counterfactual
scenario can plausibly flip.

## Clinical development (`clinical`)

| feature_id | Label | Type | Modifiable | Scoreable | Description |
|---|---|:-:|:-:|:-:|---|
| `natural_history_study` | Prospective/longitudinal natural-history evidence | B | Yes | Yes | A natural-history or longitudinal observational study characterizes disease course. |
| `patient_registry` | Disease-specific registry documented | B | Yes | Yes | Documentary evidence identifies a disease-specific patient registry. |
| `validated_outcome_measure` | Validated/trial-tested outcome measure documented | B | Yes | Yes | A validated, qualified, or explicitly trial-tested disease-relevant outcome measure is documented. |
| `biomarker_in_trial` | Biomarker used prospectively in a trial | B | Yes | Yes | A biomarker is used prospectively as an endpoint, stratifier, or pharmacodynamic measure. Can also be force-confirmed directly from ClinicalTrials.gov outcome text (see engine.py `aggregate_features`). |
| `trial_count` | Trials existing by snapshot | A | No | Yes | Count of ClinicalTrials.gov studies matching the disease, eligible as of the snapshot date. |
| `completed_by_snapshot` | Trials completed by snapshot | A | No | Yes | Count of eligible trials with a completion date on/before the snapshot. |
| `highest_phase_by_snapshot` | Highest phase reached by snapshot | A | No | Yes | Maximum trial phase (1–4) among eligible trials. |
| `median_enrollment` | Median trial enrollment | A | No | Yes | Median enrollment count across eligible trials. |
| `unique_trial_sites` | Unique trial sites | A | No | Yes | Count of distinct facility/city/country site combinations across eligible trials. |

## Regulatory pathway (`regulatory`)

| feature_id | Label | Type | Modifiable | Scoreable | Description |
|---|---|:-:|:-:|:-:|---|
| `orphan_designation_evidence` | Orphan designation evidence | B | Yes | Yes | A qualifying source documents orphan/rare-disease regulatory designation for a therapeutic program. |
| `expedited_designation_evidence` | Expedited regulatory designation evidence | B | Yes | Yes | A qualifying source documents Fast Track, Breakthrough, RMAT, PRIME, or equivalent designation. |
| `surrogate_endpoint_precedent` | Surrogate/intermediate endpoint precedent | B | Yes | Yes | A qualifying source documents surrogate/intermediate endpoint acceptance or use in regulatory development. |
| `fda_label_signal` | FDA label indication signal | A | No | **No** | Best-effort present-day openFDA label match count. Not authoritative approval history — displayed for context only, never scored. |

## Economic sustainability (`economic`)

| feature_id | Label | Type | Modifiable | Scoreable | Description |
|---|---|:-:|:-:|:-:|---|
| `unique_sponsors` | Unique trial sponsors | A | No | Yes | Count of distinct sponsor names across eligible trials. |
| `industry_sponsors` | Unique industry sponsors | A | No | Yes | Count of distinct sponsors classified `INDUSTRY` by ClinicalTrials.gov. |
| `industry_trials` | Industry-sponsored trials | A | No | Yes | Count of eligible trials with an industry lead sponsor. |
| `nih_funded_projects` | NIH-funded projects, five-year window | A | No | Yes | Distinct NIH RePORTER project count over the 5 fiscal years ending at the snapshot year. |
| `nih_funding_total` | NIH funding, five-year window | A | No | Yes | Summed award amount (USD) over that same 5-year window. |

## Translation infrastructure (`infrastructure`)

| feature_id | Label | Type | Modifiable | Scoreable | Description |
|---|---|:-:|:-:|:-:|---|
| `patient_organization` | Patient organization documented | B | Yes | Yes | A disease-specific foundation, alliance, association, or patient advocacy organization is documented. |
| `biobank` | Biobank/biospecimen resource documented | B | Yes | Yes | A disease-specific or disease-accessible biobank/biospecimen resource is documented. |
| `natural_history_consortium` | Natural-history consortium documented | B | Yes | Yes | A multicenter consortium/network explicitly conducts disease natural-history work. |
| `multicenter_network` | Multicenter clinical/research network documented | B | Yes | Yes | A disease-focused multicenter consortium, network, or coordinated program is documented. |
| `consensus_guidance` | Consensus diagnostic/management guidance documented | B | Yes | Yes | Published consensus diagnostic criteria, practice recommendations, or management guidelines exist. |
| `nih_funding_institutions` | NIH-funded institutions, five-year window | A | No | Yes | Distinct institution count across NIH RePORTER projects in the 5-year window. |

## Type B retrieval rules

Every Type B feature above has a matching entry in `TYPE_B_RULES` (`engine.py:359-475`):
a Europe PMC search query, one or more required condition-phrase groups (all must match
within the same evidence window), and exclusion phrases that disqualify a match. These
rules are the actual classifier — the `description` column above is a human gloss, not
the executable definition. To see or change what counts as evidence for a given feature,
edit `TYPE_B_RULES[feature_id]` directly, and bump `EXTRACTOR_VERSION` when you do. Full
rule text is reproduced in [SCORING_METHODOLOGY.md §2](SCORING_METHODOLOGY.md#2-type-b-classification-paired-disease-proximate-exclusion-aware-rules)
conceptually, and lives verbatim in the code.

## Direction

All 29 features currently use `direction="favorable_high"` (the default) — i.e., for
every scoreable Type A feature, a higher raw value is interpreted as *lower* risk
(more trials, more funding, more sites = more translation activity = less risk). No
feature currently uses `direction="risk_high"`, though `FeatureSpec` supports it for a
future numeric feature where higher is worse.
