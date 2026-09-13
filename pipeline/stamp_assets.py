"""Content-address the browser bundle for integrity and IndexedDB invalidation."""
from pathlib import Path
import hashlib
import json
ROOT=Path(__file__).resolve().parent.parent/'public'/'data'/'malecns'

def main():
    files={}
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path.name not in ['asset-manifest.json','validation.json']:
            with path.open('rb') as f: sha=hashlib.file_digest(f,'sha256').hexdigest()
            files[str(path.relative_to(ROOT))]={'sha256':sha,'bytes':path.stat().st_size}
    version=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
    (ROOT/'asset-manifest.json').write_text(json.dumps({'version':version,'files':files},indent=2)+'\n')
    print('Asset version',version[:16],len(files),'files')
if __name__=='__main__':main()
