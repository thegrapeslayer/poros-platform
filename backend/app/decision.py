"""Read-only evidence views and scenarios using the unchanged POROS engine.
Historical inputs always come from the bundled, checksum-identified archive.
Current inputs may come from SQLite; cached records retain their original dates.
"""
from __future__ import annotations
import copy, gzip, hashlib, json, math, re
from functools import lru_cache
from pathlib import Path
from . import engine as eng

ARCHIVE = Path(__file__).parent / 'frozen' / 'evidence.json.gz'
MODES = {'historical': eng.DEFAULT_BASELINE_DATE, 'current': eng.CURRENT_SNAPSHOT}
LIMITATIONS = [
    'These are evidence-based, cohort-relative model scores, not clinical advice or probabilities of treatment success.',
    'A hypothetical evidence change does not establish that a research activity will generate that evidence.',
    'Excluding an unknown variable can improve a score without creating evidence. Compare completeness alongside any score change.',
    'Not confirmed means the retrieval protocol did not establish a criterion, not that the resource does not exist.',
    'Automated documentary classifications require expert review. No new human validation results are claimed.',
    'Historical records use the original archive and cutoff rules. Later revisions to registry fields may limit reconstruction of their historical state.',
]

def slugify(name): return re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
def digest(value): return hashlib.sha256(json.dumps(value,sort_keys=True,default=str,separators=(',',':')).encode()).hexdigest()

@lru_cache(maxsize=1)
def archive():
    payload = json.loads(gzip.decompress(ARCHIVE.read_bytes()))
    tables = payload['tables']
    index = {}
    for table, rows in tables.items():
        grouped = {}
        for row in rows:
            grouped.setdefault((row.get('disease_id'),row.get('snapshot_date')),[]).append(row)
        index[table] = grouped
    return payload, index

def mode_snapshot(mode):
    if mode not in MODES: raise ValueError('Choose historical or current evidence.')
    return MODES[mode]

def identity_for(slug):
    name = next((n for n in eng.DEFAULT_MANUSCRIPT_COHORT if slugify(n)==slug),None)
    if not name: raise KeyError('Disease is not in the fixed 100-disease cohort.')
    payload,_ = archive()
    return next(dict(r) for r in payload['tables']['diseases'] if r['canonical_name']==name)

def load_rows(did,mode):
    snap = mode_snapshot(mode)
    _,idx = archive()
    tables = ['feature_values','feature_evidence','raw_observations','documents','scores']
    cached = {t:copy.deepcopy(idx[t].get((did,snap),[])) for t in tables}
    if mode=='historical': return cached,'archived'
    with eng.db_conn() as conn:
        live = {t:[dict(r) for r in conn.execute(f'SELECT * FROM {t} WHERE disease_id=? AND snapshot_date=?',(did,snap))] for t in tables}
    if not live['feature_values']: return cached,'cached'
    # Failed live retrieval must not erase a previously ascertained cached value.
    merged = {r['feature_id']:r for r in cached['feature_values']}
    retained = set()
    for row in live['feature_values']:
        fid=row['feature_id']
        if json.loads(row['final_value_json']) is None and fid in merged and json.loads(merged[fid]['final_value_json']) is not None:
            retained.add(fid)
        else: merged[fid]=row
    live['feature_values']=list(merged.values())
    for t in ['feature_evidence','raw_observations','documents']:
        live[t]=cached[t]+live[t]
    live['retained_features']=sorted(retained)
    return live,'live_with_cache' if retained else 'live'

def values_from(rows):
    return {r['feature_id']:{'value':json.loads(r['final_value_json']),'status':r['status'],'type':r['feature_type']} for r in rows}

def references(mode):
    snap=mode_snapshot(mode); payload,_=archive()
    if mode=='historical':
        return {r['feature_id']:json.loads(r['values_json']) for r in payload['tables']['reference_stats'] if r['snapshot_date']==snap and r['cohort_id']=='manuscript_99262879ff'}
    # Every member of the fixed cohort participates when its value is available.
    cached={r['disease_id']:{} for r in payload['tables']['diseases']}
    for r in payload['tables']['feature_values']:
        if r['snapshot_date']==snap: cached[r['disease_id']][r['feature_id']]=json.loads(r['final_value_json'])
    with eng.db_conn() as conn:
        for r in conn.execute('SELECT * FROM feature_values WHERE snapshot_date=?',(snap,)):
            if r['disease_id'] in cached:
                value=json.loads(r['final_value_json'])
                if value is not None: cached[r['disease_id']][r['feature_id']]=value
    return {fid:[float(row[fid]) for row in cached.values() if type(row.get(fid)) in (int,float) and math.isfinite(row[fid])] for fid,spec in eng.FEATURE_SPECS.items() if spec.feature_type=='A' and spec.scoreable}

