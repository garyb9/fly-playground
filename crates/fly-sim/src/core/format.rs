//! Read-only decoders for the committed `neurons.bin` / `graph.bin` fixture
//! bytes. Layout is authoritative in the Plan 01 doc's "Binary formats"
//! section (16-byte `neurons.bin` header + 24-byte records; 32-byte padded
//! `graph.bin` header + CSR arrays). Little-endian throughout.
//!
//! Several fields / accessors here (`version`, `group_id`, `is_inhibitory`, …)
//! are part of the format contract but are first consumed by later Plan 01
//! tasks (`core::lif`, `core::sim`, the wasm wrapper), so the module allows
//! dead code until then.
#![allow(dead_code)]

use std::convert::TryInto;

const NEURONS_MAGIC: u32 = 0x4E59_4C46; // "FLYN" LE
const GRAPH_MAGIC: u32 = 0x4759_4C46; // "FLYG" LE
const NEURON_REC: usize = 24;

#[derive(Debug, PartialEq, Eq)]
pub enum FormatError {
    TooShort { need: usize, got: usize },
    BadMagic { expected: u32, got: u32 },
    BadOffsets,
}

#[inline]
fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline]
fn u64_at(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}
#[inline]
fn f32_at(b: &[u8], o: usize) -> f32 {
    f32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline]
fn u16_at(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes(b[o..o + 2].try_into().unwrap())
}

pub struct NeuronsFile {
    pub version: u32,
    pub core_count: u32,
    pub ids: Vec<u64>,
    pub pos: Vec<[f32; 3]>,
    pub group_id: Vec<u16>,
    pub flags: Vec<u8>,
}

impl NeuronsFile {
    pub fn count(&self) -> usize {
        self.ids.len()
    }
    pub fn is_core(&self, i: usize) -> bool {
        self.flags[i] & 0b0001 != 0
    }
    pub fn is_inhibitory(&self, i: usize) -> bool {
        self.flags[i] & 0b0010 != 0
    }
    pub fn is_input(&self, i: usize) -> bool {
        self.flags[i] & 0b0100 != 0
    }
    pub fn is_readout(&self, i: usize) -> bool {
        self.flags[i] & 0b1000 != 0
    }

    pub fn parse(b: &[u8]) -> Result<Self, FormatError> {
        if b.len() < 16 {
            return Err(FormatError::TooShort {
                need: 16,
                got: b.len(),
            });
        }
        let magic = u32_at(b, 0);
        if magic != NEURONS_MAGIC {
            return Err(FormatError::BadMagic {
                expected: NEURONS_MAGIC,
                got: magic,
            });
        }
        let version = u32_at(b, 4);
        let count = u32_at(b, 8) as usize;
        let core_count = u32_at(b, 12);
        let need = 16 + count * NEURON_REC;
        if b.len() < need {
            return Err(FormatError::TooShort { need, got: b.len() });
        }
        let mut ids = Vec::with_capacity(count);
        let mut pos = Vec::with_capacity(count);
        let mut group_id = Vec::with_capacity(count);
        let mut flags = Vec::with_capacity(count);
        for k in 0..count {
            let o = 16 + k * NEURON_REC;
            ids.push(u64_at(b, o));
            pos.push([f32_at(b, o + 8), f32_at(b, o + 12), f32_at(b, o + 16)]);
            group_id.push(u16_at(b, o + 20));
            flags.push(b[o + 22]);
        }
        Ok(Self {
            version,
            core_count,
            ids,
            pos,
            group_id,
            flags,
        })
    }
}

pub struct GraphFile {
    pub version: u32,
    pub n_nodes: usize,
    pub w_norm: f32,
    pub offsets: Vec<u32>,
    pub targets: Vec<u32>,
    pub weights: Vec<i16>,
}

pub struct RowIter<'a> {
    t: &'a [u32],
    w: &'a [i16],
    i: usize,
}
impl Iterator for RowIter<'_> {
    type Item = (u32, i16);
    fn next(&mut self) -> Option<Self::Item> {
        if self.i >= self.t.len() {
            return None;
        }
        let out = (self.t[self.i], self.w[self.i]);
        self.i += 1;
        Some(out)
    }
}

impl GraphFile {
    pub fn n_edges(&self) -> usize {
        self.targets.len()
    }

