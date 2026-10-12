import Link from "next/link";
import PorosLogo from "./PorosLogo";

const LINKS = [
  { href: "/diseases", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "How it works" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-[#f8f8f3]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.4rem] max-w-7xl items-center justify-between px-5 sm:px-8">
        <PorosLogo compact />
        <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 text-[13px] font-medium text-ink/70 transition-colors hover:bg-sage-soft/70 hover:text-sage-dark sm:px-4">
              {link.label}
            </Link>
          ))}
          <Link href="/diseases" className="ml-1 hidden rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-sage-dark sm:inline-flex">
            Open portfolio <span className="ml-2" aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