def assessment(values,refs):
    score=eng.calculate_score_from_values(values,refs)
    score['readiness']=round(100-score['trs'],1) if score['trs'] is not None else None
    score['readiness_domains']={d:round(100-v,1) if v is not None else None for d,v in score['domains'].items()}
    return score

# Activities are questions for planning, tied to exact criteria, never score bonuses.
ACTIONS = {
 'actionable_target':('Target evaluation','Which specific target or rescuable molecular process has disease-specific preclinical support?','Design a target-validation study with a disease-relevant readout.'),
 'human_disease_model':('Human model development','Can patient-derived cells, iPSCs, organoids or tissue reproduce the disease phenotype?','Evaluate a human-relevant model and document phenotype fidelity.'),
 'in_vivo_model':('In vivo model evaluation','Which in vivo model reproduces the relevant disease biology?','Evaluate an appropriate model and document its limitations.'),
 'preclinical_rescue':('Phenotypic rescue study','Does a defined intervention improve a disease-relevant phenotype in a model?','Plan a controlled rescue experiment with prespecified phenotypic endpoints.'),
 'natural_history_study':('Natural-history study','What longitudinal data describe disease course and variability?','Scope a longitudinal observational study with a clinical research team.'),
 'patient_registry':('Registry assessment','Is there a documented disease-specific patient registry with a defined scope?','Verify existing registries before considering a registry protocol and governance plan.'),
 'validated_outcome_measure':('Outcome-measure validation','What evidence validates or trial-tests this disease-relevant outcome measure?','Plan reliability, validity and clinical-meaningfulness assessments for an outcome measure.'),
 'biomarker_in_trial':('Prospective biomarker evaluation','Is the biomarker prospectively used as an endpoint, stratifier or pharmacodynamic measure?','Evaluate a prospective biomarker protocol and its trial documentation.'),
 'orphan_designation_evidence':('Designation verification','Does a qualifying record identify an orphan designation for the therapeutic program?','Verify the program, disease and designation with authoritative regulatory records.'),
 'expedited_designation_evidence':('Regulatory pathway review','Does a qualifying record document an expedited designation for this program?','Discuss program evidence requirements with regulatory specialists and verify agency records.'),
 'surrogate_endpoint_precedent':('Endpoint precedent review','Is surrogate or intermediate endpoint acceptance documented for the development context?','Review regulatory precedents and determine what additional endpoint evidence would be needed.'),
 'patient_organization':('Community resource verification','Which documented organization serves this disease community?','Contact disease organizations to confirm scope, resources and partnerships.'),
 'biobank':('Biospecimen resource assessment','Is a disease-specific or accessible biospecimen resource documented?','Assess existing biobanks, sample access and consent/governance requirements.'),
 'natural_history_consortium':('Natural-history collaboration','Does a multicenter consortium explicitly conduct natural-history work?','Explore a coordinated longitudinal-study collaboration and its documentation.'),
 'multicenter_network':('Multicenter coordination','Is a coordinated disease-focused multicenter research program documented?','Assess opportunities for a documented multicenter research collaboration.'),
 'consensus_guidance':('Guidance evidence review','Are consensus diagnostic criteria or management recommendations published?','Review existing guidance and whether a qualified consensus process is warranted.'),
}

