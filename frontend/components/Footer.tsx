import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-line/70 bg-white/35">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-sm font-semibold tracking-tight text-ink">POROS · POROS research</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Evidence mapping for rare disease translation. Scores describe evidence found in public sources; they are not clinical advice or a judgment of disease severity.</p>
        </div>
        <div className="flex shrink-0 gap-5 text-xs font-medium text-sage-dark">
          <Link href="/methodology" className="hover:underline">Scoring approach</Link>
          <Link href="/diseases" className="hover:underline">Portfolio</Link>
        </div>
      </div>
    </footer>
  );
}

