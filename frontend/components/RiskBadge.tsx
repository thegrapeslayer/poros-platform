import type { RiskBand } from "@/lib/api";

const STYLES: Record<RiskBand, string> = {
  HIGH: "bg-rose-soft text-rose border-rose/30",
  MODERATE: "bg-gold-soft text-gold border-gold/30",
  LOW: "bg-sage-soft text-sage-dark border-sage/30",
  UNSCORED: "bg-paper2 text-muted border-line",
};

const TOOLTIPS: Record<RiskBand, string> = {
  HIGH: "Translation Risk Score of 66 or higher — furthest from patient access among scored diseases.",
  MODERATE: "Translation Risk Score between 33 and 65.",
  LOW: "Translation Risk Score below 33 — closest to patient access among scored diseases.",
  UNSCORED: "No Translation Risk Score yet — this disease hasn't been scored in the current snapshot.",
};

const LABELS: Record<RiskBand, string> = {
  HIGH: "High risk",
  MODERATE: "Moderate risk",
  LOW: "Low risk",
  UNSCORED: "Unscored",
};

export default function RiskBadge({ band }: { band: RiskBand }) {
  const safeBand = STYLES[band] ? band : "UNSCORED";
  return (
    <span
      title={TOOLTIPS[safeBand]}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium eyebrow cursor-help ${STYLES[safeBand]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {LABELS[safeBand]}
    </span>
  );
}
