// Verify source -> recorded downstream responses in the engineered LIF model.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { Sim } = createRequire(import.meta.url)("../crates/fly-sim/pkg-node/fly_sim.js");
const base = new URL("../public/data/malecns/", import.meta.url);
const neurons = readFileSync(new URL("full/neurons.bin",base)), graph = readFileSync(new URL("full/graph.bin",base));
const mapping = JSON.parse(readFileSync(new URL("sensory-mappings.json",base)));
const n=graph.readUInt32LE(8), m=Number(graph.readBigUInt64LE(16)), targetOffset=32+(n+1)*4, weightOffset=targetOffset+m*4;
const results={};
for(const [name,cells] of Object.entries(mapping.inputs)) {
  const excluded=new Set(cells), scores=new Map();
  for(const src of cells) {
    const flags=neurons[16+src*24+22];
    if(flags&2) continue;
    for(let k=graph.readUInt32LE(32+src*4);k<graph.readUInt32LE(32+(src+1)*4);k++) {
      const dst=graph.readUInt32LE(targetOffset+k*4), w=graph.readInt16LE(weightOffset+k*2);
      if(w>0&&!excluded.has(dst)) scores.set(dst,(scores.get(dst)||0)+w);
    }
  }
  const targets=[...scores].sort((a,b)=>b[1]-a[1]).slice(0,32).map(x=>x[0]);
  assert(targets.length>0);
  function run(silenced) {
    const s=new Sim(neurons,graph,42n);s.set_params(5,20,1,0,2,0);s.set_active_count(n);
    const r=s.define_readout_role("downstream",Uint32Array.from(targets));
    if(silenced)s.silence_cells(Uint32Array.from(cells),true);
    let peak=0;
    for(let t=0;t<160;t++) {
      if(t>=40&&t<120)s.inject_cells(Uint32Array.from(cells),1.5);
      s.step(1);peak=Math.max(peak,s.readout(r));
    }
    s.free();return peak;
  }
  const driven=run(false), sourceSilenced=run(true);
  assert(driven>0.01, name+" no downstream response");assert.equal(sourceSilenced,0);
  results[name]={sourceCount:cells.length,downstreamTargets:targets,driven,sourceSilenced};
}
writeFileSync(new URL("../docs/sensory-model-validation.json",import.meta.url),JSON.stringify(results,null,2)+"\n");
console.log(JSON.stringify(results,null,2));
