"use client";

import { useEffect, useState } from "react";
import { getAdminRefreshStatus, startAdminRefresh, type AdminRefreshStatus } from "@/lib/api";

// Gives the site operator a way to actually populate scores from the UI,
// instead of needing to curl POST /api/admin/refresh by hand. Same
// unauthenticated backend endpoint either way (see docs/CURRENT_STATUS.md)
// — this just surfaces it.
export default function PortfolioRefresh({ unscoredCount }: { unscoredCount: number }) {
  const [status, setStatus] = useState<AdminRefreshStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const s = await getAdminRefreshStatus();
        if (!stop) setStatus(s);
      } catch {
        /* backend not reachable — keep trying quietly */
      }
      if (!stop) setTimeout(poll, 3000);
    }
    poll();
    return () => {
      stop = true;
    };
  }, []);

  async function handleRefresh() {
    setStarting(true);
    setError(null);
    try {
      await startAdminRefresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't start the refresh. Check that the backend is running and has outbound internet access."
      );
    } finally {
      setStarting(false);
    }
  }

  const running = status?.running ?? false;
  const progressPct = status && status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <div className="border hairline rounded-2xl bg-card card-shadow p-5 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink/85 font-medium">
            {unscoredCount > 0
              ? `${unscoredCount} disease${unscoredCount === 1 ? "" : "s"} in the portfolio ${
                  unscoredCount === 1 ? "hasn't" : "haven't"
                } been scored yet.`
              : "Portfolio scores are up to date."}
          </p>
          <p className="text-xs text-muted mt-1">
            Pulls current evidence from ClinicalTrials.gov, Europe PMC, NIH RePORTER, and openFDA for every
            disease in the portfolio. Needs the backend to have outbound internet access, and can take a while
            for the full portfolio.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={running || starting}
          className="rounded-full bg-sage-dark text-white px-5 py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-sage transition-colors whitespace-nowrap"
        >
          {running ? "Refreshing…" : starting ? "Starting…" : "Refresh portfolio now"}
        </button>
      </div>

      {error && <p className="text-sm text-rose mt-3">{error}</p>}

      {status && (running || status.done > 0) && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{running ? "Fetching evidence…" : "Last refresh complete"}</span>
            <span className="font-mono">
              {status.done}/{status.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-paper2 overflow-hidden">
            <div
              className="h-full bg-sage-dark transition-all"
              style={{ width: `${running ? progressPct : 100}%` }}
            />
          </div>
          {status.errors.length > 0 && (
            <details className="text-xs text-rose">
              <summary className="cursor-pointer">{status.errors.length} disease(s) failed to refresh</summary>
              <ul className="mt-2 space-y-1">
                {status.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="font-mono">
                    {e.disease}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
