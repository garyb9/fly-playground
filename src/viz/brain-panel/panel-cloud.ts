import * as THREE from "three";
import type { NeuronsFile } from "../../formats/neurons";
import type { GraphFile } from "../../formats/graph";
import { coreFlags, coreEdgePairs } from "../geometry";
import { activePalette } from "../palette";
import type { Theme } from "../../ui/controls";
import { CONFIG } from "../../app/config";
import { fixtureRegion, unit } from "./role-monitor";

const common = `
  attribute float aActivity;
  attribute float aCore;
  attribute float aEnabled;
  uniform float uLoad;
  uniform float uReduced;
  uniform float uTime;
  uniform float uFlash;
  varying float vActivity;
  vec3 placed() {
    float seed = dot(position, vec3(13.1, 17.7, 9.2));
    vec3 scatter = vec3(sin(seed),cos(seed*1.3),sin(seed*1.7));
    return position + scatter * (1.0-uLoad) * (1.0-uReduced) * 1.4;
  }
`;

export function buildPanelCloud(neurons: NeuronsFile, graph: GraphFile) {
  const cfg = CONFIG.brainPanel;
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  // Uniform centering/scaling preserves the source geometry's proportions.
  geometry.setAttribute("position", new THREE.BufferAttribute(neurons.pos.slice(), 3));
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere!;
  const center = sphere.center.clone();
  const scale = 1 / Math.max(sphere.radius, 0.001);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  const activity = new THREE.BufferAttribute(new Float32Array(neurons.count), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  const enabled = new THREE.BufferAttribute(new Float32Array(neurons.count).fill(1), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  const visible = new THREE.BufferAttribute(new Float32Array(neurons.count).fill(1), 1);
  geometry.setAttribute("aActivity", activity);
  geometry.setAttribute("aEnabled", enabled);
  geometry.setAttribute("aVisible", visible);
  geometry.setAttribute("aCore", new THREE.BufferAttribute(coreFlags(neurons), 1));
  const tints = new Float32Array(neurons.count * 3);
  const regionColors = [0x6fbf8e, 0x9b84e0, 0x5aa0d6].map((c) => new THREE.Color(c));
  for (let i = 0; i < neurons.count; i++)
    regionColors[fixtureRegion(neurons.groupId[i]!)]!.toArray(tints, i * 3);
  geometry.setAttribute("aTint", new THREE.BufferAttribute(tints, 3));
  const uniforms = {
    uLoad: { value: 0 },
    uReduced: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uCold: { value: new THREE.Color() },
    uHot: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uWarm: { value: new THREE.Color() },
    uPixelRatio: { value: 1 },
    uBreath: { value: 1 },
  };
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader:
      common +
      `
      attribute float aVisible;
      attribute vec3 aTint;
      uniform float uPixelRatio;
      uniform float uBreath;
      varying vec3 vTint;
      varying float vVisible;
      void main() {
        vActivity=aActivity; vTint=aTint; vVisible=aVisible*aEnabled;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(placed(),1.0);
        gl_PointSize=(3.0+aCore*1.4+aActivity*4.0+uFlash*2.0*(1.0-uReduced))*uPixelRatio*uBreath;
      }`,
    fragmentShader: `
      uniform vec3 uCold; uniform vec3 uHot; uniform float uLoad; uniform float uFlash;
      uniform float uBreath;
      varying float vActivity; varying vec3 vTint; varying float vVisible;
      void main() {
        float r=length(gl_PointCoord-0.5);
        if(r>0.5 || vVisible<0.5) discard;
        vec3 cold=mix(uCold,vTint,${cfg.regionTintMix.toFixed(2)});
        vec3 color=mix(cold,uHot,clamp(vActivity*1.7+uFlash*0.65,0.0,1.0));
        gl_FragColor=vec4(color,(1.0-smoothstep(0.12,0.5,r))*uLoad*uBreath);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, pointMaterial);
  points.frustumCulled = false;
  // Expanded endpoints let each directed edge carry its own 0→1 pulse coordinate.
  const pairs = coreEdgePairs(graph, neurons.coreCount);
  const edgeGeometry = new THREE.BufferGeometry();
  const edgePositions = new Float32Array(pairs.length * 3);
  const edgeActivity = new THREE.BufferAttribute(new Float32Array(pairs.length), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  const edgeEnabled = new THREE.BufferAttribute(new Float32Array(pairs.length).fill(1), 1);
  const along = new Float32Array(pairs.length);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < pairs.length; i++) {
    const j = pairs[i]!;
    edgePositions.set([positions.getX(j), positions.getY(j), positions.getZ(j)], i * 3);
    along[i] = i % 2;
  }
  edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute("aActivity", edgeActivity);
  edgeGeometry.setAttribute("aEnabled", edgeEnabled);
  edgeGeometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  const edgeMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader:
      common +
      `attribute float aAlong; varying float vAlong; varying float vEnabled;
      void main(){ vActivity=aActivity; vAlong=aAlong; vEnabled=aEnabled;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(placed(),1.0); }`,
    fragmentShader: `uniform vec3 uEdge; uniform vec3 uWarm; uniform float uFlash; uniform float uLoad; uniform float uReduced;
      varying float vActivity; varying float vAlong; varying float vEnabled;
      void main(){
        float pulse=mix(exp(-pow((vAlong-(1.0-uFlash))*8.0,2.0)),1.0,uReduced)*uFlash;
        gl_FragColor=vec4(mix(uEdge,uWarm,clamp(vActivity+pulse,0.0,1.0)),
          (${cfg.edgeOpacity.toFixed(2)}+vActivity*.5+pulse*.65)*uLoad*vEnabled);
        #include <colorspace_fragment>
      }`,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.frustumCulled = false;
  group.add(edges, points);
  return {
    group,
    points,
    edges,
    update(snapshot: Float32Array) {
      const count = Math.min(snapshot.length, neurons.count);
      for (let i = 0; i < neurons.count; i++) {
        activity.setX(i, unit(snapshot[i] ?? 0));
        enabled.setX(i, i < count ? 1 : 0);
      }
      activity.needsUpdate = true;
      enabled.needsUpdate = true;
      for (let i = 0; i < pairs.length; i++) {
        edgeActivity.setX(i, activity.getX(pairs[i]!));
        edgeEnabled.setX(i, pairs[i]! < count ? 1 : 0);
      }
      edgeActivity.needsUpdate = true;
      edgeEnabled.needsUpdate = true;
    },
    setHiddenGroups(hidden: ReadonlySet<number>) {
      for (let i = 0; i < neurons.count; i++)
        visible.setX(i, hidden.has(neurons.groupId[i]!) ? 0 : 1);
      visible.needsUpdate = true;
    },
    setTheme(theme: Theme) {
      const p = activePalette(theme);
      uniforms.uCold.value.setHex(p.pointCold);
      uniforms.uHot.value.setHex(p.pointHot);
      uniforms.uEdge.value.setHex(p.edge);
      uniforms.uWarm.value.setHex(theme === "dark" ? p.escapeWarm : p.pointHot);
      for (const mat of [pointMaterial, edgeMaterial]) {
        mat.blending = theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending;
        mat.needsUpdate = true;
      }
    },
    animate(t: number, flash: number, reduced: boolean, pixelRatio: number) {
      uniforms.uTime.value = t;
      uniforms.uLoad.value = unit(t / cfg.loadS);
      uniforms.uFlash.value = flash;
      uniforms.uReduced.value = reduced ? 1 : 0;
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uBreath.value = reduced
        ? 1
        : 1 + Math.sin(t * Math.PI * 2 * cfg.breathHz) * cfg.breathAmp;
      group.rotation.set(0.18, reduced ? -0.35 : -0.35 + t * Math.PI * 2 * cfg.cloudRotateHz, 0);
    },
    dispose() {
      geometry.dispose();
      edgeGeometry.dispose();
      pointMaterial.dispose();
      edgeMaterial.dispose();
    },
  };
}
