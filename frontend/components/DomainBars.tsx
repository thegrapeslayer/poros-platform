const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = {
  biological: "Biological Readiness",
  clinical: "Clinical Readiness",
  regulatory: "Regulatory Readiness",
  economic: "Economic Readiness",
  infrastructure: "Infrastructure Readiness",
};

// Domain values from the API are *risk* (0 = best, 100 = worst). We invert to
// "readiness" for display so a longer bar reads as more favorable, matching
// the site copy ("Biological Readiness 6.8").
export default function DomainBars({ domains }: { domains: Record<string, number | null | undefined> }) {
  return (
    <div className="space-y-3">
      {DOMAIN_ORDER.map((d) => {
        const risk = domains[d];
        const readiness = risk == null ? null : Math.round((100 - risk) / 10 * 10) / 10;
        return (
          <div key={d} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
            <span className="text-sm text-ink/80">{DOMAIN_LABELS[d]}</span>
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
    </div>
  );
}
