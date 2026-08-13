"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminScore } from "@/lib/useAdminScore";

interface Item {
  name: string;
  slug: string;
  trs: number | null;
}

export default function SearchBar({ diseases }: { diseases: Item[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Item | null>(null);
  const router = useRouter();
  const { state, error, score } = useAdminScore();

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return diseases.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, diseases]);

  async function select(item: Item) {
    setOpen(false);
    setQuery("");
    if (item.trs != null) {
      router.push(`/disease/${item.slug}`);
      return;
    }
    // Not scored yet — run it now instead of dropping the user on a "not yet scored"
    // page, then take them straight to the real profile once it's ready.
    setPending(item);
    const done = await score(item.name);
    if (done) router.push(`/disease/${item.slug}`);
  }

  if (pending) {
    return (
      <div className="rounded-full border hairline bg-card px-5 py-3.5 text-sm card-shadow flex items-center justify-between gap-3">
        <span className="text-ink/80">
          {state === "busy-elsewhere"
            ? `Another refresh is already running — try ${pending.name} again shortly.`
            : state === "error"
              ? `Couldn't score ${pending.name}${error ? `: ${error}` : "."}`
              : `Scoring ${pending.name}… this can take a moment.`}
        </span>
        {(state === "busy-elsewhere" || state === "error") && (
          <button
            onClick={() => setPending(null)}
            className="text-xs text-sage-dark hover:underline flex-shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={`Search ${diseases.length || "100+"} rare diseases…`}
        className="w-full rounded-full border hairline bg-card px-5 py-3.5 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-sage/40 card-shadow"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full rounded-xl border hairline bg-card card-shadow overflow-hidden">
          {matches.map((m) => (
            <li key={m.slug}>
              <button
                onMouseDown={() => select(m)}
                className="w-full text-left px-5 py-3 text-sm hover:bg-sage-soft transition-colors flex items-center justify-between gap-3"
              >
                <span>{m.name}</span>
                {m.trs == null && <span className="text-[10px] text-muted eyebrow flex-shrink-0">score now</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
