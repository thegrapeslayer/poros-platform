"""Collection orchestration around the frozen source-specific engine adapters.
Append source failures to an audit log and preserve prior successful values when
one source fails. Do not change extraction criteria or historical archive files.
"""
import json, uuid
from . import engine as eng

def refresh_snapshot(name,as_of_date=None,force_refresh=False):
    ident=eng.resolve_disease(name); snap=eng.snapshot_key(as_of_date)
    with eng.db_conn() as c:
        c.execute('CREATE TABLE IF NOT EXISTS retrieval_runs (run_id TEXT PRIMARY KEY,disease_id TEXT,snapshot_date TEXT,started_at TEXT,finished_at TEXT,failures_json TEXT)')
        before=[dict(r) for r in c.execute('SELECT * FROM feature_values WHERE disease_id=? AND snapshot_date=?',(ident['disease_id'],snap))]
    started=eng.now_iso(); failures=[]
    try:
        result=eng.build_disease_snapshot(name,as_of_date=as_of_date,force_refresh=force_refresh)
        failures.extend(str(v) for v in result.get('errors',[]))
        failures.extend(f'{fid}: retrieval unsuccessful' for fid,row in result.get('type_b',{}).items() if row.get('status')=='UNASCERTAINED')
        # A retrieval failure cannot replace a previously observed value with unknown.
        with eng.db_conn() as c:
            for old in before:
                if json.loads(old['final_value_json']) is None:continue
                now=c.execute('SELECT final_value_json,status FROM feature_values WHERE disease_id=? AND snapshot_date=? AND feature_id=?',(ident['disease_id'],snap,old['feature_id'])).fetchone()
                if now and now['status']=='UNASCERTAINED' and json.loads(now['final_value_json']) is None:
                    keys=list(old)
                    c.execute(f"INSERT OR REPLACE INTO feature_values ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",tuple(old[k] for k in keys))
        result['errors']=failures
        return result
    except Exception as exc:
        failures.append(str(exc));raise
    finally:
        with eng.db_conn() as c:c.execute('INSERT INTO retrieval_runs VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,ident['disease_id'],snap,started,eng.now_iso(),eng.json_dumps(failures)))
