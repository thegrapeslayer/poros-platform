import Link from "next/link";
import { notFound } from "next/navigation";
import { getDisease } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";
import DomainBars from "@/components/DomainBars";
import EvidenceSection from "@/components/EvidenceSection";
import ScoreDiseaseButton from "@/components/ScoreDiseaseButton";
import CohortBadge from "@/components/CohortBadge";

type FetchState =
  | { kind: "ok"; disease: Awaited<ReturnType<typeof getDisease>> }
  | { kind: "not-in-portfolio" }
  | { kind: "not-scored"; name: string }
  | { kind: "error" };

async function loadDisease(slug: string): Promise<FetchState> {
  try {
    const disease = await getDisease(slug);
    return { kind: "ok", disease };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // Backend distinguishes "not in the fixed portfolio at all" (true 404, unslugify
    // failed) from "in the portfolio but never scored yet" (no snapshot) — see
    // backend/app/main.py get_disease() and docs/ARCHITECTURE.md "Routing / slug
    // contract". Only the first case is a real not-found page; the second is a normal,
    // expected state for a disease that hasn't had /api/admin/refresh run for it yet.
    if (message.includes("Unknown disease slug")) {
      return { kind: "not-in-portfolio" };
    }
    if (message.includes("No snapshot")) {
      // main.py's 404 body is "No snapshot for '{name}' yet. ..." — pull the canonical
      // name back out so we can offer to score exactly this disease, not the whole
      // portfolio, without an extra round trip.
      const match = message.match(/No snapshot for '(.+?)' yet/);
      return { kind: "not-scored", name: match?.[1] ?? slug };
    }
    return { kind: "error" };
  }
}

export default async function DiseaseDetailPage({ params }: { params: { slug: string } }) {
  const state = await loadDisease(params.slug);

  // Called directly in the page (not inside loadDisease) so Next.js's App Router
  // correctly attaches the 404 status to the response, not just the not-found UI.
  if (state.kind === "not-in-portfolio") {
    notFound();
  }

  if (state.kind === "not-scored") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="eyebrow text-muted mb-3">Not yet scored</p>
        <div className="flex justify-center mb-4">
          <CohortBadge status="validated" />
        </div>
        <h1 className="font-display text-2xl text-ink mb-4">
          {state.name} is in the POROS portfolio but doesn&rsquo;t have a scored snapshot yet.
        </h1>
        <p className="text-ink/70 leading-relaxed mb-8">
          Its evidence hasn&rsquo;t been retrieved and scored yet. Score just this disease below, or refresh
          the whole portfolio from the diseases page.
        </p>
        <div className="flex flex-col items-center gap-4">
          <ScoreDiseaseButton name={state.name} label={`Score ${state.name} now`} variant="primary" />
          <Link href="/diseases" className="text-sm text-sage-dark hover:underline">
            &larr; Back to all diseases
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="eyebrow text-muted mb-3">Couldn&rsquo;t load this disease</p>
        <h1 className="font-display text-2xl text-ink mb-4">The POROS API didn&rsquo;t respond as expected.</h1>
        <p className="text-ink/70 leading-relaxed mb-8">
          This is usually a temporary backend/network issue rather than a missing page. Try reloading, or
          check that the backend is running and reachable.
        </p>
        <Link href="/diseases" className="text-sm text-sage-dark hover:underline">
          &larr; Back to all diseases
        </Link>
      </div>
    );
  }

  const disease = state.disease;

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="eyebrow text-muted mb-2">Disease profile</p>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <h1 className="font-display text-4xl text-ink">{disease.name}</h1>
        <RiskBadge band={disease.risk_band} />
      </div>
      <div className="mb-7">
        <CohortBadge status="validated" />
      </div>

      {/* TRS headline */}
      <div className="grid sm:grid-cols-[auto_1fr] gap-8 items-start border hairline rounded-2xl bg-card card-shadow p-8 mb-10">
        <div>
          <p className="eyebrow text-muted mb-1">Translation Risk</p>
          <p className="font-display text-5xl text-ink">
            {disease.trs != null ? disease.trs.toFixed(1) : "—"}
            <span className="text-lg text-muted"> / 100</span>
          </p>
          <p className="text-xs text-muted mt-2">
            0 = lowest risk (closest to patient access) · 100 = highest risk (furthest from patient access)
          </p>
          <p className="text-xs text-muted mt-1">
            Ascertainment {disease.ascertainment_completeness ?? "—"}% · Evidence coverage{" "}
            {disease.evidence_coverage ?? "—"}%
          </p>
        </div>
        <DomainBars domains={disease.domains ?? {}} />
      </div>

      {/* Primary barriers */}
      {disease.primary_barriers?.length > 0 && (
        <div className="mb-10">
          <p className="eyebrow text-muted mb-3">Primary barriers</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {disease.primary_barriers.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-ink/85">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose flex-shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain breakdown + evidence */}
      <EvidenceSection breakdown={disease.domain_breakdown} provenance={disease.provenance} />
    </div>
  );
}
