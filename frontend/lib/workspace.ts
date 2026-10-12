"use client";

import { useEffect, useState } from "react";

type Workspace = { saved: string[]; notes: Record<string, string>; reviewed: Record<string, string[]> };
const KEY = "poros-workspace-v1";
const EVENT = "poros-workspace-change";
const empty = (): Workspace => ({ saved: [], notes: {}, reviewed: {} });

function read(): Workspace {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  const value = JSON.parse(raw);
  return {
    saved: Array.isArray(value.saved) ? value.saved.filter((x: unknown) => typeof x === "string") : [],
    notes: Object.fromEntries(Object.entries(value.notes ?? {}).filter(([, v]) => typeof v === "string")),
    reviewed: Object.fromEntries(Object.entries(value.reviewed ?? {}).filter(([, v]) => Array.isArray(v) && v.every((x) => typeof x === "string"))),
  } as Workspace;
}

export function useWorkspace() {
  const [data, setData] = useState<Workspace>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => { try { setData(read()); } catch { setError("Browser storage is unavailable. Changes may not persist."); } setReady(true); };
    sync(); window.addEventListener(EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  function update(change: (previous: Workspace) => Workspace) {
    let previous = data;
    try { previous = read(); } catch { /* Keep edits usable in memory when storage is blocked. */ }
    const next = change(previous);
    setData(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setData(next); setError(""); window.dispatchEvent(new Event(EVENT));
    } catch { setError("Could not save in this browser. Export your brief before leaving."); }
  }
  return { data, ready, error,
    toggleSaved: (slug: string) => update((d) => ({ ...d, saved: d.saved.includes(slug) ? d.saved.filter((s) => s !== slug) : [...d.saved, slug] })),
    saveNote: (slug: string, note: string) => update((d) => ({ ...d, notes: { ...d.notes, [slug]: note } })),
    toggleReview: (key: string, feature: string) => update((d) => { const checked = d.reviewed[key] ?? []; return { ...d, reviewed: { ...d.reviewed, [key]: checked.includes(feature) ? checked.filter((f) => f !== feature) : [...checked, feature] } }; }),
  };
}

export function downloadFile(name: string, contents: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
