"""Extract measured ROI synapse membership using selected remote Arrow columns.

The upstream table is 4.6 GB and includes unclassified fragments. Ranged reads
avoid fetching other annotation columns; only shipped neuron IDs are retained.
"""
import io
import json
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import local
import pyarrow as pa
from fetch import digest

OBJECT = 'v1.0/database/neuprint-inputs/Neuprint_Neurons.feather'
URL = 'https://storage.googleapis.com/flyem-male-cns/' + OBJECT
ROOT = Path(__file__).resolve().parent.parent / 'public/data/malecns'


class Remote(io.RawIOBase):
    def __init__(self, size, generation):
        self.pos = 0
        self.size = size
        self.url = URL + '?generation=' + generation

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def read(self, size=-1):
        if size < 0:
            size = self.size - self.pos
        if size == 0:
            return b''
        request = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{self.pos+size-1}'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    if response.status != 206:
                        raise RuntimeError('Upstream does not support byte ranges')
                    data = response.read()
                if len(data) != size:
                    raise RuntimeError('Truncated ranged read')
                self.pos += len(data)
                return data
            except (OSError, RuntimeError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)


def main():
    cell_hash = digest(ROOT / 'full/cells.json')
    output = ROOT / 'region-membership.json'
    if output.exists() and json.loads(output.read_text()).get('cellOrderSha256') == cell_hash:
        print('ROI membership matches current cell order; using prepared extraction')
        return
    meta_url = 'https://storage.googleapis.com/storage/v1/b/flyem-male-cns/o/' + urllib.parse.quote(OBJECT, safe='')
    with urllib.request.urlopen(meta_url) as response:
        metadata = json.load(response)
    size, generation = int(metadata['size']), metadata['generation']
    open_remote = lambda: pa.PythonFile(Remote(size, generation))
    cells = json.loads((ROOT / 'full/cells.json').read_text())
    ids = {int(cell['id']): i for i, cell in enumerate(cells)}
    regions = {r['name']: [] for r in json.loads((ROOT / 'regions.json').read_text())}
    schema = pa.ipc.open_file(open_remote()).schema
    options = pa.ipc.IpcReadOptions(included_fields=[
        schema.get_field_index(':ID(Body-ID)'), schema.get_field_index('roiInfo:string')])
    reader = pa.ipc.open_file(open_remote(), options=options)
    state = local()

    def fetch_batch(index):
        if not hasattr(state, 'reader'):
            state.reader = pa.ipc.open_file(open_remote(), options=options)
        return state.reader.get_batch(index)

    with ThreadPoolExecutor(max_workers=12) as pool:
        for start in range(0, reader.num_record_batches, 48):
            for batch in pool.map(fetch_batch, range(start, min(start + 48, reader.num_record_batches))):
                for body, info in zip(batch.column(0).to_pylist(), batch.column(1).to_pylist()):
                    if body not in ids or not info:
                        continue
                    for name, counts in json.loads(info).items():
                        if name in regions:
                            weight = int(counts.get('pre', 0)) + int(counts.get('post', 0))
                            if weight:
                                regions[name].append([ids[body], weight])
            print('ROI batches through', min(start + 48, reader.num_record_batches), flush=True)
    result = {
        'source': URL, 'sourceGeneration': generation, 'sourceMd5Base64': metadata['md5Hash'],
        'cellOrderSha256': cell_hash,
        'method': 'Mean simulated cell activity weighted by measured pre+post synapse counts; not local compartment activity.',
        'regions': [{'name': name, 'members': sorted(members)} for name, members in regions.items()],
    }
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print('Memberships', sum(len(members) for members in regions.values()))


if __name__ == '__main__':
    main()
