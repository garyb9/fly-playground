// Web Audio glue — a small procedural soundscape: a low ambient drone bed under
// a slow filter LFO, a wing-hum oscillator tracking the flap readouts, and a
// one-shot blip on each fresh escape onset. NOT unit-tested (vitest env `node`
// has no Web Audio) — covered by `tsc` + `eslint` + `vite build` + the manual
// checklist. All parameter maths lives in the pure, unit-tested `./mapping`.
import type { Readouts } from "../body/types";
import { CONFIG } from "../app/config";
import { volumeGain } from "../ui/scale";
import { wingToneFreq, wingToneGain, detectEscapeOnset } from "./mapping";

type AudioCfg = typeof CONFIG.audio;

const wingReadouts = (r: Readouts): { wing_l: number; wing_r: number } => ({
  wing_l: r.wing_l ?? 0,
  wing_r: r.wing_r ?? 0,
});

export class AudioEngine {
  private readonly cfg: AudioCfg;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wingOsc: OscillatorNode | null = null;
  private wingGain: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private muted = true;
  private vol: number;
  private armed = true;
  private lastEscape = 0;

  constructor(cfg: AudioCfg = CONFIG.audio) {
    this.cfg = cfg;
    this.vol = cfg.masterDefault;
  }

  /** Lazily build the audio graph on first call (a user gesture must precede
   *  it — the HUD mute checkbox starts checked, so unchecking it is the gesture);
   *  later calls just resume a suspended context. */
  resume(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.cfg.lowpassHz;

    this.cfg.ambientFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 4; // slight per-osc detune for beating
      const g = ctx.createGain();
      g.gain.value = 0.2;
      osc.connect(g).connect(filter);
      osc.start();
      this.oscs.push(osc);
    });

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = this.cfg.lfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.oscs.push(lfo);

    const master = ctx.createGain();
    this.master = master;
    filter.connect(master).connect(ctx.destination);

    const wingOsc = ctx.createOscillator();
    wingOsc.type = "sine";
    wingOsc.frequency.value = this.cfg.WING_HZ_MIN;
    const wingGain = ctx.createGain();
    wingGain.gain.value = 0;
    wingOsc.connect(wingGain).connect(master);
    wingOsc.start();
    this.oscs.push(wingOsc);
    this.wingOsc = wingOsc;
    this.wingGain = wingGain;

    this.applyGain();
  }

  /** Per-frame: track the wing hum to the flap readouts and fire a blip on a
   *  fresh escape onset. `dt` is unused for now — kept for a future decay. */
  update(frame: { readouts: Readouts }, dt: number): void {
    void dt;
    const ctx = this.ctx;
    if (!ctx) return;

    const r = wingReadouts(frame.readouts);
    const now = ctx.currentTime;
    this.wingOsc?.frequency.setTargetAtTime(wingToneFreq(r), now, 0.05);
    this.wingGain?.gain.setTargetAtTime(this.muted ? 0 : wingToneGain(r), now, 0.05);

    const e = frame.readouts.escape ?? 0;
    const d = detectEscapeOnset(
      this.lastEscape,
      e,
      CONFIG.physics.ESCAPE_TH,
      CONFIG.physics.ESCAPE_HYST,
    );
    if (d.onset && this.armed && !this.muted) this.blip();
    if (d.armed) this.armed = true;
    else if (d.onset) this.armed = false;
    this.lastEscape = e;
  }

  private blip(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.cfg.blip.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(this.cfg.blip.gain, now);
    g.gain.exponentialRampToValueAtTime(1e-4, now + this.cfg.blip.dur);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + this.cfg.blip.dur);
  }

  private applyGain(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.master?.gain.setTargetAtTime(this.muted ? 0 : volumeGain(this.vol), ctx.currentTime, 0.03);
  }

  setMuted(b: boolean): void {
    this.muted = b;
    if (!b) this.resume();
    this.applyGain();
  }

  setVolume(v01: number): void {
    this.vol = v01;
    this.applyGain();
  }

  dispose(): void {
    for (const osc of this.oscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.oscs = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.wingOsc = null;
    this.wingGain = null;
  }
}
