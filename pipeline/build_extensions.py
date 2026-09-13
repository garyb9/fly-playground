"""Measured sensory identities and extra SWC arbors; no synthesized connections."""
from pathlib import Path
import json
import numpy as np
import pyarrow.feather as feather
from fetch import RAW, FILES, BASE, digest, download
from build_real import position
OUT=Path(__file__).resolve().parent.parent/'public/data/malecns'

def main():
    cells=json.loads((OUT/'full/cells.json').read_text())
    index={int(c['id']):i for i,c in enumerate(cells)}
    a=feather.read_feather(RAW/FILES[0]).set_index('bodyId')
    inputs={}
    for side,suffix in [('L','l'),('R','r')]:
        sides=a.rootSide.fillna(a.somaSide)
        for role,mask in [('light',a.type.isin(['Mi1','Tm3'])),('wind',a.type.fillna('').str.startswith('JO-E') & (a.subclass=='wind_gravity'))]:
            inputs[role+'_'+suffix]=sorted(index[int(body)] for body in a.index[mask & (sides==side)] if int(body) in index)
    report={'inputs':inputs,'sources':[{'url':BASE+FILES[0],'sha256':digest(RAW/FILES[0])}],
      'light':'Experimental ON-increment current into Mi1/Tm3 by rootSide (somaSide fallback); no retinal image, OFF channel or phototaxis claim.',
      'wind':'Experimental positive antennal-facing wind current into annotated JO-E wind_gravity cells by rootSide; no C/E opponent mechanics or navigation claim.',
      'references':['https://www.nature.com/articles/nature13427','https://pmc.ncbi.nlm.nih.gov/articles/PMC6533146/']}
    (OUT/'sensory-mappings.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    skeletons=json.loads((OUT/'skeletons.json').read_text())
    known={s['index'] for s in skeletons}
    # A representative, bilateral sample; raw source files remain cached.
    groups=json.loads((OUT/'full/groups.json').read_text())
    chosen=[]
    for members in list(inputs.values())+[groups['roles']['readout']['wing_l'],groups['roles']['readout']['wing_r']]:
        chosen.extend(members[:3])
    for i in chosen:
        if i in known:continue
        cell=cells[i];body=cell['id']
        url=f'https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/{body}.swc'
        path=download(url,RAW/'skeletons'/f'{body}.swc')
        rows=np.loadtxt(path,ndmin=2);points={int(r[0]):r[2:5] for r in rows};lines=[]
        for r in rows:
            if int(r[6]) in points:
                lines.extend(position(r[2:5]).round(6).tolist());lines.extend(position(points[int(r[6])]).round(6).tolist())
        skeletons.append({'index':i,'id':body,'type':cell['type'],'positions':lines,'source':url,'sha256':digest(path)})
        known.add(i)
    (OUT/'skeletons.json').write_text(json.dumps(skeletons,separators=(',',':'))+'\n')
    print({k:len(v) for k,v in inputs.items()},'arbors',len(skeletons))
if __name__=='__main__':main()
