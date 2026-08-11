"use client";

import { useState } from "react";
import { compareDiseases, type DiseaseSummary } from "@/lib/api";
import RiskBadge from "./RiskBadge";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

const COLORS = ["#6f8a76", "#ab8a52", "#b06a55", "#5b7fa6"];
const DOMAIN_ORDER = ["biological", "clinical", "regulatory", "economic", "infrastructure"];
const DOMAIN_LABELS: Record<string, string> = {
  biological: "Biological",
  clinical: "Clinical",
  regulatory: "Regulatory",
  economic: "Economic",
  infrastructure: "Infrastructure",
};

export default function CompareClient({ options }: { options: { name: string; slug: string }[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<DiseaseSummary[]>([]);
  const [loading, setLoading] = useState(false);

  function toggle(name: string) {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : s.length < 4 ? [...s, name] : s));
  }

  async function runCompare() {
    if (!selected.length) return;
    setLoading(true);
    try {
      const data = await compareDiseases(selected);
      setResults(data.diseases);
    } finally {
      setLoading(false);
    }
  }

  const chartData = DOMAIN_ORDER.map((d) => {
    const row: Record<string, number | string> = { domain: DOMAIN_LABELS[d] };
    results.forEach((r) => {
      const risk = r.domains?.[d];
      row[r.name] = risk == null ? 0 : Math.round((100 - risk) * 10) / 10; // readiness
    });
    return row;
  });

  return (
    <div>
      <p className="text-sm text-muted mb-3">Pick up to 4 diseases</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {options.map((o) => (
          <button
            key={o.slug}
            onClick={() => toggle(o.name)}
            className={`px-3 py-1.5 rounded-full text-xs border hairline transition-colors ${
              selected.includes(o.name) ? "bg-sage text-white border-sage" : "bg-card text-ink/80 hover:bg-sage-soft/50"
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>
      <button
        onClick={runCompare}
        disabled={!selected.length || loading}
        className="px-5 py-2.5 rounded-full bg-ink text-paper text-sm disabled:opacity-40"
      >
        {loading ? "Comparing…" : `Compare ${selected.length || ""}`}
      </button>

      {results.length > 0 && (
        <div className="mt-10 grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={r.slug} className="border hairline rounded-xl bg-card p-4 flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm text-ink">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {r.name}
                  </p>
                  <p className="text-xs text-muted mt-1">TRS {r.trs != null ? r.trs.toFixed(1) : "—"}</p>
                </div>
                <RiskBadge band={r.risk_band} />
              </div>
            ))}
          </div>
          <div className="h-80 border hairline rounded-xl bg-card p-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData}>
                <PolarGrid stroke="#ddd2bd" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12, fill: "#6d7268" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6d7268" }} />
                {results.map((r, i) => (
                  <Radar
                    key={r.slug}
                    name={r.name}
                    dataKey={r.name}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.15}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
