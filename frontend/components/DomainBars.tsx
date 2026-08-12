const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = {
  biological: "Biological",
  clinical: "Clinical",
  regulatory: "Regulatory",
  economic: "Economic",
  infrastructure: "Infrastructure",
};
const DOMAIN_TOOLTIPS: Record<string, string> = {
  biological: "Is there a known causal mechanism and a plausible way to intervene on it?",
  clinical: "Is the disease being studied in trials, with the tools trials need?",
  regulatory: "Has the regulatory system already engaged with this disease?",
  economic: "Is there funding and sponsor interest behind development?",
  infrastructure: "Do supporting structures (registries, biobanks, patient orgs) exist?",
};

// Bar color follows the same HIGH/MODERATE/LOW thresholds as RiskBadge (main.py
// risk_band): >=66 high risk, >=33 moderate, else low. Keeping this on the same 0-100
// risk scale as TRS (not inverted to a 0-10 "readiness" scale) is deliberate — showing
// two different scales in opposite directions on the same page was confusing (see
// docs/ARCHITECTURE.md, "Readiness vs. risk" — resolved by this component).
function riskColor(risk: number): string {
  if (risk >= 66) return "bg-rose";
  if (risk >= 33) return "bg-gold";
  return "bg-sage";
}

export default function DomainBars({ domains }: { domains: Record<string, number | null | undefined> }) {
  return (
    <div className="space-y-3">
      {DOMAIN_ORDER.map((d) => {
        const risk = domains[d];
        return (
          <div key={d} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3" title={DOMAIN_TOOLTIPS[d]}>
            <span className="text-sm text-ink/80 cursor-help">{DOMAIN_LABELS[d]}</span>
            <div className="h-2.5 rounded-full bg-paper2 overflow-hidden">
              {risk != null && (
                <div className={`h-full rounded-full ${riskColor(risk)}`} style={{ width: `${risk}%` }} />
              )}
            </div>
            <span className="text-sm font-mono text-right text-ink/70">
              {risk != null ? risk.toFixed(1) : "—"}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted pt-1">
        Domain risk, 0&ndash;100 &mdash; the same scale and direction as the Translation Risk Score above. Higher
        = more risk in that domain.
      </p>
    </div>
  );
}
