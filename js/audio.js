'use strict';
/* ============================================================================
   PRISM — audio.js
   Procedural Web Audio: a pulse track whose tempo climbs with the level, plus
   short synthesised hits. No files.
   ========================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volume = 0.8;
    this.bpm = 96;
    this._nextBeat = 0;
    this.beatIndex = 0;
    this.onBeat = null;
    this.intensity = 0;
    /* when a soundtrack is playing it owns the pulse; we only do SFX */
    this.musicMode = false;
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return false; }
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.enabled = false; return false; }
    const ctx = this.ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.knee.value = 22;
    this.comp.ratio.value = 4.5; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp);

    this.conv = ctx.createConvolver();
    this.conv.buffer = this._impulse(2.0, 2.6);
    this.rev = ctx.createGain(); this.rev.gain.value = 0.55;
    this.conv.connect(this.rev); this.rev.connect(this.master);
    this.send = ctx.createGain(); this.send.gain.value = 1;
    this.send.connect(this.conv);

    this.dry = ctx.createGain(); this.dry.gain.value = 1;
    this.dry.connect(this.master);

    this.noise = this._noiseBuf(2);

    /* a low bed that swells with the level */
    this.bed = ctx.createGain(); this.bed.gain.value = 0;
    this.bed.connect(this.dry);
    const bs = ctx.createGain(); bs.gain.value = 0.5; this.bed.connect(bs); bs.connect(this.send);
    this.bedFilt = ctx.createBiquadFilter();
    this.bedFilt.type = 'lowpass'; this.bedFilt.frequency.value = 360; this.bedFilt.Q.value = 2;
    this.bedFilt.connect(this.bed);
    this.bedOscs = [];
    [0, 7, 12].forEach((semi, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = 55 * Math.pow(2, semi / 12);
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.18;
      o.connect(g); g.connect(this.bedFilt); o.start();
      this.bedOscs.push(o);
    });

    this.ready = true;
    return true;
  }

  resume() { if (!this.ctx) this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  get live() { return this.ready && this.ctx && this.ctx.state === 'running'; }
  setVolume(v) { this.volume = clamp01(v); if (this.master) this.master.gain.value = this.enabled ? this.volume : 0; }
  toggleMute() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
    return this.enabled;
  }

  _impulse(dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.55;
      }
    }
    return buf;
  }
  _noiseBuf(dur) {
    const ctx = this.ctx, rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.7 + w * 0.3; d[i] = last * 1.6; }
    return buf;
  }
  _noise(loop) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = !!loop; return s; }
  _osc(type, f, when) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, when); return o; }
  _end(node, at, extra) {
    node.stop(at + 0.02);
    node.onended = () => {
      try { node.disconnect(); } catch (e) { }
      if (extra) for (const n of extra) { try { n.disconnect(); } catch (e) { } }
    };
  }

  /* --------------------------------------------------------- the pulse -- */
  setIntensity(v) {
    this.intensity = clamp01(v);
    if (!this.ready) return;
    const t = this.t;
    this.bed.gain.setTargetAtTime(this.musicMode ? 0.0001 : 0.1 + this.intensity * 0.16, t, 0.6);
    this.bedFilt.frequency.setTargetAtTime(300 + this.intensity * 700, t, 0.8);
    this.bpm = 96 + this.intensity * 42;
  }

  /* called every frame; fires onBeat so hazards can land on the grid */
  tick() {
    if (!this.live || this.musicMode) return;
    const now = this.t;
    if (this._nextBeat === 0) this._nextBeat = now + 0.1;
    const spb = 60 / this.bpm;
    while (now + 0.06 >= this._nextBeat) {
      const at = this._nextBeat;
      this._kick(at, this.beatIndex % 4 === 0 ? 1 : 0.6);
      if (this.beatIndex % 2 === 1) this._hat(at, 0.5 + this.intensity * 0.4);
      if (this.onBeat) this.onBeat(this.beatIndex, at);
      this.beatIndex++;
      this._nextBeat += spb;
    }
  }
  resetBeat() { this._nextBeat = 0; this.beatIndex = 0; }

  _kick(at, amp) {
    const ctx = this.ctx;
    const o = this._osc('sine', 130, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5 * amp * (0.5 + this.intensity * 0.6), at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    o.connect(g); g.connect(this.dry);
    o.start(at); this._end(o, at + 0.35, [g]);
  }
  _hat(at, amp) {
    const ctx = this.ctx;
    const n = this._noise(false);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.045 * amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    n.connect(f); f.connect(g); g.connect(this.dry);
    n.start(at); this._end(n, at + 0.1, [f, g]);
  }

  /* ------------------------------------------------------------- hits --- */
  blip(freq, vol, dur, type) {
    if (!this.live) return;
    const ctx = this.ctx, t = this.t + 0.004;
    const o = this._osc(type || 'triangle', freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.send);
    o.start(t); this._end(o, t + dur + 0.05, [g, s]);
  }

  /* colour switch: a short woody click, pitched by which colour */
  swap(index) {
    if (!this.live) return;
    this.blip(330 * Math.pow(2, index / 12), 0.07, 0.09, 'square');
  }

  /* pickup: a bright arpeggio step that climbs with the chain */
  pickup(chain) {
    if (!this.live) return;
    const ctx = this.ctx, t = this.t + 0.004;
    const scale = [0, 4, 7, 11, 12, 16, 19, 23, 24];
    const semi = scale[Math.min(chain, scale.length - 1)];
    const f = 523.25 * Math.pow(2, semi / 12);
    [0, 12].forEach((add, i) => {
      const o = this._osc(i ? 'sine' : 'triangle', f * Math.pow(2, add / 12), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i ? 0.09 : 0.16, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i ? 0.7 : 0.45));
      o.connect(g); g.connect(this.dry);
      const s = ctx.createGain(); s.gain.value = 0.7; g.connect(s); s.connect(this.send);
      o.start(t); this._end(o, t + 0.8, [g, s]);
    });
  }

  /* passing safely through a matching hazard */
  phase() {
    if (!this.live) return;
    const ctx = this.ctx, t = this.t + 0.004;
    const n = this._noise(false);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(3600, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    n.connect(f); f.connect(g); g.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = 0.9; g.connect(s); s.connect(this.send);
    n.start(t); this._end(n, t + 0.4, [f, g, s]);
  }

  dash() {
    if (!this.live) return;
    const ctx = this.ctx, t = this.t + 0.004;
    const n = this._noise(false);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(f); f.connect(g); g.connect(this.dry);
    n.start(t); this._end(n, t + 0.34, [f, g]);
    const o = this._osc('sine', 200, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(og); og.connect(this.dry);
    o.start(t); this._end(o, t + 0.3, [og]);
  }

  /* a hazard telegraphing */
  warn(index) {
    if (!this.live) return;
    this.blip(180 + index * 22, 0.05, 0.13, 'sawtooth');
  }

  death() {
    if (!this.live) return;
    const ctx = this.ctx, t = this.t + 0.004;
    const n = this._noise(false);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(f); f.connect(g); g.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = 0.9; g.connect(s); s.connect(this.send);
    n.start(t); this._end(n, t + 1.6, [f, g, s]);

    [0, -5, -12].forEach((semi, i) => {
      const at = t + i * 0.09;
      const o = this._osc('sawtooth', 220 * Math.pow(2, semi / 12), at);
      o.frequency.exponentialRampToValueAtTime(40 * Math.pow(2, semi / 12), at + 1.4);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, at);
      og.gain.exponentialRampToValueAtTime(0.11, at + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
      o.connect(fl); fl.connect(og); og.connect(this.dry);
      o.start(at); this._end(o, at + 1.7, [og, fl]);
    });
    this.bed.gain.setTargetAtTime(0.0001, t, 0.4);
  }

  win() {
    if (!this.live) return;
    const ctx = this.ctx, t0 = this.t + 0.01;
    [0, 4, 7, 12, 16, 19].forEach((s, i) => {
      const t = t0 + i * 0.085;
      const o = this._osc(i % 2 ? 'sine' : 'triangle', 261.63 * Math.pow(2, s / 12), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13 / (1 + i * 0.2), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g); g.connect(this.dry);
      const sd = ctx.createGain(); sd.gain.value = 1.1; g.connect(sd); sd.connect(this.send);
      o.start(t); this._end(o, t + 2.4, [g, sd]);
    });
  }
}
