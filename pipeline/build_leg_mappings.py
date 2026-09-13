"""Extract six leg motor populations from MaleCNS native subclass annotations.
Soma side remains an explicit output-side proxy; no muscle force claims.
"""
import json
from pathlib import Path
import pyarrow.feather as feather
from fetch import RAW, FILES, BASE, digest


def main():
    source = RAW / FILES[0]
    annotations = feather.read_feather(source)
    legs = annotations[(annotations.superclass == 'vnc_motor') & annotations.subclass.isin(['fl', 'ml', 'hl'])]
    records = []
    for _, cell in legs.sort_values('bodyId').iterrows():
        if cell.somaSide not in ['L', 'R']:
            continue
        records.append({'id': str(int(cell.bodyId)), 'leg': cell.somaSide.lower() + {'fl': 'f', 'ml': 'm', 'hl': 'h'}[cell.subclass], 'type': cell.type if isinstance(cell.type, str) else None, 'subclass': cell.subclass, 'exitNerve': cell.exitNerve if isinstance(cell.exitNerve, str) else None})
    result = {'dataset': 'MaleCNS v1.0', 'license': 'CC-BY-4.0', 'credit': 'FlyEM / University of Cambridge / MRC LMB / Google Research', 'source': BASE + FILES[0], 'sha256': digest(source), 'laterality': 'somaSide proxy; target-side physiology not validated', 'cells': records}
    target = Path(__file__).resolve().parent.parent / 'src/sim/leg-mappings.json'
    target.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(f'{len(records)} annotated leg motor cells')


if __name__ == '__main__':
    main()
