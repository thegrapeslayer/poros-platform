# Variable Disposition — Objective Scoring Rubric vs. Implemented Feature Set

**Status: v2 — code-audited reconciliation. Rationale categories are assigned by
capability analysis of the actual repository, not recovered developer intent. Project
owner review still required before this is cited as a manuscript decision.**

**Manuscript-ready supplement export**: all 46 rows below (rubric variable, domain,
`feature_id`, status, exclusion category number, rationale, Methods-text impact,
reconsider-before-freeze) are also available as a flat, submission-ready CSV at
[`supplement/Table_S1_Variable_Disposition.csv`](supplement/Table_S1_Variable_Disposition.csv)
— generated directly from this document, not maintained separately, so the two never
drift apart. Regenerate it (don't hand-edit the CSV) if this document's table changes.

## How this document was built, and its limits

Every rationale below was checked against one of three things: (1) which of the four
integrated APIs (ClinicalTrials.gov, Europe PMC/PubMed, NIH RePORTER, openFDA) could
plausibly supply the variable, (2) what the implemented Type B classifier
(`TYPE_B_RULES`, paired-regex-with-exclusions over titles/abstracts) can structurally
distinguish, and (3) what `as_of_date` historical-snapshot filtering can and can't
reconstruct. **No commit message, code comment, or prior document anywhere in this
repository states why any of the 17 gap variables were left out** — there is no
recovered developer intent to report. Where a rationale below reads as confident, that
confidence is about *capability* ("no integrated source can supply this reproducibly"),
not about *why the original implementer chose not to build it*. Per the request that
produced this document, nothing here is invented evidence — every claim cites a specific
file:line or docx passage, and any item too ambiguous to categorize this way is called
out explicitly rather than forced into a category. **Zero items ended up in that
"unresolved" bucket** — every gap traced to a checkable capability limit — but that
means the categorization is defensible, not that it is the project owner's intended
rationale. Treat every row as a proposal for review, not a ruling.

Rationale categories (as specified):
1. Cohort-wide ascertainment not reproducible
2. Historical snapshot/timestamp not reliable
3. Extraction rule insufficiently objective or validated
4. Source unavailable/inconsistent across diseases
5. Redundant with a retained variable / double-counting risk
6. Excessive missingness
7. Outside final construct definition
8. Other, with explanation

---

## Biological tractability (9 rubric variables → 5 implemented, 0 merged, 4 excluded)

| Rubric variable | feature_id | Status | Rationale | Changes Methods text? | Reconsider before freeze? |
|---|---|---|---|---|---|
| Causal molecular basis established | `causal_molecular_basis` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Actionable therapeutic target identified | `actionable_target` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Human-relevant disease model available | `human_disease_model` | IMPLEMENTED | Exact 1:1 match. | No | No |
| In vivo disease model available | `in_vivo_model` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Phenotypic rescue demonstrated preclinically | `preclinical_rescue` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Dominant mechanistic convergence | — | EXCLUDED | **Cat. 3.** Rubric defines this as "most known disease-causing variants converge on one principal pathway" — a comparative/proportional judgment across the *entire* mutation spectrum of a disease, not a single yes/no fact statable in one abstract passage. The `TYPE_B_RULES` paired-regex-window classifier (`classify_type_b()`, `engine.py:1100-1177`) is built to confirm a single qualifying phrase co-occurring with the disease in one sentence window — it has no mechanism to weigh "most" vs. "some" mutations across a literature base. | Yes — should state this construct was excluded as unsuited to the retrieval/classification method used for other Type B features. | Maybe — could be approximated by a human-coded categorical field if a future pass wants it, but not via the existing automated pipeline. |
| Independent replication of mechanism | — | EXCLUDED | **Cat. 1 + 3.** Requires counting *independent research groups*, not just occurrences of a phrase — Europe PMC search results don't carry a reliable, API-exposed "distinct research group" identifier, and a regex classifier can't disambiguate two papers from the same lab restating a finding from two truly independent groups. | Yes | Maybe, if a future author-affiliation-clustering step is added. |
| Genotype-phenotype predictability | — | EXCLUDED | **Cat. 3.** Rubric specifies this as *ordinal* (0/50/100, "well established / partial-inconsistent / not established"), not binary — the current Type B pipeline only ever produces `CONFIRMED_PRESENT`/`NOT_CONFIRMED`/`UNASCERTAINED`, with no mechanism to grade a three-level ordinal judgment from paired-regex matches. | Yes | Yes — this is the kind of construct most likely to need a dedicated (non-regex) coding pass if the manuscript wants it; flag for owner decision on whether it's worth a manual/hybrid protocol. |
| Therapeutic modality precedent | — | EXCLUDED | **Cat. 4.** Requires cross-disease regulatory-approval matching by *modality* (gene therapy, ASO, enzyme replacement, etc.) — no field in any of the four integrated sources tags approvals by modality; `fda_label_signal` (see Regulatory domain below) is disease-indication-matched, not modality-matched, and doesn't cover other diseases' approvals at all. | Yes | No — would require a new, currently unavailable structured source (e.g. a curated modality-to-approval table) before this is feasible. |

---

## Clinical development (11 rubric variables → 8 implemented, 0 merged, 2 excluded, 1 future work)

| Rubric variable | feature_id | Status | Rationale | Changes Methods text? | Reconsider before freeze? |
|---|---|---|---|---|---|
| Prospective natural-history study | `natural_history_study` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Disease-specific patient registry | `patient_registry` | IMPLEMENTED | Exact 1:1 match. Also stands in for the Infrastructure-domain "Formal patient registry" item — see that domain's table below. | No | No |
| Validated clinical outcome measure | `validated_outcome_measure` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Biomarker used prospectively in interventional study | `biomarker_in_trial` | IMPLEMENTED | Match, plus a structured-evidence upgrade path: `aggregate_features()` (`engine.py:1392-1394`) force-confirms this feature directly from ClinicalTrials.gov outcome-measure text (`biomarker_trial_signal`, `fetch_clinical_trials()` `engine.py:996`) in addition to the Type B literature search — implemented at *higher* rigor than the rubric's single-source specification, not lower. | Worth noting as a positive deviation. | No |
| Completed interventional trials | `completed_by_snapshot` | IMPLEMENTED | Conceptual match ("Trials completed by snapshot"). | No | No |
| Highest phase reached | `highest_phase_by_snapshot` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Median enrollment of completed trials | `median_enrollment` | IMPLEMENTED, scope differs | Rubric specifies "of *completed* trials." Code computes it over every snapshot-eligible trial regardless of completion status (`enrollments = [... for r in eligible if ...]`, `engine.py:988-989`, where `eligible` is all trials passing the date filter, not filtered to `completed_by_snapshot`'s subset). | **Yes — Methods should describe the actual population (all eligible trials, not completed-only).** | Yes — flag for owner: narrow to completed-only to match rubric, or keep broader population and document the deviation explicitly. |
| Recruiting-site breadth | `unique_trial_sites` | IMPLEMENTED, scope differs | Rubric specifies "across *active* interventional trials." Code computes it over all snapshot-eligible trials (`sites = {s for r in eligible for s in r["sites"]}`, `engine.py:990`), not filtered to currently-active ones. | **Yes**, same reason as above. | Yes, same as above. |
| Currently recruiting interventional trials | — | FUTURE WORK | **Cat. 2, conditionally.** The raw value (`active_trials_current`) is *already computed and stored* as a raw observation for the **current** snapshot (`fetch_clinical_trials()`, `engine.py:976-982`) — this is the lowest-effort gap to close of all 17. But it is explicitly `None` for historical snapshots: *"cannot reconstruct reliably from current OverallStatus"* (`engine.py:980`, code comment, directly quoted). Since the frozen manuscript cohort scores at the historical `baseline_date` (2015-12-31), this variable is structurally unusable for the manuscript's historical analysis even though it works for the live public site. | Yes, if added to the live site only — must be documented as current-snapshot-only, not applicable historically. | **Yes — recommend for the live/public site specifically; not eligible for the frozen manuscript cohort without a different reconstruction method.** |
| Multinational or multicenter registry | — | EXCLUDED | **Cat. 3 + 7.** Distinct from (not a duplicate of) "Disease-specific patient registry" above — it requires the registry to additionally span ≥2 countries or ≥3 centers. `patient_registry`'s `TYPE_B_RULES` entry (`engine.py:408-412`) tests only generic registry-existence phrases and has no logic to detect multinational/multicenter scope from text. This is a narrower construct than what's implemented, not a redundant one. | Yes — Methods should note that registry scope (single- vs. multi-site) is not distinguished; only registry existence is scored. | Maybe, if the manuscript wants to make a scope claim about registries specifically. |
| Diagnosed/recruitable patient estimate | — | EXCLUDED | **Cat. 4.** Rubric's own preferred source is "Registry / epidemiology / claims literature" — no epidemiology or prevalence-estimate API is integrated in `engine.py` at all (the four integrated sources are trials, literature-abstract search, NIH grants, and FDA labels; none carry prevalence estimates). Same underlying gap as Economic's "Patient population estimate" below — see that row for the cross-domain redundancy note. | Yes | No, not without a new source integration (e.g. Orphanet epidemiology API), which doesn't currently exist in this codebase. |

---

## Regulatory pathway (8 rubric variables → 3 scored + 1 retrieved-but-unscored, 4 excluded)

| Rubric variable | feature_id | Status | Rationale | Changes Methods text? | Reconsider before freeze? |
|---|---|---|---|---|---|
| Orphan designation for a therapeutic program | `orphan_designation_evidence` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Expedited regulatory designation | `expedited_designation_evidence` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Accepted surrogate or intermediate endpoint | `surrogate_endpoint_precedent` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Approved therapy for the same disease | `fda_label_signal` (retrieved, **not scored** — `scoreable=False`) | EXCLUDED (from scoring) | **Cat. 8 — this is the one row with unusually strong, document-grounded rationale rather than inference.** `fda_label_signal` *is* retrieved (openFDA label match count, `fetch_fda_label_signal()`, `engine.py:1277-1308`) but explicitly excluded from every domain/TRS calculation (`FeatureSpec(..., scoreable=False)`, `engine.py:313-316`, own description: *"not authoritative approval history"*). This tracks directly to the rubric's own **Master Index, "Non-negotiable exclusions"**: *"No current approval status may be used to predict the same historical approval outcome."* `approval_label_signal` is literally one of three outcome variables `derive_outcome()` computes for validation (`engine.py:1599-1636`) — using present-day approval status as a *predictor* while also validating against approval-derived outcomes would be textbook leakage, which the rubric itself forbids. | **Yes — this is the strongest candidate for an explicit Methods sentence**, since it's not a capability gap but a deliberate predictor/outcome separation the rubric mandates. | **No — this exclusion should hold; reconsidering it would violate the rubric's own leakage rule.** |
| Modality precedent | — | EXCLUDED | **Cat. 4.** Same modality-tagging gap as Biological's "Therapeutic modality precedent" — no integrated source tags regulatory approvals by modality. | Yes | No, not without a new source. |
| External-control precedent | — | EXCLUDED | **Cat. 4.** Requires identifying regulatory review documents that accepted natural-history/external controls — not retrievable from ClinicalTrials.gov, Europe PMC, NIH RePORTER, or openFDA; would need FDA/EMA review-document full text, which isn't integrated. | Yes | No, not without a new source. |
| Number of formal regulatory approvals | — | EXCLUDED | **Cat. 4, related to the leakage concern above.** `fda_label_signal`'s raw `count` is retrieved but (a) is present-day-only by construction and (b) shares the same predictor/outcome-separation concern as "Approved therapy for the same disease" above. | Yes | No |
| Number of publicly documented regulatory interactions or guidance artifacts | — | EXCLUDED | **Cat. 4.** No FDA/EMA guidance-document or advisory-committee-record source is integrated. | Yes | No, not without a new source. |

---

## Economic sustainability (8 rubric variables → 4 implemented, 3 excluded, 1 future work)

*(`unique_sponsors` is also implemented in this domain but has no rubric counterpart — see "Implementation additions" below.)*

| Rubric variable | feature_id | Status | Rationale | Changes Methods text? | Reconsider before freeze? |
|---|---|---|---|---|---|
| Unique commercial sponsors, last 5 years | `industry_sponsors` | IMPLEMENTED, scope differs | "Commercial" = `sponsor_class == "INDUSTRY"` filter (`engine.py:992`) — correct match. But **no 5-year recency window is applied**: computed over all snapshot-eligible trials, unlike the NIH funding features below which *are* correctly windowed (`fetch_nih_funding()`, `engine.py:1232-1234`, explicit `years = list(range(end_year - 4, end_year + 1))`). This is a real, verifiable inconsistency between two Economic-domain features that both claim a "recent" framing. | **Yes** | **Yes — recommend adding the same 5-year window used for NIH features, for internal consistency within the domain.** |
| Active industry-sponsored interventional trials | `industry_trials` | IMPLEMENTED, scope differs | Rubric specifies "active" (recruiting-status) trials; code counts *all* snapshot-eligible industry-sponsored trials regardless of current status (`engine.py:993`). | Yes | Maybe, if "active" specifically matters to the manuscript claim. |
| Distinct therapeutic programs in clinical development | — | EXCLUDED | **Cat. 1.** Requires de-duplicating trials to the underlying *drug/product* identity, not just counting trials or sponsors — ClinicalTrials.gov's structured fields don't expose a reliable, cohort-wide product identifier for this. | Yes | No, not without a curated product-identity mapping. |
| Program discontinuation burden | — | EXCLUDED | **Cat. 3.** Requires classifying *why* a trial was terminated (non-safety administrative/business reasons vs. safety) — this is exactly the kind of nuanced causal-attribution judgment the paired-regex Type B classifier isn't built for; ClinicalTrials.gov's structured status field (`OverallStatus`) doesn't carry a reason code at all. | Yes | No, not without a new structured field or a much more sophisticated extractor. |
| Recent NIH funding | `nih_funding_total` | IMPLEMENTED, one normalization detail differs | Correctly 5-year windowed. Rubric specifies "log transform then inverse empirical percentile"; `empirical_risk()` (`engine.py:1481-1493`) applies the empirical-percentile transform directly to the raw dollar value, with no log transform step first. | **Yes — Methods should state the actual normalization used.** | Yes — flag for owner: was the log-transform step intentionally dropped (e.g. because rank-based percentiles are already robust to skew) or should it be added? |
| Recent NIH project count | `nih_funded_projects` | IMPLEMENTED | Exact 1:1 match, correctly 5-year windowed. | No | No |
| Patient population estimate | — | EXCLUDED | **Cat. 4.** Same epidemiology-source gap as Clinical's "Diagnosed/recruitable patient estimate" above. **Cross-domain observation**: these two rubric items, in two different domain documents, describe essentially the same underlying construct (a disease's addressable patient population) — worth the project owner's attention as a rubric-internal redundancy independent of implementation status. | Yes | No, not without a new epidemiology source. |
| Sponsor concentration (Herfindahl-Hirschman index) | — | FUTURE WORK | **Cat. 8.** Unlike most excluded items, the *raw ingredient data* (per-sponsor trial counts) is already retrieved (`sponsors`, `industry_sponsors` sets in `fetch_clinical_trials()`) — only the HHI transform itself and a `FEATURE_SPECS` entry are missing. Lower-effort than most gaps here since no new data source is needed, only new derived-statistic logic. | Yes, once added | **Yes — good candidate for a near-term addition given data is already in hand.** |

---

## Translation infrastructure (10 rubric variables → 4 implemented, 3 merged, 2 excluded, 1 future work)

*(`nih_funding_institutions` is also implemented in this domain but has no rubric counterpart — see "Implementation additions" below.)*

| Rubric variable | feature_id | Status | Rationale | Changes Methods text? | Reconsider before freeze? |
|---|---|---|---|---|---|
| Disease-specific patient organization | `patient_organization` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Formal patient registry | `patient_registry` (scored under **Clinical**, not Infrastructure) | MERGED | **Cat. 5, cross-domain.** The rubric specifies this construct independently in *two* domain documents — Clinical §2 ("Disease-specific patient registry") and Infrastructure §2 ("Formal patient registry"), with near-identical definitions. Only one implemented feature exists (`patient_registry`, filed under the Clinical domain in `FEATURE_SPECS`, `engine.py:282-285`). Registry evidence is not separately counted toward the Infrastructure domain. | **Yes — Methods must state registry evidence contributes to Clinical domain risk only, not Infrastructure**, diverging from the rubric's original two-domain double-count. | **Yes — flag for owner: was single-domain attribution intentional, or should Infrastructure also reflect registry presence?** Scoring registry evidence in both domains risks double-counting the same evidence (rubric's own "domain scoring rule" language doesn't obviously permit or forbid this). |
| Biobank or shared biospecimen resource | `biobank` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Natural-history consortium | `natural_history_consortium` | IMPLEMENTED | Exact 1:1 match. | No | No |
| Multicenter clinical network | `multicenter_network` | IMPLEMENTED, threshold not enforced | Rubric requires "at least three independent clinical centers." `TYPE_B_RULES["multicenter_network"]` (`engine.py:465-469`) matches on phrases like "clinical network"/"multicenter consortium" with **no numeric threshold check** — a paired-regex classifier over abstract text has no reliable way to count named centers and compare to a threshold. | **Yes — Methods should state the ≥3-center threshold is not verified; the feature captures "network described," not a counted minimum.** | Maybe, if the ≥3-center precision matters to a manuscript claim; otherwise document as-is. |
| Published diagnostic consensus criteria | `consensus_guidance` | MERGED | **Cat. 5.** `TYPE_B_RULES["consensus_guidance"]`'s single condition group contains phrases for *both* this item and "management/care guidelines" below (`r"consensus guideline"`, `r"diagnostic criteria"`, `r"management guideline"`, `r"practice guideline"` — all in one group, `engine.py:470-474`) — a match on any one of them satisfies the same feature. The two rubric-specified constructs are not distinguished in code. | **Yes — Methods should state these two rubric items are represented by one collapsed binary indicator.** | Yes — flag for owner: split into two `TYPE_B_RULES` entries if the diagnostic-vs-management distinction matters to a manuscript claim, or keep merged and rename the feature label to reflect "consensus guidance of either kind." |
| Published management / care guidelines | `consensus_guidance` | MERGED | Same finding as directly above — one feature covers both rubric items. | (see above) | (see above) |
| Dedicated expert centers | — | EXCLUDED | **Cat. 4.** No integrated source enumerates named "centers of excellence" for a disease. | Yes | No, not without a new curated source. |
| Cross-institution publication network | — | EXCLUDED | **Cat. 4.** Rubric's own preferred source is "PubMed metadata / OpenAlex if used" — OpenAlex is **not integrated anywhere in `engine.py`**, and Europe PMC/PubMed retrieval in this codebase extracts title/abstract/date only, never author-institution affiliation data. | Yes | No, not without adding OpenAlex or an institution-affiliation extraction step. |
| Industry-academic collaboration | — | FUTURE WORK | **Cat. 8.** Similar to sponsor concentration above: per-trial sponsor/collaborator class (`sponsor_class`) is already retrieved per trial in `fetch_clinical_trials()` — classifying a trial as having both academic and industry participants would need aggregating `collaborators`, which the current extraction (`_study_extract()`, `engine.py:919-955`) doesn't pull from the API response at all (only `leadSponsor`, not the full `collaboratorsModule`). Slightly more work than sponsor concentration (needs a new field pulled from the API, not just a new transform on existing data), but still no new *source* required — same API, unused field. | Yes, once added | Yes — good second-priority candidate after sponsor concentration. |

---

## Implementation additions (in `FEATURE_SPECS`, no rubric counterpart)

Three implemented features exist in the code with **no corresponding rubric variable** —
worth reporting for a complete reconciliation, since "46 specified → 29 implemented" is
not a clean subset relationship:

| feature_id | Domain | Why it has no rubric match |
|---|---|---|
| `trial_count` | Clinical | Rubric specifies "Completed" and "Currently recruiting" trial counts separately (see above) but never a plain total-trials count. |
| `unique_sponsors` | Economic | Rubric's Economic §1 specifically asks for *commercial* sponsors (matched by `industry_sponsors`, above); `unique_sponsors` counts sponsors of every class (academic, government, industry), which the rubric doesn't separately request. |
| `nih_funding_institutions` | Infrastructure | Neither the Economic domain (which has NIH funding total + project count) nor the Infrastructure domain specifies an NIH-funded-institution count. |

None of these are problematic — they're reasonable extra signal the implementation
collects — but a manuscript describing "the 29 implemented features" should account for
the fact that 3 of them sit outside the original 46-variable rubric entirely, rather than
implicitly presenting all 29 as a strict subset of the rubric.

---

## Summary counts

| | Count |
|---|---|
| **Exact number specified** (rubric, 5 domain docs) | **46** |
| **Exact number implemented** (clean 1:1, scored) | **24** |
| **Exact number merged** (scored, but combined with another rubric item or attributed to a different domain than specified) | **3** |
| **Exact number excluded** (not implemented, not scored — includes the deliberately-unscored `fda_label_signal`/"Approved therapy" case) | **16** |
| **Exact number future work** (raw data or partial infrastructure already exists; needs new derived logic, not a new source) | **3** |
| **Exact number unresolved** (repository does not contain enough information to assign any rationale category) | **0** |
| Check: 24 + 3 + 16 + 3 | **46** ✓ |
| *(memo, not part of the 46)* Implementation additions with no rubric counterpart | 3 |

## Manuscript-ready paragraph describing variable selection

> Candidate scoring variables were drawn from a prespecified rubric of 46 variables
> across five translation-risk domains. Of these, 24 were retained without modification.
> Three rubric variables were retained but consolidated: registry evidence, specified
> independently under both the Clinical and Infrastructure domains, is scored once under
> Clinical to avoid double-counting a single evidentiary source across two domains; and
> two infrastructure variables — published diagnostic consensus criteria and published
> management/care guidelines — are captured by a single combined evidence rule rather
> than scored independently. Sixteen variables were excluded from the final
> implementation. Exclusions were based on measurement feasibility and reproducibility,
> not on presumed lack of biological or translational importance: variables were retained
> only when they could be ascertained reproducibly, across the full reference cohort,
> using prespecified and auditable retrieval rules operating on structured public APIs
> (ClinicalTrials.gov, Europe PMC, NIH RePORTER, openFDA) or a paired-condition text
> classifier over literature abstracts. Candidate variables were excluded when no
> integrated data source could supply them consistently across diseases (e.g. modality
> precedent, dedicated expert centers, cross-institution publication networks, patient
> population estimates), when the automated text classifier could not be constructed to
> make the required judgment objectively (e.g. mechanistic convergence, program
> discontinuation attribution, genotype-phenotype predictability), or when scoring the
> variable would have introduced predictor/outcome leakage against the study's own
> validation design (present-day approval status, reserved instead as an outcome
> variable). Three additional variables were deferred as future work: the underlying data
> for these is already retrieved by the pipeline, but the derived statistic or extraction
> field needed to score them (a sponsor-concentration index, a currently-recruiting-trials
> count usable only for live rather than historical snapshots, and an
> industry-academic-collaboration flag) had not yet been implemented at the time of model
> freeze.

## Manuscript supplement table (all exclusions)

| # | Domain | Excluded/deferred variable | Category | Reconsider before freeze |
|---|---|---|---|---|
| 1 | Biological | Dominant mechanistic convergence | Extraction rule insufficiently objective | Maybe (human-coded field) |
| 2 | Biological | Independent replication of mechanism | Ascertainment not reproducible + extraction rule insufficient | Maybe (affiliation clustering) |
| 3 | Biological | Genotype-phenotype predictability | Extraction rule insufficiently objective (ordinal, not binary) | Yes |
| 4 | Biological | Therapeutic modality precedent | Source unavailable | No |
| 5 | Clinical | Multinational/multicenter registry | Extraction rule insufficient / outside construct definition | Maybe |
| 6 | Clinical | Diagnosed/recruitable patient estimate | Source unavailable | No |
| 7 | Clinical | Currently recruiting interventional trials | Historical snapshot unreliable (deferred, not excluded) | **Yes — live site only** |
| 8 | Regulatory | Approved therapy for the same disease | Reserved as outcome variable (leakage) | **No — should not be reconsidered** |
| 9 | Regulatory | Modality precedent | Source unavailable | No |
| 10 | Regulatory | External-control precedent | Source unavailable | No |
| 11 | Regulatory | Number of formal regulatory approvals | Source unavailable / leakage-adjacent | No |
| 12 | Regulatory | Number of regulatory interactions/guidance artifacts | Source unavailable | No |
| 13 | Economic | Distinct therapeutic programs in development | Ascertainment not reproducible | No |
| 14 | Economic | Program discontinuation burden | Extraction rule insufficiently objective | No |
| 15 | Economic | Patient population estimate | Source unavailable | No |
| 16 | Economic | Sponsor concentration (HHI) | Deferred — data in hand, transform missing | **Yes — near-term candidate** |
| 17 | Infrastructure | Dedicated expert centers | Source unavailable | No |
| 18 | Infrastructure | Cross-institution publication network | Source unavailable (OpenAlex not integrated) | No |
| 19 | Infrastructure | Industry-academic collaboration | Deferred — field not yet extracted from API | Yes — second-priority candidate |

*(19 rows because the 16 "excluded" + 3 "future work" categories are combined here for
a single reportable table, per manuscript supplement convention; the two reserved-as-outcome
items — "Approved therapy" and "Number of formal regulatory approvals" — are listed
individually since they warrant distinct citation.)*

## What this document does not do

Per the instructions that produced it: **no scoring code was changed.** This is a
reconciliation and proposal document only. Before any of the "reconsider before freeze"
items are acted on, or before this document is cited in a manuscript methods section, the
project owner should review every MERGED and FUTURE WORK row in particular — those are
the rows where a different decision (splitting a merged feature, adding a deferred one)
is most plausible and most likely to change reported domain scores.
