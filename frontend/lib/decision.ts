import { API_BASE } from './api';
export type Mode = 'historical' | 'current';
export type Assessment = {trs:number|null;readiness:number|null;domains:Record<string,number|null>;readiness_domains:Record<string,number|null>;ascertainment_completeness:number|null;evidence_coverage:number|null};
export type EvidenceRecord = {identifier:string;source:string;url?:string;title?:string;publication_date?:string;retrieved_at?:string;snippet?:string;query?:string;decision:string;reviewed?:boolean};
export type Feature = {feature_id:string;label:string;domain:string;type:string;value:boolean|number|null;status:string;state:string;definition:string;scoreable:boolean;modifiable:boolean;updated_at:string|null;records:EvidenceRecord[];review_flags:string[];activity:{title:string;question:string;description:string}|null;rule:unknown;scoring_explanation:string;risk:number|null};
export type Profile = {name:string;slug:string;mode:Mode;snapshot:string;storage:string;last_updated:string|null;model_version:string;extractor_version:string;cohort_id:string;cohort_size:number;reference_counts:Record<string,number>;reference_digest:string;baseline_token:string;source_sha256:string;assessment:Assessment;archived_trs:number|null;baseline_verified:boolean|null;simulation_available:boolean;features:Feature[];warnings:string[];limitations:string[];feature_count:number;scoreable_count:number;gaps:number};
export type CatalogRow = Assessment & {name:string;slug:string;storage:string;risk_band:'HIGH'|'MODERATE'|'LOW'|'UNSCORED'};
export type Catalog = {mode:Mode;snapshot:string;diseases:CatalogRow[];feature_count:number;scoreable_count:number;model_version:string};
export type Changes = Record<string, boolean|number|null>;
export type Assumptions = {name:string;cost:number|null;months:number|null;notes:string};
export type Result = {baseline:Assessment;scenario:Assessment;changes:{feature_id:string;label:string;domain:string;baseline:unknown;hypothetical:unknown}[];baseline_token:string;delta_trs:number|null;gaps_addressed:number;domains_addressed:string[];limitations:string[]};
export const DOMAINS = ['biological','clinical','regulatory','economic','infrastructure'];
export const STATES:Record<string,string>={assessed:'Structured value assessed',supporting:'Supporting evidence',not_found:'Evidence not found',not_assessed:'Not assessed',insufficient:'Criterion not satisfied',retrieval_failed:'Retrieval unsuccessful',conflicting:'Needs conflict review'};
export const scoreText = (n:number|null|undefined)=> n==null?'Not scored':n.toFixed(1);
export function evidenceMode(value?:string):Mode {return value==='historical'?'historical':'current';}
async function request(path:string,options?:RequestInit){
 const res=await fetch(`${API_BASE}/api/decision${path}`,{...options,cache:'no-store',signal:options?.signal??AbortSignal.timeout(60000)});
 if(!res.ok){let message='The evidence service could not complete this request.';try{const body=await res.json();message=typeof body.detail==='string'?body.detail:Array.isArray(body.detail)?body.detail.map((e:{msg:string})=>e.msg).join('; '):message;}catch{}throw new Error(message);}
 return res;
}
export async function getCatalog(mode:Mode):Promise<Catalog>{return (await request(`/catalog?mode=${mode}`)).json();}
export async function getProfile(slug:string,mode:Mode):Promise<Profile>{return (await request(`/profile/${encodeURIComponent(slug)}?mode=${mode}`)).json();}
export async function calculateScenario(profile:Profile,changes:Changes,signal?:AbortSignal):Promise<Result>{return (await request(`/simulate/${profile.slug}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:profile.mode,baseline_token:profile.baseline_token,changes}),signal})).json();}
export async function exportReport(profile:Profile,changes:Changes,assumptions:Assumptions){const res=await request(`/report/${profile.slug}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:profile.mode,baseline_token:profile.baseline_token,changes,assumptions})});const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`poros-${profile.slug}-research-plan.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const evidenceDataURL=(profile:Profile)=>`${API_BASE}/api/decision/data/${profile.slug}?mode=${profile.mode}`;
