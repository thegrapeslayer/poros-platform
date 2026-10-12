"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminRefreshStatus, startAdminRefresh, type AdminRefreshStatus } from "@/lib/api";

export default function PortfolioRefresh({ unscoredCount }: { unscoredCount: number }) {
  const router = useRouter();
  const wasRunning = useRef(false);
  const [status, setStatus] = useState<AdminRefreshStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const next = await getAdminRefreshStatus(); if (!stopped) { setStatus(next); if (wasRunning.current && !next.running) router.refresh(); wasRunning.current = next.running; } } catch { /* Keep the page useful if status polling is temporarily unavailable. */ }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [router]);

  async function handleRefresh() {
    setStarting(true); setError(null);
    try { await startAdminRefresh(); wasRunning.current = true; }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t start the refresh. Check the data service and try again."); }
    finally { setStarting(false); }
  }

  const running = status?.running ?? false;
  const percent = status?.total ? Math.min(100, Math.round(status.done / status.total * 100)) : 0;
  return <section className="rounded-3xl border border-sage/20 bg-gradient-to-br from-[#edf0ff] to-white/90 p-5 sm:p-6">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-gold" : "bg-sage"}`} /><p className="text-sm font-semibold text-ink">{running ? "Portfolio update in progress" : unscoredCount > 0 ? `${unscoredCount} disease${unscoredCount === 1 ? "" : "s"} ready for a first score` : "Portfolio snapshots available"}</p></div>
        <p className="mt-2 text-xs leading-5 text-muted">Fetches current records from ClinicalTrials.gov, Europe PMC, NIH RePORTER, and openFDA. A full refresh can take several minutes depending on data-source availability.</p>
      </div>
      <button type="button" onClick={handleRefresh} disabled={running || starting} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-sage-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-sage disabled:cursor-not-allowed disabled:opacity-45">
        {running ? "Updating portfolio…" : starting ? "Starting update…" : "Update evidence"}<span aria-hidden="true">→</span>
      </button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">{error}</p>}
    {status && (running || status.done > 0) && <div className="mt-5" role="status" aria-live="polite">
      <div className="mb-2 flex items-center justify-between text-xs text-muted"><span>{running ? "Collecting public evidence…" : "Latest update complete"}</span><span className="font-mono tabular-nums">{status.done} / {status.total}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-sage-dark transition-[width] duration-500" style={{ width: `${running ? percent : 100}%` }} /></div>
      {status.errors.length > 0 && <details className="mt-3 text-xs text-rose"><summary className="cursor-pointer font-medium">{status.errors.length} records need attention</summary><ul className="mt-2 space-y-1">{status.errors.slice(0,10).map((item,index) => <li key={`${item.disease}-${index}`} className="font-mono">{item.disease}: {item.error}</li>)}</ul></details>}
    </div>}
  </section>;
}

