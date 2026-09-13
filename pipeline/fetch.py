"""Cache public MaleCNS tables and anatomical meshes; atomic downloads."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request

RAW = Path(__file__).parent / 'raw'
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
ROI = 'https://storage.googleapis.com/flyem-male-cns/rois/fullbrain-roi-v4/'
FILES = ['body-annotations-male-cns-v1.0-minconf-0.5.feather',
         'connectome-weights-male-cns-v1.0-minconf-0.5.feather',
         'body-neurotransmitters-male-cns-v1.0.feather']


def download(url, path):
    path = Path(path)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + '.part')
        with urllib.request.urlopen(url, timeout=60) as response, tmp.open('wb') as out:
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
        tmp.replace(path)
    return path


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch_mesh(item):
    ident, label = item
    p = download(ROI + f'mesh/{ident}:0', RAW / 'meshes' / f'{ident}.json')
    fragments = json.loads(p.read_text())['fragments']
    for fragment in fragments:
        download(ROI + 'mesh/' + urllib.parse.quote(fragment), RAW / 'meshes' / fragment)
    return {'id': ident, 'name': label, 'fragments': fragments}


def main():
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda name: download(BASE + name, RAW / name), FILES))
    props = download(ROI + 'segment_properties/info', RAW / 'regions.json')
    inline = json.loads(props.read_text())['inline']
    with ThreadPoolExecutor(max_workers=8) as pool:
        meshes = list(pool.map(fetch_mesh, zip(inline['ids'], inline['properties'][0]['values'])))
    (RAW / 'meshes.json').write_text(json.dumps(meshes, indent=2))
    print('Cached source tables and', len(meshes), 'anatomical regions')


if __name__ == '__main__':
    main()
