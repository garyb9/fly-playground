// Requires a local Vite server and Chrome --remote-debugging-port=9223.
// Measures actual app frames and worker ticks; GPU/software renderer recorded.
import { writeFileSync } from "node:fs";
const port = process.env.CDP_PORT || "9223";
const pages=await(await fetch("http://127.0.0.1:"+port+"/json")).json();
const page=pages.find(p=>p.type==="page");
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();
ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){pending.get(r.id)?.(r);pending.delete(r.id)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,r=>r.error?reject(Error(JSON.stringify(r.error))):resolve(r.result));ws.send(JSON.stringify({id:i,method,params}))});
const ev=async(expression)=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await call("Page.navigate",{url:"http://127.0.0.1:5173/?benchmark=1"});
for(let i=0;i<120;i++){if(await ev("Boolean(globalThis.__flyBenchmark)"))break;await sleep(500);}
const renderer=await ev(`(()=>{const gl=document.querySelector('#view').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',userAgent:navigator.userAgent};})()`);
const results=[];
async function measure(label) {
 await sleep(3000);
 const first=await ev("globalThis.__flyBenchmark()");
 await sleep(10000);
 const last=await ev("({...globalThis.__flyBenchmark(),heap:performance.memory?.usedJSHeapSize})");
 const seconds=(last.now-first.now)/1000;
 const result={label,transport:last.transport,seconds,fps:(last.renderedFrames-first.renderedFrames)/seconds,
  flies:last.flies.map((f,i)=>({active:f.active,ticksPerSecond:(f.tick-first.flies[i].tick)/seconds,reportedHz:f.hz})),
  jsHeapBytes:last.heap};
 results.push(result);console.log(JSON.stringify(result));
}
await measure("3 flies / compact");
await ev(`document.querySelectorAll('.fly-roster button').forEach(b=>{b.click();const s=document.querySelector('.brain-depth');s.value='166700';s.dispatchEvent(new Event('change'));})`);
await measure("3 flies / full");
for(let n=3;n<6;n++){
 await ev("document.querySelector('[data-action=add]').click()");
 for(let i=0;i<100;i++){if(await ev("document.querySelectorAll('.fly-roster button').length")===n+1)break;await sleep(300);}
}
await ev(`document.querySelectorAll('.fly-roster button').forEach(b=>{b.click();const s=document.querySelector('.brain-depth');s.value='166700';s.dispatchEvent(new Event('change'));})`);
await measure("6 flies / full");
await ev(`(async()=>{for(const b of document.querySelectorAll('.fly-roster button')){b.click();const input=document.querySelector('[aria-label="LIF noiseSigma"]');input.value='0';input.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,100));}})()`);
await measure("6 flies / full / membrane noise disabled");
writeFileSync(new URL("../docs/browser-performance.json",import.meta.url),JSON.stringify({date:new Date().toISOString(),renderer,results,note:"JS heap is not total process/GPU/WASM memory. Live bodies follow neural tick time using held snapshots; assays step body and brain together. Noise-disabled stage changes the model setting explicitly."},null,2)+"\n");
ws.close();
