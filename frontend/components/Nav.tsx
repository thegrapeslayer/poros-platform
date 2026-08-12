import Link from "next/link";
import PorosLogo from "./PorosLogo";

const LINKS = [
  { href: "/diseases", label: "Diseases" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/pipeline", label: "Manuscript Pipeline" },
  { href: "/research", label: "Research" },
];

export default function Nav() {
  return (
    <header className="border-b hairline sticky top-0 z-30 backdrop-blur bg-paper/85">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <PorosLogo compact />
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
