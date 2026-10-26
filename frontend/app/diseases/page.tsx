import Link from 'next/link';
import {getCatalog,evidenceMode} from '@/lib/decision';
import DecisionExplorer from '@/components/DecisionExplorer';
import EvidenceMode from '@/components/EvidenceMode';
import PortfolioRefresh from '@/components/PortfolioRefresh';
export const dynamic='force-dynamic';
export default async function Diseases({searchParams}:{searchParams:{mode?:string}}){const mode=evidenceMode(searchParams.mode);let catalog=null;try{catalog=await getCatalog(mode)}catch{}
 return <div className="page-shell"><div className="flex flex-wrap justify-between gap-6 mb-8"><div><p className="eyebrow text-sage-dark">Disease explorer</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Start with the disease.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-muted">Examine its evidence landscape, identify open questions and explore hypothetical research scenarios.</p></div><EvidenceMode mode={mode} path="/diseases"/></div>{mode==='current'&&<details className="mb-6 surface p-4"><summary className="cursor-pointer text-sm font-medium">Retrieve newer public evidence</summary><div className="mt-4"><PortfolioRefresh unscoredCount={0}/></div></details>}{catalog?<DecisionExplorer catalog={catalog}/>:<div className="notice" role="alert">The evidence service could not be reached. Your saved data remains in this browser. <Link className="underline" href={`/diseases?mode=${mode}`}>Retry</Link>.</div>}</div>;
}
