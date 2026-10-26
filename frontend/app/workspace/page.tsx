import { getCatalog } from "@/lib/decision";
import { listDiseases } from "@/lib/api";
import WorkspaceClient from "@/components/WorkspaceClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence workspace" };
export default async function WorkspacePage() {
  let data: Awaited<ReturnType<typeof listDiseases>> = { snapshot: "unavailable", diseases: [] };
  let error = false;
  try { data = await getCatalog("current"); } catch { error = true; }
  return <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14"><p className="eyebrow text-sage-dark">Your evidence workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Find a focus. Take the next step.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted">Compare the landscape, save conditions worth a closer look, and turn unanswered questions into a review plan.</p>{error && <p role="status" className="mt-6 rounded-2xl bg-gold-soft p-4 text-sm">Live data is unavailable. Your saved list is still stored on this browser. Reload to reconnect.</p>}<WorkspaceClient diseases={data.diseases} snapshot={data.snapshot} /></div>;
}
