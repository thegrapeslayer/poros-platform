"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  name: string;
  slug: string;
}

export default function SearchBar({ diseases }: { diseases: Item[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return diseases.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, diseases]);

  function go(slug: string) {
    setOpen(false);
    setQuery("");
    router.push(`/disease/${slug}`);
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
                onMouseDown={() => go(m.slug)}
                className="w-full text-left px-5 py-3 text-sm hover:bg-sage-soft transition-colors"
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
