"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PorosLogo from "./PorosLogo";
const LINKS = [{ href: "/diseases", label: "Explore" }, { href: "/disease/visceral-myopathy", label: "Simulator" }, { href: "/workspace", label: "Saved" }, { href: "/methodology", label: "How it works" }];
export default function Nav() {
  const pathname = usePathname();
  return <header className="site-nav sticky top-0 z-30 bg-white/85 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8"><PorosLogo compact /><nav aria-label="Main navigation" className="flex w-full items-center justify-between gap-1 sm:w-auto sm:gap-2">{LINKS.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`flex min-h-11 items-center rounded-full px-3 text-xs font-medium transition-colors sm:px-4 sm:text-[13px] ${pathname === link.href ? "bg-sage-soft text-sage-dark" : "text-ink/70 hover:bg-sage-soft/70"}`}>{link.label}</Link>)}</nav></div></header>;
}
