"use client";
import { useWorkspace } from "@/lib/workspace";

export default function SaveDisease({ slug }: { slug: string }) {
  const { data, ready, error, toggleSaved } = useWorkspace();
  const saved = data.saved.includes(slug);
  return <div><button type="button" disabled={!ready} aria-pressed={saved} onClick={() => toggleSaved(slug)} className={`control ${saved ? "control-selected" : ""}`}>{saved ? "✓ Saved" : "+ Save disease"}</button>{error && <p role="status" className="mt-2 text-xs text-rose">{error}</p>}</div>;
}