def normalized_feature(fid,spec,row,rows,mode):
    snap=MODES[mode]; value=json.loads(row['final_value_json']) if row else None
    decisions=sorted([r for r in rows['feature_evidence'] if r['feature_id']==fid],key=lambda r:r.get('retrieved_at') or '')
    latest=decisions[-1] if decisions else None
    observations=[r for r in rows['raw_observations'] if r['feature_id'] in (fid,'search::'+fid)]
    docs={(r['document_id'],r['disease_id'],r['snapshot_date']):r for r in rows['documents']}
    records=[]
    for d in decisions:
        doc=docs.get((d.get('document_id'),d['disease_id'],d['snapshot_date']),{})
        if not doc: continue
        records.append({'identifier':doc.get('pmid') or doc.get('doi') or doc['document_id'],'source':doc['source'],'url':doc.get('url'),'title':doc.get('title'),'publication_date':doc.get('publication_date'),'retrieved_at':d.get('retrieved_at'),'snippet':d.get('supporting_snippet'),'decision':d['status'],'query':doc.get('query_used'),'extractor_version':d.get('extractor_version'),'reviewed':bool(d.get('reviewed'))})
    for o in observations:
        records.append({'identifier':o.get('source_record_id') or str(o['observation_id']),'source':o.get('source'),'url':o.get('source_url'),'title':o['feature_id'],'publication_date':o.get('source_date'),'retrieved_at':o.get('retrieved_at'),'snippet':None,'decision':row.get('status') if row else 'NOT_ASSESSED','query':o.get('query_used'),'record_kind':'search_protocol' if o['feature_id'].startswith('search::') else 'structured_observation'})
    unique={}
    for r in records:
        k=(r['source'],r['identifier'],r.get('decision'),r.get('query'))
        if k not in unique or (r.get('retrieved_at') or '')>(unique[k].get('retrieved_at') or ''):unique[k]=r
    records=list(unique.values())
    flags=[]
    if not row: state='not_assessed'
    elif value is None: state='retrieval_failed' if row['status']=='UNASCERTAINED' else 'not_assessed'
    elif spec.feature_type=='A': state='assessed'
    elif value is True: state='supporting'
    elif latest and latest.get('document_id'): state='insufficient'
    else: state='not_found'
    if latest and latest.get('human_label')=='AMBIGUOUS': state='conflicting';flags.append('A human review marked this evidence ambiguous.')
    if latest and latest.get('human_label') in ('CONFIRMED_PRESENT','NOT_CONFIRMED') and latest['human_label']!=latest['status']:
        state='conflicting';flags.append('Human review and automated classification disagree.')
    if len({d['status'] for d in decisions if d.get('retrieval_success')})>1:flags.append('Classification changed between retrievals; review dated records.')
    if spec.feature_type=='B' and not (latest and latest.get('reviewed')):flags.append('Automated classification; not human-verified.')
    if fid in rows.get('retained_features',[]) or (latest and not latest.get('retrieval_success') and value is not None):flags.append('Latest retrieval failed. Previously retrieved value retained with its original date.')
    if mode=='historical' and any((r.get('publication_date') or '')>snap for r in records if r.get('publication_date')):flags.append('A source date is after the historical cutoff. Review original archive provenance.')
    if mode=='historical' and fid=='fda_label_signal':flags.append('Present-day FDA label signals are not historical approval evidence and never contribute to scoring.')
    if not records and value is not None:flags.append('No linked source record was found for this stored value.')
    a=ACTIONS.get(fid)
    return {'feature_id':fid,'label':spec.label,'domain':spec.domain,'type':spec.feature_type,'value':value,'status':row['status'] if row else 'NOT_ASSESSED','state':state,'definition':spec.description or spec.label,'scoreable':spec.scoreable,'modifiable':spec.modifiable,'updated_at':row.get('last_updated') if row else None,'records':records,'duplicate_records_removed':len(records) and max(0,len(decisions)+len(observations)-len(records)),'review_flags':flags,'activity':{'title':a[0],'question':a[1],'description':a[2]} if a else None,'rule':eng.TYPE_B_RULES.get(fid),'scoring_explanation':('Display only; excluded from scores.' if not spec.scoreable else 'Documented criterion: 0 risk; not confirmed: 100 risk; unknown: excluded.' if spec.feature_type=='B' else 'Empirical mid-rank percentile against the stated cohort; higher values are favorable.')}

