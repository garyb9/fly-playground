"""Full 166,700 annotated MaleCNS neurons, compact circuit first, ranked remainder.
Missing somata remain in simulation with flag 16 (never rendered at a fake position).
"""
from pathlib import Path
import json, struct
import numpy as np
import pyarrow.feather as feather
from fetch import RAW, FILES
from build_real import OUT, W_NORM, position, finite


def main():
    a=feather.read_feather(RAW/FILES[0]).set_index('bodyId');a=a[a.superclass.notna()]
    assert len(a)==166700
    compact=json.loads((OUT/'cells.json').read_text());core=[int(c['id']) for c in compact]
    g=feather.read_feather(RAW/FILES[1]);g=g[(g.weight>=3)&g.body_pre.isin(a.index)&g.body_post.isin(a.index)]
    scores=g.groupby('body_pre').weight.sum().add(g.groupby('body_post').weight.sum(),fill_value=0)
    extra=sorted(set(map(int,a.index))-set(core),key=lambda i:(-scores.get(i,0),i));ids=core+extra
    indices={body:i for i,body in enumerate(ids)}
    g['pre']=g.body_pre.map(indices);g['post']=g.body_post.map(indices);g=g.sort_values(['pre','post'])
    nt=feather.read_feather(RAW/FILES[2]).set_index('body').consensus_nt
    groups=json.loads((OUT/'groups.json').read_text());names=groups['groups']+sorted(set(a.superclass)-set(groups['groups']))
    groups['groups']=names
    target=OUT/'full';target.mkdir(exist_ok=True)
    cells=[]
    with (target/'neurons.bin').open('wb') as f:
        f.write(struct.pack('<IIII',0x4E594C46,1,len(ids),len(core)))
        for i,body in enumerate(ids):
            r=a.loc[body];p=r.somaLocation;measured=finite(p);coords=position(p).round(6).tolist() if measured else [0,0,0]
            tr=nt.get(body,'unknown');tr=tr if isinstance(tr,str) else 'unknown'
            group=names.index(r.superclass);flag=(1 if i<len(core) else 0)|(2 if tr in ['gaba','glutamate'] else 0)|(0 if measured else 16)
            if i<len(core): flag|=(4 if i in groups['roles']['input']['looming'] else 0)|(8 if any(i in x for x in groups['roles']['readout'].values()) else 0)
            f.write(struct.pack('<QfffHBB',body,*coords,group,flag,0))
            cells.append({'id':str(body),'type':r.type if isinstance(r.type,str) else r.superclass,'side':r.somaSide if isinstance(r.somaSide,str) else '?','nt':tr,'group':group,'position':coords,'measured':bool(measured)})
    weights=g.weight.to_numpy().copy();assert weights.max()<=32767
    weights[~g.body_pre.map(nt).isin(['acetylcholine','gaba','glutamate']).to_numpy()]=0
    offsets=np.concatenate(([0],np.bincount(g.pre.to_numpy(dtype=int),minlength=len(ids)).cumsum())).astype('<u4')
    with (target/'graph.bin').open('wb') as f:
        f.write(struct.pack('<IIIIQfI',0x47594C46,1,len(ids),0,len(g),W_NORM,0));f.write(offsets.tobytes());f.write(g.post.to_numpy(dtype='<u4').tobytes());f.write(weights.astype('<i2').tobytes())
    (target/'groups.json').write_text(json.dumps(groups,separators=(',',':')))
    (target/'cells.json').write_text(json.dumps(cells,separators=(',',':')))
    manifest=json.loads((OUT/'manifest.json').read_text());manifest.update(version='malecns-v1-full-1',n_neurons=len(ids),core_count=len(core),n_edges=len(g),measuredSomata=sum(c['measured'] for c in cells),selection='All 166700 neurons with non-null superclass; edges >=3 contacts; compact circuit first, remainder by weighted degree. Missing somata retained in simulation and hidden in geometry (flag 16).')
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print({k:manifest[k] for k in ['n_neurons','n_edges','measuredSomata']},flush=True)

if __name__=='__main__':main()