    pub fn row(&self, i: usize) -> RowIter<'_> {
        let s = self.offsets[i] as usize;
        let e = self.offsets[i + 1] as usize;
        RowIter {
            t: &self.targets[s..e],
            w: &self.weights[s..e],
            i: 0,
        }
    }

    pub fn parse(b: &[u8]) -> Result<Self, FormatError> {
        if b.len() < 32 {
            return Err(FormatError::TooShort {
                need: 32,
                got: b.len(),
            });
        }
        let magic = u32_at(b, 0);
        if magic != GRAPH_MAGIC {
            return Err(FormatError::BadMagic {
                expected: GRAPH_MAGIC,
                got: magic,
            });
        }
        let version = u32_at(b, 4);
        let n_nodes = u32_at(b, 8) as usize;
        let n_edges = u64_at(b, 16) as usize;
        let w_norm = f32_at(b, 24);

        let off_bytes = (n_nodes + 1) * 4;
        let tgt_bytes = n_edges * 4;
        let wt_bytes = n_edges * 2;
        let need = 32 + off_bytes + tgt_bytes + wt_bytes;
        if b.len() < need {
            return Err(FormatError::TooShort { need, got: b.len() });
        }

        let mut offsets = Vec::with_capacity(n_nodes + 1);
        for k in 0..=n_nodes {
            offsets.push(u32_at(b, 32 + k * 4));
        }
        if offsets[0] != 0
            || offsets[n_nodes] as usize != n_edges
            || offsets.windows(2).any(|w| w[0] > w[1])
        {
            return Err(FormatError::BadOffsets);
        }

        let tbase = 32 + off_bytes;
        let mut targets = Vec::with_capacity(n_edges);
        for k in 0..n_edges {
            let t = u32_at(b, tbase + k * 4);
            if t as usize >= n_nodes {
                return Err(FormatError::BadOffsets);
            }
            targets.push(t);
        }

        let wbase = tbase + tgt_bytes;
        let mut weights = Vec::with_capacity(n_edges);
        for k in 0..n_edges {
            weights.push(i16::from_le_bytes(
                b[wbase + k * 2..wbase + k * 2 + 2].try_into().unwrap(),
            ));
        }

        Ok(Self {
            version,
            n_nodes,
            w_norm,
            offsets,
            targets,
            weights,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn neurons() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/neurons.bin"
        ))
        .expect("run `python pipeline/gen_fixture.py` first")
    }
    fn graph() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../pipeline/out/fixture/graph.bin"
        ))
        .unwrap()
    }

    #[test]
    fn parses_fixture_neurons() {
        let n = NeuronsFile::parse(&neurons()).unwrap();
        assert_eq!(n.count(), 500);
        assert_eq!(n.core_count, 48);
        assert!((0..48).all(|i| n.is_core(i)));
        assert!(!(48..500).any(|i| n.is_core(i)));
        assert!((0..8).all(|i| n.is_input(i)));
        assert!((24..32).all(|i| n.is_readout(i)));
        assert!(n.pos.iter().all(|p| p.iter().all(|v| v.is_finite())));
    }

    #[test]
    fn parses_fixture_graph_csr() {
        let g = GraphFile::parse(&graph()).unwrap();
        assert_eq!(g.n_nodes, 500);
        assert_eq!(g.offsets.len(), 501);
        assert_eq!(*g.offsets.last().unwrap() as usize, g.n_edges());
        assert!(g.offsets.windows(2).all(|w| w[0] <= w[1]));
        assert!(g.targets.iter().all(|&t| (t as usize) < g.n_nodes));
        assert!(g.w_norm > 0.0);
    }

    #[test]
    fn row_iter_matches_offsets() {
        let g = GraphFile::parse(&graph()).unwrap();
        for src in 0..8usize {
            let targets: Vec<u32> = g.row(src).map(|(t, _)| t).collect();
            for esc in 24u32..32 {
                assert!(
                    targets.contains(&esc),
                    "looming {src} -> escape {esc} missing"
                );
            }
        }
    }

    #[test]
    fn rejects_bad_magic() {
        let mut b = neurons();
        b[0] ^= 0xFF;
        assert!(matches!(
            NeuronsFile::parse(&b),
            Err(FormatError::BadMagic { .. })
        ));
    }

    #[test]
    fn rejects_truncated() {
        let b = graph();
        assert!(matches!(
            GraphFile::parse(&b[..40]),
            Err(FormatError::TooShort { .. })
        ));
    }
}
