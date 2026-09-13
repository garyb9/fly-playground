// Causal software checks against the shipped MaleCNS graph (not physiological validation).
// Run after yarn rs:wasm:node and pipeline/build_full.py.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { Sim } = createRequire(import.meta.url)("../crates/fly-sim/pkg-node/fly_sim.js");
const base = new URL("../public/data/malecns/full/", import.meta.url);
const neurons = readFileSync(new URL("neurons.bin", base));
const graph = readFileSync(new URL("graph.bin", base));
const groups = JSON.parse(readFileSync(new URL("groups.json", base)));
const looming = Uint32Array.from(groups.roles.input.looming);
const escape = Uint32Array.from(groups.roles.readout.escape);
function trial({ silence=false, disconnect=false, full=false }={}) {
  const bytes=Buffer.from(graph);
  if(disconnect) {
    const n=bytes.readUInt32LE(8),m=Number(bytes.readBigUInt64LE(16));
    // Remove all outgoing connections of injected cells, leaving direct stimulation intact.
    const weights=32+(n+1)*4+m*4;
    for(const i of looming) for(let k=bytes.readUInt32LE(32+i*4);k<bytes.readUInt32LE(32+(i+1)*4);k++)bytes.writeInt16LE(0,weights+k*2);
  }
  const s=new Sim(neurons,bytes,42n);s.set_params(5,20,1,0,2,0);s.set_active_count(full?166700:s.core_count());
  const l=s.define_input_role("loom",looming),e=s.define_readout_role("escape",escape);
  if(silence)s.silence_cells(escape,true);
  let peak=0,baseline=0;const trace=[];const start=performance.now();
  for(let t=0;t<320;t++){if(t>=80&&t<160)s.inject(l,1.5);s.step(1);const v=s.readout(e);trace.push(v);if(t<80)baseline=Math.max(baseline,v);else peak=Math.max(peak,v);}
  const result={peak,baseline,elapsedMs:performance.now()-start,neurons:s.active_count(),trace};s.free();return result;
}
const normal=trial(),silenced=trial({silence:true}),disconnected=trial({disconnect:true}),full=trial({full:true});
assert(normal.peak>.5);assert.equal(normal.baseline,0);assert.equal(silenced.peak,0);assert.equal(disconnected.peak,0);assert(full.peak>.5);
const replay=trial();assert.deepEqual(normal.trace,replay.trace);
const result={normal,silenced,disconnected,full,deterministicReplay:true};
writeFileSync(new URL("../public/data/malecns/validation.json",import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,typeof v==='object'?{...v,trace:undefined}:v])),null,2));
