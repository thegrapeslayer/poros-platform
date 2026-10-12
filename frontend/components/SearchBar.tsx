"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminScore } from "@/lib/useAdminScore";

interface Item { name: string; slug: string; trs: number | null; }

export default function SearchBar({ diseases, id = "disease-search" }: { diseases: Item[]; id?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Item | null>(null);
  const router = useRouter();
  const { state, error, score } = useAdminScore();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? diseases.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 7) : [];
  }, [query, diseases]);

  async function select(item: Item) {
    setOpen(false);
    if (item.trs != null) { router.push(`/disease/${item.slug}`); return; }
    setPending(item);
    if (await score(item.name)) router.push(`/disease/${item.slug}`);
  }

  if (pending) {
    const failed = state === "busy-elsewhere" || state === "error";
    return <div role="status" className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/85 backdrop-blur">
      <span>{state === "busy-elsewhere" ? `A portfolio refresh is already running. Try ${pending.name} again shortly.` : state === "error" ? `Couldn’t score ${pending.name}${error ? `: ${error}` : "."}` : `Finding public evidence for ${pending.name}…`}</span>
      {failed && <button type="button" onClick={() => setPending(null)} className="ml-3 font-semibold text-white underline underline-offset-2">Dismiss</button>}
    </div>;
  }

  return <div className="relative">
    <div className="flex min-h-[54px] items-center gap-3 rounded-2xl border border-white/15 bg-white/[.10] px-4 shadow-lg shadow-black/10 backdrop-blur-xl transition-colors focus-within:border-white/35 focus-within:bg-white/[.14]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-white/55" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4" strokeLinecap="round"/></svg>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setQuery(""); } if (event.key === "Enter" && matches[0]) { event.preventDefault(); void select(matches[0]); } }}
        placeholder={`Search ${diseases.length || "rare"} diseases`}
        autoComplete="off"
        aria-label="Search rare diseases"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-results`}
        className="w-full min-w-0 bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/45 [color-scheme:dark]"
      />
      {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setOpen(false); }} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white">×</button>}
      <span className="hidden shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/45 sm:inline">↵</span>
    </div>
    {open && query.trim() && <div id={`${id}-results`} role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line/80 bg-white shadow-2xl shadow-black/15">
      {matches.length ? matches.map((item) => <button key={item.slug} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => void select(item)} className="flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left text-sm text-ink transition-colors hover:bg-sage-soft/60 focus:bg-sage-soft/60 focus:outline-none">
        <span>{item.name}</span><span className="shrink-0 text-[11px] text-muted">{item.trs == null ? "View evidence" : `TRS ${item.trs.toFixed(1)}`}</span>
      </button>) : <p className="px-4 py-3 text-sm text-muted">No diseases match “{query}”. Browse the portfolio to see all conditions.</p>}
    </div>}
  </div>;
}
