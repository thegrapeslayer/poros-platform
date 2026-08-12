// Distinguishes disease provenance per the three-tier status the manuscript needs:
//   VALIDATED COHORT   — one of the 100 diseases in DEFAULT_MANUSCRIPT_COHORT
//                         (backend/app/engine.py), the frozen set the manuscript's
//                         analysis is actually about.
//   EXPLORATORY PROFILE — resolved by POROS's free-text resolver but NOT a cohort
//                         member. Not reachable today: the public site only ever
//                         offers cohort names (SearchBar filters the fetched
//                         portfolio list; there's no free-text lookup path yet). This
//                         variant exists so that state has a defined look the day
//                         free-text search ships, instead of being invented ad hoc.
//   Unscored is intentionally NOT a third variant here — RiskBadge already renders an
//   "Unscored" pill for that case; this badge is only about cohort membership, not
//   scoring status, so a cohort member with no score yet still reads as "Validated
//   Cohort" (it's prespecified, just not scored yet) alongside RiskBadge's "Unscored".
const COPY = {
  validated: {
    label: "Validated cohort",
    tooltip:
      "One of the 100 diseases in POROS's frozen manuscript cohort (DEFAULT_MANUSCRIPT_COHORT). This membership is prespecified — the disease is part of the analysis regardless of whether it has a score yet.",
    className: "bg-sage-soft text-sage-dark border-sage/30",
  },
  exploratory: {
    label: "Exploratory profile",
    tooltip:
      "Resolved by POROS outside the frozen 100-disease manuscript cohort. Not part of the validated analysis — treat this profile as illustrative, not a manuscript data point.",
    className: "bg-gold-soft text-gold border-gold/30",
  },
} as const;

export default function CohortBadge({ status }: { status: "validated" | "exploratory" }) {
  const c = COPY[status];
  return (
    <span
      title={c.tooltip}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium eyebrow cursor-help ${c.className}`}
    >
      {c.label}
    </span>
  );
}
