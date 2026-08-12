# Variable Disposition — Objective Scoring Rubric vs. Implemented Feature Set

**Status: DRAFT — first-pass categorization, not a confirmed manuscript decision.**

This table exists because the `../Objective Scoring/*.docx` rubric (the prespecified
scoring protocol, six documents: a master index plus one per domain) specifies
**~46 variables**, while `FEATURE_SPECS` in `backend/app/engine.py` implements **29** (see
[FEATURE_DICTIONARY.md](FEATURE_DICTIONARY.md) for the full list of what's implemented).
The manuscript needs to describe the model that actually exists, not the larger one that
was originally scoped — and right now nothing in the repo records *why* the other ~17
variables aren't implemented, which makes that gap look like an oversight rather than a
documented decision.

**I (Claude) am not the right authority to assert final Implemented/Excluded/Future-work
status or write an authoritative "Reason" for each row** — those are scientific/manuscript
decisions for whoever owns this project's methodology. What I've done below: listed every
variable the docx specifies but `FEATURE_SPECS` doesn't implement, grouped by domain, and
noted anywhere the code itself gives a verifiable clue about why (e.g. a value that's
retrieved but silently never scored). Everything else is marked "Reason: TBD — needs your
input" rather than guessed. **Please edit the Status/Reason columns directly and remove
this warning once reviewed.**

## Biological tractability

| Docx variable | Status | Reason |
|---|---|---|
| Causal molecular basis established | Implemented | `causal_molecular_basis` |
| Actionable therapeutic target identified | Implemented | `actionable_target` |
| Human-relevant disease model available | Implemented | `human_disease_model` |
| In vivo disease model available | Implemented | `in_vivo_model` |
| Phenotypic rescue demonstrated preclinically | Implemented | `preclinical_rescue` |
| Dominant mechanistic convergence | Not implemented | TBD — needs your input |
| Independent replication of mechanism | Not implemented | TBD — needs your input |
| Genotype-phenotype predictability | Not implemented | TBD — needs your input |
| Therapeutic modality precedent | Not implemented | TBD — needs your input |

## Clinical development

| Docx variable | Status | Reason |
|---|---|---|
| Prospective natural-history study | Implemented | `natural_history_study` |
| Disease-specific patient registry | Implemented | `patient_registry` |
| Validated clinical outcome measure | Implemented | `validated_outcome_measure` |
| Biomarker used prospectively | Implemented | `biomarker_in_trial` |
| Completed interventional trials (count) | Implemented | `completed_by_snapshot` |
| Highest phase reached | Implemented | `highest_phase_by_snapshot` |
| Median enrollment of completed trials | Implemented | `median_enrollment` |
| Recruiting-site breadth (count) | Implemented | `unique_trial_sites` |
| (implicit: total trial count) | Implemented | `trial_count` — not a separate docx line item but present in the implementation |
| Currently recruiting trials (count) | **Retrieved, not scored** | `fetch_clinical_trials()` computes `active_trials_current` (`engine.py:976-1009`) and saves it as a raw observation, but it has no `FEATURE_SPECS` entry, so it's never scored. Also explicitly `None` for historical snapshots ("cannot reconstruct reliably from current OverallStatus," `engine.py:980`) — only meaningful for the current snapshot. Closest of the "not implemented" rows to being a quick win if wanted. |
| Multinational/multicenter registry | Not implemented | TBD — needs your input. Docx treats this as distinct from the plain "disease-specific patient registry" above; only one registry feature (`patient_registry`) exists in the implementation. |
| Diagnosed/recruitable patient estimate | Not implemented | TBD — needs your input |

## Regulatory pathway

| Docx variable | Status | Reason |
|---|---|---|
| Orphan designation | Implemented | `orphan_designation_evidence` |
| Expedited designation (Fast Track/Breakthrough/RMAT/PRIME) | Implemented | `expedited_designation_evidence` |
| Accepted surrogate/intermediate endpoint | Implemented | `surrogate_endpoint_precedent` |
| Approved therapy for same disease | Implemented (partially / display-only) | Closest match is `fda_label_signal` — but it's explicitly `scoreable=False` ("best-effort present-day label signal; not authoritative approval history," see `FEATURE_DICTIONARY.md`), so it's retrieved and shown but doesn't feed the regulatory domain score. Whether this counts as "implemented" for the disposition table is itself a judgment call — flagged, not resolved. |
| Modality precedent | Not implemented | TBD — needs your input |
| External-control precedent | Not implemented | TBD — needs your input |
| Number of formal regulatory approvals (count) | Not implemented | TBD — needs your input |
| Number of publicly documented regulatory interactions/guidance artifacts (count) | Not implemented | TBD — needs your input |

## Economic sustainability

| Docx variable | Status | Reason |
|---|---|---|
| Unique commercial sponsors (5yr) | Implemented | `unique_sponsors` |
| Active industry-sponsored trials | Implemented | `industry_trials` (plus `industry_sponsors`, a related but not separately docx-listed count) |
| Recent NIH funding (log-transform, inverse percentile) | Implemented (normalization detail differs) | `nih_funding_total` — implemented as a plain empirical-percentile feature; the docx's specific "log-transform then inverse percentile" preprocessing step is not applied before normalization (see `empirical_risk()`, [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md#4-from-raw-value-to-a-0100-risk-number)). Worth your confirming whether the log-transform was intentionally dropped or should be added. |
| Recent NIH project count | Implemented | `nih_funded_projects` |
| Distinct therapeutic programs in clinical development | Not implemented | TBD — needs your input |
| Program discontinuation burden | Not implemented | TBD — needs your input |
| Patient population estimate | Not implemented | TBD — needs your input |
| Sponsor concentration (Herfindahl-Hirschman index) | Not implemented | TBD — needs your input. This is a specific, well-defined statistic (not just "not enough evidence") — plausibly a deliberate later-phase addition rather than an evidence-quality exclusion, but that's a guess, not confirmed. |

## Translation infrastructure

| Docx variable | Status | Reason |
|---|---|---|
| Disease-specific patient organization | Implemented | `patient_organization` |
| Biobank/shared biospecimen resource | Implemented | `biobank` |
| Natural-history consortium | Implemented | `natural_history_consortium` |
| Multicenter clinical/research network (≥3 centers) | Implemented | `multicenter_network` |
| Published diagnostic consensus criteria / management guidelines | Implemented | `consensus_guidance` (docx lists these as two separate lines; implementation has one combined feature) |
| NIH-funded institutions (5yr) | Implemented | `nih_funding_institutions` — not a separate docx infrastructure line item, but present in the implementation |
| Formal patient registry (Infrastructure-domain framing) | Not implemented as a separate feature | Docx Doc 05 lists a registry concept under Infrastructure distinct from Doc 02's Clinical-domain registry; only one `patient_registry` feature exists (filed under Clinical). TBD whether a second, infrastructure-specific registry feature is wanted. |
| Dedicated expert centers (count) | Not implemented | TBD — needs your input |
| Cross-institution publication network (count, 5yr) | Not implemented | TBD — needs your input |
| Industry-academic collaboration (binary) | Not implemented | TBD — needs your input |

## Suggested next step

For each "Not implemented — TBD" row, pick one of the three categories the project asked
for and fill in a real reason:

- **Excluded** — redundant with an implemented variable, or evidence for it isn't reliably
  retrievable/classifiable with the current Type A/B pipeline.
- **Future work** — worth adding, but needs a new `TYPE_B_RULES` entry or a new API
  integration first; not reliable enough yet to trust in scoring.
- **Implemented** (if I mis-mapped it to an existing feature that actually does cover it —
  flag the correction).

Once this table reflects real decisions, it should be referenced from the manuscript's
methods section instead of (or alongside) the docx rubric, since it's the table that
describes the model that actually exists. See
[MANUSCRIPT_REQUIREMENTS.md](MANUSCRIPT_REQUIREMENTS.md#the-objective-scoring-rubric-specifies-more-than-is-implemented)
for the original finding this table is built from.
