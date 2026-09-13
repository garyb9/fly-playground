"""Reproducible compact MaleCNS escape/wing circuit and anatomical viewer assets.
No invented edges. Biological connectivity, engineered LIF dynamics/readouts.
Run with pipeline/.venv/bin/python pipeline/build_real.py after fetch.py.
"""
from pathlib import Path
import json
import struct
import numpy as np
import pyarrow.feather as feather
from fetch import RAW, BASE, FILES, ROI, digest, download

OUT = Path(__file__).resolve().parent.parent / 'public' / 'data' / 'malecns'
W_NORM = 0.003
# Native soma/SWC coordinates are 8 nm voxels; ROI mesh positions are nm.
CENTER = np.array([48000., 26000., 28000.])
SCALE = 1 / 40000


def position(p):
    return (np.asarray(p) - CENTER) * np.array([1, -1, -1]) * SCALE


def finite(p):
    return p is not None and len(p) == 3 and np.isfinite(p).all()


def write_json(name, data):
    (OUT / name).write_text(json.dumps(data, separators=(',', ':'), allow_nan=False) + '\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    a = feather.read_feather(RAW / FILES[0]).set_index('bodyId')
    nt = feather.read_feather(RAW / FILES[2]).set_index('body').consensus_nt
    a = a[a.type.notna() & a.somaLocation.map(finite)].copy()
    seed_types = ['LC4', 'LPLC2', 'DNp01', 'DNp02', 'DNp04', 'DNp11', 'TTMn']
    seeds = a[a.type.isin(seed_types) | ((a.superclass == 'vnc_motor') & (a.subclass == 'wm'))]
    core_ids = set(map(int, seeds.index))
    g = feather.read_feather(RAW / FILES[1])
    g = g[(g.weight >= 3) & g.body_pre.isin(a.index) & g.body_post.isin(a.index)]
    touching = g[g.body_pre.isin(core_ids) | g.body_post.isin(core_ids)]
    scores = touching.groupby('body_pre').weight.sum().add(touching.groupby('body_post').weight.sum(), fill_value=0)
    partners = sorted((int(i) for i in scores.index if i not in core_ids), key=lambda i: (-scores[i], i))[:1200]
    ids = sorted(core_ids) + partners
    idx = {body: i for i, body in enumerate(ids)}
    selected = a.loc[ids]
    edges = g[g.body_pre.isin(ids) & g.body_post.isin(ids)].copy()
    edges['pre'] = edges.body_pre.map(idx); edges['post'] = edges.body_post.map(idx)
    edges = edges.sort_values(['pre', 'post'])
    def role(types, side=None):
        return [idx[int(i)] for i, r in selected.iterrows() if r.type in types and (side is None or r.somaSide == side)]
    looming = role(['LC4', 'LPLC2'])
    escape = role(['DNp01'])
    wing_types = sorted(set(seeds[seeds.subclass == 'wm'].type) - {'TTMn', 'STTMm'})
    input_roles = {'looming': looming, 'proximity': [], 'light_l': [], 'light_r': [], 'wind_l': [], 'wind_r': []}
    readout_roles = {'escape': escape, 'wing_l': role(wing_types, 'L'), 'wing_r': role(wing_types, 'R'), 'thrust': role(['DLMn a, b','DLMn c-f','DVMn 1a-c']), 'yaw_torque': []}
    names = sorted(selected.superclass.fillna('unclassified').unique())
    flags = []
    cells = []
    for i, (body, r) in enumerate(selected.iterrows()):
        transmitter = nt.get(body, 'unknown')
        transmitter = transmitter if isinstance(transmitter, str) else 'unknown'
        flag = int(i < len(core_ids)) | (2 if transmitter in ['gaba','glutamate'] else 0) | (4 if i in looming else 0) | (8 if any(i in x for x in readout_roles.values()) else 0)
        flags.append(flag)
        cells.append({'id': str(body), 'type': r.type, 'side': r.somaSide if isinstance(r.somaSide,str) else '?', 'nt': transmitter, 'group': names.index(r.superclass), 'position': position(r.somaLocation).round(6).tolist()})
    with (OUT/'neurons.bin').open('wb') as f:
        f.write(struct.pack('<IIII',0x4E594C46,1,len(ids),len(core_ids)))
        for i,c in enumerate(cells): f.write(struct.pack('<QfffHBB',int(c['id']),*c['position'],c['group'],flags[i],0))
    counts=np.bincount(edges.pre.to_numpy(dtype=int),minlength=len(ids))
    offsets=np.concatenate(([0],counts.cumsum())).astype('<u4')
    weights=edges.weight.to_numpy().copy()
    # Unresolved/modulatory transmitters retain anatomical edges but carry no direct current.
    signs=edges.body_pre.map(nt).isin(['acetylcholine','gaba','glutamate']).to_numpy()
    assert weights.max() <= 32767, 'quantization needs a new format'
    weights[~signs]=0
    with (OUT/'graph.bin').open('wb') as f:
        f.write(struct.pack('<IIIIQfI',0x47594C46,1,len(ids),0,len(edges),W_NORM,0))
        f.write(offsets.tobytes());f.write(edges.post.to_numpy(dtype='<u4').tobytes());f.write(weights.astype('<i2').tobytes())
    write_json('groups.json',{'scale_factor':SCALE,'groups':names,'roles':{'input':input_roles,'readout':readout_roles}})
    write_json('cells.json',cells)
    direct=edges[edges.pre.isin(looming)&edges.post.isin(escape)]
    assert len(direct)>0 and len(escape)==2 and looming
    sources=[{'url':BASE+n,'sha256':digest(RAW/n)} for n in FILES]
    report={'version':'malecns-v1-escape-1','dataset':'MaleCNS v1.0','license':'CC-BY-4.0','credit':'FlyEM / University of Cambridge / MRC LMB / Google Research — MaleCNS v1.0','n_neurons':len(ids),'core_count':len(core_ids),'n_edges':len(edges),'w_norm':W_NORM,'sources':sources,'coordinateTransform':{'voxelCenter':CENTER.tolist(),'voxelScale':SCALE,'axes':[1,-1,-1]},'directLoomingToEscape':len(direct),'directLoomingSynapses':int(direct.weight.sum()),'omittedInputs':['proximity','light_l','light_r','wind_l','wind_r'],'model':'LIF; ACh excitatory, GABA/Glu inhibitory hypothesis; unresolved/modulatory source current zero; escape is a modeled body impulse. Wing motor activity is an engineered readout, not validated flight physiology.','selection':'Named looming, escape and wing motor cells with measured somata; 1200 strongest measured partners; edges with >=3 contacts.'}
    write_json('manifest.json',report)
    # Static anatomical context carries no invented activity.
    context=a[(a.superclass!='vnc_intrinsic')&(a.superclass!='vnc_motor')&a.somaLocation.map(lambda p:p[2]<60000)]
    np.asarray([position(p) for p in context.somaLocation],dtype='<f4').tofile(OUT/'context.bin')
    meshes=json.loads((RAW/'meshes.json').read_text())
    meta=[]; allbytes=bytearray()
    for m in meshes:
        for frag in m['fragments']:
            b=(RAW/'meshes'/frag).read_bytes();n=struct.unpack_from('<I',b)[0]
            verts=np.frombuffer(b,dtype='<f4',offset=4,count=n*3).reshape(-1,3)
            faces=np.frombuffer(b,dtype='<u4',offset=4+n*12)
            assert faces.size%3==0 and int(faces.max())<n
            # Vertex clustering at 4096 nm keeps region shape while reducing browser cost.
            _, inverse = np.unique(np.round(verts / 4096).astype(np.int32), axis=0, return_inverse=True)
            sums = np.zeros((int(inverse.max())+1, 3)); np.add.at(sums, inverse, verts)
            reduced = sums / np.bincount(inverse)[:, None]
            triangles = inverse[faces].reshape(-1,3)
            triangles = triangles[(triangles[:,0]!=triangles[:,1])&(triangles[:,1]!=triangles[:,2])&(triangles[:,0]!=triangles[:,2])]
            faces = np.unique(triangles,axis=0).astype('<u4').ravel()
            converted=position(reduced/8).astype('<f4'); n=len(converted)
            offset=len(allbytes);allbytes.extend(struct.pack('<II',n,len(faces)));allbytes.extend(converted.tobytes());allbytes.extend(faces.tobytes())
            meta.append({'name':m['name'],'offset':offset,'bytes':len(allbytes)-offset,'source':ROI+'mesh/'+frag,'sha256':digest(RAW/'meshes'/frag)})
    (OUT/'regions.bin').write_bytes(allbytes);write_json('regions.json',meta)
    # Selected measured SWC arbors; same normalization as surfaces and somata.
    skeletons=[]
    show=escape + role(['LC4'], 'L')[:1] + role(['LC4'], 'R')[:1] + role(['LPLC2'], 'L')[:1] + role(['LPLC2'], 'R')[:1]
    for index in show:
        body=ids[index]
        url=f'https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/{body}.swc'
        path=download(url,RAW/'skeletons'/f'{body}.swc')
        rows=np.loadtxt(path); points={int(r[0]):r[2:5] for r in rows}
        lines=[]
        for r in rows:
            parent=int(r[6])
            if parent in points:
                lines.extend(position(points[int(r[0])]).round(6).tolist());lines.extend(position(points[parent]).round(6).tolist())
        skeletons.append({'index':index,'id':str(body),'type':cells[index]['type'],'positions':lines,'source':url,'sha256':digest(path)})
    write_json('skeletons.json',skeletons)
    print(json.dumps({'neurons' :len(ids),'edges':len(edges),'loomingGFedges':len(direct),'regions':len(meta),'meshMB':len(allbytes)/1e6,'context':len(context)}))


if __name__=='__main__': main()
