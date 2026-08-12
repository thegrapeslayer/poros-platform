const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = {
  biological: "Biological Readiness",
  clinical: "Clinical Readiness",
  regulatory: "Regulatory Readiness",
  economic: "Economic Readiness",
  infrastructure: "Infrastructure Readiness",
};
const DOMAIN_TOOLTIPS: Record<string, string> = {
  biological: "Is there a known causal mechanism and a plausible way to intervene on it?",
  clinical: "Is the disease being studied in trials, with the tools trials need?",
  regulatory: "Has the regulatory system already engaged with this disease?",
  economic: "Is there funding and sponsor interest behind development?",
  infrastructure: "Do supporting structures (registries, biobanks, patient orgs) exist?",
};

// Domain values from the API are *risk* (0 = best, 100 = worst). We invert to
// "readiness" for display, 0-10 scale, so a longer bar reads as more favorable,
// matching the site copy ("Biological Readiness 6.8"). See docs/ARCHITECTURE.md
// "Readiness vs. risk" for why this conversion is duplicated (differently scaled)
// in CompareClient.tsx.
export default function DomainBars({ domains }: { domains: Record<string, number | null | undefined> }) {
  return (
    <div className="space-y-3">
      {DOMAIN_ORDER.map((d) => {
        const risk = domains[d];
        const readiness = risk == null ? null : Math.round((100 - risk) / 10 * 10) / 10;
        return (
          <div key={d} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3" title={DOMAIN_TOOLTIPS[d]}>
            <span className="text-sm text-ink/80 cursor-help">{DOMAIN_LABELS[d]}</span>
            <div className="h-2.5 rounded-full bg-paper2 overflow-hidden">
              {readiness != null && (
                <div
                  className="h-full rounded-full bg-sage"
                  style={{ width: `${(readiness / 10) * 100}%` }}
                />
              )}
            </div>
            <span className="text-sm font-mono text-right text-ink/70">
              {readiness != null ? `${readiness.toFixed(1)}` : "—"}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted pt-1">0&ndash;10 scale · higher = more ready / less translation risk</p>
    </div>
  );
}
