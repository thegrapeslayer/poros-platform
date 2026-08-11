import type { RiskBand } from "@/lib/api";

const STYLES: Record<RiskBand, string> = {
  HIGH: "bg-rose-soft text-rose border-rose/30",
  MODERATE: "bg-gold-soft text-gold border-gold/30",
  LOW: "bg-sage-soft text-sage-dark border-sage/30",
  UNSCORED: "bg-paper2 text-muted border-line",
};

export default function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium eyebrow ${STYLES[band]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {band}
    </span>
  );
}
