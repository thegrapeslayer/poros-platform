export default function PortfolioLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16 animate-pulse">
      <div className="h-3 w-24 bg-paper2 rounded mb-4" />
      <div className="h-8 w-1/2 bg-paper2 rounded mb-8" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-28 border hairline rounded-xl bg-card" />
        ))}
      </div>
    </div>
  );
}
