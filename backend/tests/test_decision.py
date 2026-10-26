import copy, hashlib, json
import pytest
from fastapi.testclient import TestClient
from backend.app import decision as d, engine as e
from backend.app.main import app

@pytest.fixture(autouse=True)
def isolated_db(tmp_path,monkeypatch):
    monkeypatch.setattr(e,'DATA_DIR',tmp_path)
    monkeypatch.setattr(e,'DB_PATH',tmp_path/'evidence.sqlite')
    e.init_db()

@pytest.mark.parametrize('name',e.DEFAULT_MANUSCRIPT_COHORT)
def test_all_historical_baselines(name):
    p=d.profile(d.slugify(name),'historical')
    assert p['baseline_verified'] is True
    assert p['assessment']['trs']==p['archived_trs']
    assert len(p['features'])==29
    assert p['scoreable_count']==28
    assert p['snapshot']=='2015-12-31'

def test_hypothesis_only_changes_intended_domain_and_never_writes():
    p=d.profile('visceral-myopathy')
    before=d.ARCHIVE.read_bytes()
    with e.db_conn() as c: baseline=list(c.iterdump())
    r=d.simulate(p['slug'],'historical',{'human_disease_model':True},p['baseline_token'])
    assert r['baseline']['trs']==82.3
    assert r['scenario']['domains']['biological']==60
    assert r['scenario']['trs']==78.3
    assert r['gaps_addressed']==1
    for domain in ['clinical','regulatory','economic','infrastructure']:
        assert r['baseline']['domains'][domain]==r['scenario']['domains'][domain]
    assert d.ARCHIVE.read_bytes()==before
    with e.db_conn() as c: assert baseline==list(c.iterdump())
    assert d.profile(p['slug'])['values']==p['values']

def test_reset_exactly_restores_baseline():
    p=d.profile('visceral-myopathy')
    r=d.simulate(p['slug'],'historical',{},p['baseline_token'])
    assert r['scenario']==r['baseline']==p['assessment']

def test_missing_values_and_equal_domain_weight():
    values={'human_disease_model':{'value':None},'patient_registry':{'value':False}}
    out=e.calculate_score_from_values(values,{})
    assert out['domains']['biological'] is None and out['trs']==100
    assert out['ascertainment_completeness']==50
    assert e.calculate_score_from_values({'patient_registry':{'value':None}}, {})['trs'] is None
    v={'human_disease_model':{'value':True},'in_vivo_model':{'value':True},'patient_registry':{'value':False}}
    assert e.calculate_score_from_values(v,{})['trs']==50

def test_midrank_ties_and_non_scored_context():
    assert e.empirical_risk(5,[0,5,5,10],'favorable_high')==50
    assert e.feature_risk(e.FEATURE_SPECS['fda_label_signal'],100,[0,100]) is None

@pytest.mark.parametrize('changes',[{'trial_count':3},{'unknown':True},{'human_disease_model':'true'},{'causal_molecular_basis':True},{'human_disease_model':1}])
def test_reject_invalid_or_frozen_inputs(changes):
    p=d.profile('visceral-myopathy')
    with pytest.raises(ValueError):d.simulate(p['slug'],'historical',changes,p['baseline_token'])

def test_stale_baseline_rejected():
    with pytest.raises(RuntimeError):d.simulate('visceral-myopathy','historical',{},'0'*64)

def test_current_data_cannot_overwrite_historical():
    p=d.profile('visceral-myopathy')
    with e.db_conn() as c:
        ident=d.identity_for('visceral-myopathy')
        c.execute('INSERT INTO diseases(disease_id,canonical_name) VALUES(?,?)',(ident['disease_id'],ident['canonical_name']))
    e.upsert_feature_value(p['disease_id'],'current','human_disease_model',True,'CONFIRMED_PRESENT',1,1)
    assert d.profile(p['slug'],'current')['values']['human_disease_model']['value'] is True
    assert d.profile(p['slug'],'historical')['values']['human_disease_model']['value'] is False
    assert d.profile(p['slug'],'historical')['baseline_token']==p['baseline_token']

def test_failed_retrieval_retains_dated_cache():
    p=d.profile('visceral-myopathy','current')
    ident=d.identity_for(p['slug'])
    with e.db_conn() as c:c.execute('INSERT INTO diseases(disease_id,canonical_name) VALUES(?,?)',(ident['disease_id'],ident['canonical_name']))
    e.upsert_feature_value(p['disease_id'],'current','human_disease_model',None,'UNASCERTAINED',0,0)
    new=d.profile(p['slug'],'current')
    assert new['values']['human_disease_model']['value']==p['values']['human_disease_model']['value']
    assert new['storage']=='live_with_cache'
    assert any('Latest retrieval failed' in flag for f in new['features'] for flag in f['review_flags'])

def test_traceability_dates_dedup_and_pdf():
    client=TestClient(app)
    p=client.get('/api/decision/profile/visceral-myopathy?mode=historical').json()
    assert p['baseline_verified']
    assert any(r['url'] and r['retrieved_at'] for f in p['features'] for r in f['records'])
    for f in p['features']:
        keys=[(r['source'],r['identifier'],r['decision'],r['query']) for r in f['records']]
        assert len(keys)==len(set(keys))
    req={'mode':'historical','baseline_token':p['baseline_token'],'changes':{'human_disease_model':True},'assumptions':{'name':'Human model evaluation','cost':25000,'months':12,'notes':'Estimate only; discuss model fidelity and controls.'}}
    response=client.post('/api/decision/report/visceral-myopathy',json=req)
    assert response.status_code==200 and response.content.startswith(b'%PDF')
    assert client.post('/api/decision/simulate/visceral-myopathy',json={**req,'mode':'current'}).status_code==409
    assert client.get('/api/decision/profile/not-a-disease').status_code==404
    assert client.get('/api/decision/catalog?mode=invalid').status_code==422

def test_collection_failure_preserves_previous_success(monkeypatch):
    from backend.app import retrieval
    p=d.profile('visceral-myopathy','current');ident=d.identity_for(p['slug'])
    with e.db_conn() as c:c.execute('INSERT INTO diseases(disease_id,canonical_name,query_text) VALUES(?,?,?)',(ident['disease_id'],ident['canonical_name'],ident['canonical_name']))
    e.upsert_feature_value(p['disease_id'],'current','human_disease_model',True,'CONFIRMED_PRESENT',.9,1)
    def fail(*args,**kwargs):
        e.upsert_feature_value(p['disease_id'],'current','human_disease_model',None,'UNASCERTAINED',0,0)
        return {'type_b':{'human_disease_model':{'status':'UNASCERTAINED'}},'errors':[]}
    monkeypatch.setattr(e,'build_disease_snapshot',fail)
    result=retrieval.refresh_snapshot(ident['canonical_name'],force_refresh=True)
    assert result['errors']
    assert e.load_feature_values(p['disease_id'],'current')['human_disease_model']['value'] is True
    with e.db_conn() as c:assert c.execute('SELECT count(*) FROM retrieval_runs').fetchone()[0]==1
