import Link from "next/link";

const LINKS = [
  { href: "/diseases", label: "Diseases" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/research", label: "Research" },
];

export default function Nav() {
  return (
    <header className="border-b hairline sticky top-0 z-30 backdrop-blur bg-paper/85">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-xl font-semibold tracking-tight text-ink">RDTI</span>
          <span className="eyebrow text-muted hidden sm:inline">Translation Intelligence</span>
        </Link>
        <nav className="flex items-center gap-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-ink/80 hover:text-sage-dark transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
