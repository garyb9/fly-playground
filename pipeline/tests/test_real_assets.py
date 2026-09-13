"""Validate shipped anatomy/identity and full graph invariants without raw downloads."""
import json
import struct
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]/'public'/'data'/'malecns'


def test_full_network_and_core_identity():
    compact=json.loads((ROOT/'cells.json').read_text())
    cells=json.loads((ROOT/'full'/'cells.json').read_text())
    assert len(cells)==166700
    assert [c['id'] for c in cells[:len(compact)]]==[c['id'] for c in compact]
    b=(ROOT/'full'/'neurons.bin').read_bytes()
    assert len(b)==16+24*len(cells)
    assert len(set(c['id'] for c in cells))==len(cells)
    for i,c in enumerate(cells):
        body,x,y,z,group,flags,_=struct.unpack_from('<QfffHBB',b,16+24*i)
        assert str(body)==c['id']
        assert bool(flags&16)==(not c['measured'])
        assert np.isfinite([x,y,z]).all()


def test_full_graph_and_roles():
    b=(ROOT/'full'/'graph.bin').read_bytes()
    _,_,n,_,m,_,_=struct.unpack_from('<IIIIQfI',b)
    assert n==166700 and m>10000000
    offsets=np.frombuffer(b,'<u4',n+1,32)
    targets=np.frombuffer(b,'<u4',m,32+(n+1)*4)
    assert offsets[0]==0 and offsets[-1]==m
    assert (offsets[1:]>=offsets[:-1]).all() and targets.max()<n
    roles=json.loads((ROOT/'full'/'groups.json').read_text())['roles']
    assert len(roles['readout']['escape'])==2
    assert all(0<=i<1585 for role in roles.values() for ids in role.values() for i in ids)


def test_anatomical_meshes_share_finite_coordinates():
    meta=json.loads((ROOT/'regions.json').read_text());b=(ROOT/'regions.bin').read_bytes()
    assert len(meta)==90
    for region in meta:
        offset=region['offset'];n,count=struct.unpack_from('<II',b,offset)
        pos=np.frombuffer(b,'<f4',n*3,offset+8);indices=np.frombuffer(b,'<u4',count,offset+8+n*12)
        assert np.isfinite(pos).all() and np.abs(pos).max()<3
        assert indices.max()<n and count%3==0
        assert region['bytes']==8+n*12+count*4

def test_extensions_have_native_identities():
    cells=json.loads((ROOT/'full/cells.json').read_text())
    mappings=json.loads((ROOT/'sensory-mappings.json').read_text())['inputs']
    for role,ids in mappings.items():
        assert ids and len(ids)==len(set(ids))
        for i in ids:
            assert 0<=i<len(cells)
            if role.startswith('light'): assert cells[i]['type'] in ('Mi1','Tm3')
            else: assert cells[i]['type'].startswith('JO-E')
    arbors=json.loads((ROOT/'skeletons.json').read_text())
    assert len(arbors)>=24
    for arbor in arbors:
        assert cells[arbor['index']]['id']==arbor['id']
        assert len(arbor['positions'])%6==0 and np.isfinite(arbor['positions']).all()


def test_roi_membership_uses_valid_cells_and_positive_counts():
    regions=json.loads((ROOT/'region-membership.json').read_text())['regions']
    expected={r['name'] for r in json.loads((ROOT/'regions.json').read_text())}
    assert {r['name'] for r in regions}==expected
    assert sum(len(r['members']) for r in regions)>10000
    for region in regions:
        assert len({i for i,w in region['members']})==len(region['members'])
        assert all(0<=i<166700 and isinstance(w,int) and w>0 for i,w in region['members'])
