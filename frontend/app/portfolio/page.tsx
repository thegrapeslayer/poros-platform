import { redirect } from "next/navigation";

// /diseases and /portfolio used to be two separate pages showing the same data (a
// searchable table vs. a card grid) — merged into one page at /diseases. This route is
// kept as a redirect so old links/bookmarks still land somewhere real.
export default function PortfolioRedirect() {
  redirect("/diseases");
}
