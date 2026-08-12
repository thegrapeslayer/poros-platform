export default function Footer() {
  return (
    <footer className="border-t hairline mt-24">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between gap-4 text-sm text-muted">
        <p className="max-w-xl">
          POROS reports evidence coverage and ascertainment status, not certainty. Failure to
          retrieve qualifying evidence for a disease is not proof that it doesn&rsquo;t exist.
        </p>
        <p className="font-mono text-xs">POROS engine · model TRS_v3_empirical</p>
      </div>
    </footer>
  );
}
