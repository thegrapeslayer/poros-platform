import Link from "next/link";

type PorosLogoProps = {
  compact?: boolean;
  className?: string;
};

export default function PorosLogo({ compact = false, className = "" }: PorosLogoProps) {
  return (
    <Link href="/" aria-label="POROS home" className={`inline-flex items-center gap-3 ${className}`}>
      <svg viewBox="0 0 192 192" aria-hidden="true" className={compact ? "h-8 w-8" : "h-9 w-9"}>
        <path
          d="M88 30 C50 34 28 60 28 96 C28 132 50 158 88 162"
          fill="none"
          stroke="#465C4C"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M104 30 C142 34 164 60 164 96 C164 132 142 158 104 162"
          fill="none"
          stroke="#465C4C"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path d="M96 40 L96 152" fill="none" stroke="#AB8A52" strokeWidth="8" strokeLinecap="round" />
        <circle cx="96" cy="40" r="5.5" fill="#AB8A52" />
        <circle cx="96" cy="152" r="5.5" fill="#AB8A52" />
      </svg>

      <span className="leading-none">
        <span className="block font-display text-xl font-semibold tracking-tight text-ink">POROS</span>
        {!compact && (
          <span className="eyebrow text-muted hidden sm:block mt-0.5">Translation Intelligence</span>
        )}
      </span>
    </Link>
  );
}
