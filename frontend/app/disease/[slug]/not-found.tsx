import Link from "next/link";

export default function DiseaseNotFound() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <p className="eyebrow text-muted mb-3">Not found</p>
      <h1 className="font-display text-2xl text-ink mb-4">This disease isn&rsquo;t in the POROS portfolio.</h1>
      <p className="text-ink/70 leading-relaxed mb-8">
        POROS currently scores a fixed portfolio of rare diseases rather than an open free-text search. If
        you&rsquo;re looking for a specific disease, search the portfolio below — if it isn&rsquo;t listed, it
        hasn&rsquo;t been added to the scored portfolio yet.
      </p>
      <Link href="/diseases" className="text-sm text-sage-dark hover:underline">
        &larr; Search all diseases
      </Link>
    </div>
  );
}
