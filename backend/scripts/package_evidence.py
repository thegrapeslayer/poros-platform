"""Package a read-only manuscript database without rewriting its records.
Usage: python backend/scripts/package_evidence.py source.sqlite output.json.gz
The original archive remains separate; packaged data include exact source checksums.
"""
import csv, gzip, hashlib, json, sqlite3, sys
from pathlib import Path

def package(source, destination):
    source = Path(source)
    conn = sqlite3.connect(f'file:{source.resolve()}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    tables = {}
    # Preserve evidence records and original scores; omit user/human reviewer notes.
    for table in ['diseases', 'feature_values', 'reference_stats', 'scores', 'feature_evidence', 'documents', 'raw_observations']:
        rows = [dict(r) for r in conn.execute(f'SELECT * FROM {table}')]
        for row in rows:
            row.pop('human_note', None)
        tables[table] = rows
    linked = {(r['document_id'],r['disease_id'],r['snapshot_date']) for r in tables['feature_evidence'] if r['document_id']}
    tables['documents'] = [r for r in tables['documents'] if (r['document_id'],r['disease_id'],r['snapshot_date']) in linked]
    for row in tables['documents']:
        row.pop('abstract',None)  # Classifier passages remain in feature_evidence; original archive is unchanged.
    latest = {}
    for row in tables['raw_observations']:
        row.pop('metadata_json',None)  # Full API payloads remain in the checksum-identified original archive.
        latest[(row['disease_id'],row['snapshot_date'],row['feature_id'])] = row
    tables['raw_observations'] = list(latest.values())
    payload = {'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'tables':tables}
    data = json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
    Path(destination).write_bytes(gzip.compress(data,mtime=0))
    print({'bytes':len(data),'compressed':Path(destination).stat().st_size,'source_sha256':payload['source_sha256']})
if __name__=='__main__': package(*sys.argv[1:])
