"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminRefreshStatus, startAdminRefresh } from "./api";

export type ScoreState = "idle" | "starting" | "running" | "busy-elsewhere" | "error" | "done";

// Shared start-and-poll logic for scoring one disease via the admin-refresh endpoint.
// There is exactly one background job slot on the backend, so this checks for an
// in-progress refresh before starting rather than letting the request 409. Used by
// ScoreDiseaseButton (score, then refresh the current page) and SearchBar (score, then
// navigate to the disease's profile once done).
export function useAdminScore() {
  const [state, setState] = useState<ScoreState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);
  useEffect(() => () => { pollingRef.current = false; }, []);

  const score = useCallback(async (name: string): Promise<boolean> => {
    setError(null);
    setState("starting");
    try {
      const current = await getAdminRefreshStatus().catch(() => null);
      if (current?.running) {
        setState("busy-elsewhere");
        return false;
      }
      await startAdminRefresh([name]);
      setState("running");
      pollingRef.current = true;
      const deadline = Date.now() + 10 * 60 * 1000;
      while (pollingRef.current) {
        if (Date.now() > deadline) throw new Error("Scoring is taking longer than expected. Return to the portfolio to check its status.");
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const s = await getAdminRefreshStatus();
          if (!pollingRef.current) return false;
          if (!s.running) {
            const failure = s.errors.find((item) => item.disease.toLowerCase() === name.toLowerCase());
            if (failure) { pollingRef.current = false; setState("error"); setError(failure.error); return false; }
            pollingRef.current = false;
            setState("done");
            return true;
          }
        } catch {
          // transient network hiccup — keep polling rather than abandoning
        }
      }
      return false;
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't start scoring.");
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    pollingRef.current = false;
    setState("idle");
    setError(null);
  }, []);

  return { state, error, score, reset };
}

