"use client";

import { useRouter } from "next/navigation";
import { useAdminScore } from "@/lib/useAdminScore";

// Lets a user score exactly one disease instead of always needing the full
// ~100-disease portfolio refresh. Uses the same admin-refresh endpoint/queue as the
// "Refresh all" action (there's only one background job at a time on the backend), so
// if a full-portfolio refresh is already running this disables and explains rather than
// silently 409ing.
export default function ScoreDiseaseButton({
  name,
  label = "Score now",
  runningLabel = "Scoring…",
  variant = "default",
  className,
}: {
  name: string;
  label?: string;
  runningLabel?: string;
  variant?: "default" | "primary";
  className?: string;
}) {
  const router = useRouter();
  const { state, error, score } = useAdminScore();

  async function handleClick() {
    const done = await score(name);
    if (done) router.refresh();
  }

  if (state === "done") {
    return <span className={`text-xs text-sage-dark ${className ?? ""}`}>Scored</span>;
  }

  const buttonClass =
    variant === "primary"
      ? "rounded-full bg-sage-dark text-white px-5 py-2.5 text-sm font-medium hover:bg-sage transition-colors disabled:opacity-50"
      : "text-xs px-3 py-1.5 rounded-full border hairline bg-card text-ink/80 hover:bg-sage-soft/50 disabled:opacity-50 whitespace-nowrap";

  return (
    <div className={className}>
      <button onClick={handleClick} disabled={state === "starting" || state === "running"} className={buttonClass}>
        {state === "starting" || state === "running" ? runningLabel : label}
      </button>
      {state === "busy-elsewhere" && (
        <p className="text-[11px] text-muted mt-1">A refresh is already running — try again once it finishes.</p>
      )}
      {state === "error" && error && <p className="text-[11px] text-rose mt-1">{error}</p>}
    </div>
  );
}