def profile(slug,mode='historical',refs=None):
    ident=identity_for(slug); rows,storage=load_rows(ident['disease_id'],mode)
    refs=refs if refs is not None else references(mode)
    values=values_from(rows['feature_values']); score=assessment(values,refs)
    byfid={r['feature_id']:r for r in rows['feature_values']}
    features=[normalized_feature(fid,spec,byfid.get(fid),rows,mode) for fid,spec in eng.FEATURE_SPECS.items()]
    for f in features:f['risk']=eng.feature_risk(eng.FEATURE_SPECS[f['feature_id']],f['value'],refs.get(f['feature_id'],[]))
    warnings=[]
    if mode=='current':
        with eng.db_conn() as conn:
            if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='retrieval_runs'").fetchone():
                run=conn.execute('SELECT * FROM retrieval_runs WHERE disease_id=? AND snapshot_date=? ORDER BY finished_at DESC LIMIT 1',(ident['disease_id'],MODES[mode])).fetchone()
                if run and json.loads(run['failures_json']):warnings.append('Latest collection reported source failures at '+run['finished_at']+'. Prior records are retained where available: '+'; '.join(json.loads(run['failures_json'])))
    if storage=='cached':warnings.append('Showing archived current-evidence records because no live snapshot is stored. Check the last-retrieved dates; these are not newly fetched results.')
    frozen=next((r for r in rows['scores'] if r['cohort_id']=='manuscript_99262879ff'),None) if mode=='historical' else None
    matching=True
    if frozen:
        matching=score['trs']==frozen['composite_trs'] and all(score['domains'][d]==frozen[d+'_risk'] for d in eng.DOMAIN_LABELS)
        if not matching:warnings.append('Recalculation differs from archived scores. Simulation is blocked pending methodology review.')
    token=digest({'mode':mode,'values':values,'refs':refs,'model':eng.MODEL_VERSION})
    timestamps=[r.get('last_updated') for r in rows['feature_values'] if r.get('last_updated')]
    return {'name':ident['canonical_name'],'slug':slug,'disease_id':ident['disease_id'],'mode':mode,'snapshot':MODES[mode],'storage':storage,'last_updated':max(timestamps) if timestamps else None,'model_version':eng.MODEL_VERSION,'extractor_version':eng.EXTRACTOR_VERSION,'cohort_id':('manuscript_' if mode=='historical' else 'explorer_')+'99262879ff','cohort_size':100,'reference_counts':{k:len(v) for k,v in refs.items()},'reference_digest':digest(refs),'baseline_token':token,'source_sha256':archive()[0]['source_sha256'],'assessment':score,'archived_trs':frozen['composite_trs'] if frozen else None,'baseline_verified':matching if frozen else None,'simulation_available':matching and score['trs'] is not None,'features':features,'warnings':warnings,'limitations':LIMITATIONS,'feature_count':len(features),'scoreable_count':sum(f['scoreable'] for f in features),'gaps':sum(f['state'] not in ('supporting','assessed') for f in features),'values':values,'reference_stats':refs}

def catalog(mode):
    mode_snapshot(mode); refs=references(mode); out=[]
    for name in eng.DEFAULT_MANUSCRIPT_COHORT:
        did=identity_for(slugify(name))['disease_id']; rows,storage=load_rows(did,mode)
        score=assessment(values_from(rows['feature_values']),refs)
        out.append({'name':name,'slug':slugify(name),'storage':storage,'risk_band':('UNSCORED' if score['trs'] is None else 'HIGH' if score['trs']>=66 else 'MODERATE' if score['trs']>=33 else 'LOW'),**score})
    return {'mode':mode,'snapshot':MODES[mode],'diseases':out,'feature_count':len(eng.FEATURE_SPECS),'scoreable_count':sum(s.scoreable for s in eng.FEATURE_SPECS.values()),'model_version':eng.MODEL_VERSION}

def simulate(slug,mode,changes,baseline_token):
    p=profile(slug,mode)
    if p['baseline_token']!=baseline_token: raise RuntimeError('Evidence or reference data changed. Reload the baseline before recalculating.')
    if not p['simulation_available']:raise ValueError('Simulation unavailable until baseline integrity is resolved.')
    values=copy.deepcopy(p['values']); applied=[]
    for fid,value in changes.items():
        spec=eng.FEATURE_SPECS.get(fid)
        if not spec or not spec.modifiable or not spec.scoreable:raise ValueError(f'{fid}: not a modifiable variable in the frozen model.')
        if spec.feature_type=='B' and value is not None and type(value) is not bool:raise ValueError(f'{fid}: use true, false or null.')
        if spec.feature_type=='A' and value is not None and (type(value) not in (int,float) or not math.isfinite(value) or value<0):raise ValueError(f'{fid}: use a finite nonnegative number.')
        old=values.get(fid,{}).get('value')
        if old==value and type(old)==type(value):continue
        values[fid]={**values.get(fid,{}),'value':value,'status':'HYPOTHETICAL'}
        applied.append({'feature_id':fid,'label':spec.label,'domain':spec.domain,'baseline':old,'hypothetical':value})
    scenario=assessment(values,p['reference_stats'])
    return {'baseline':p['assessment'],'scenario':scenario,'changes':applied,'baseline_token':baseline_token,'delta_trs':round(scenario['trs']-p['assessment']['trs'],1) if scenario['trs'] is not None else None,'gaps_addressed':sum(r['hypothetical'] is True and r['baseline'] is not True for r in applied),'domains_addressed':sorted({r['domain'] for r in applied if r['hypothetical'] is True}),'limitations':LIMITATIONS}
