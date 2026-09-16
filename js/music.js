'use strict';
/* ============================================================================
   PRISM — music.js

   The soundtrack plays through a plain <audio> element rather than the Web
   Audio graph, because the game is normally opened straight off disk and
   file:// pages cannot fetch/decode their own assets. A media element can
   still load a same-directory file, so this is the one route that works
   both from disk and from a server.

   It is also the game's clock: hazards are spawned on the track's beat.
   ========================================================================== */

/* Measured from the source wav: 130.00 BPM, first downbeat at 0.4267s,
   36.923s long — exactly 80 beats, so the loop lands on the bar. */
const MUSIC = {
  bpm: 130.0,
  offset: 0.4267,
  volume: 0.55,
};

class Music {
  constructor(el) {
    this.el = el;
    this.ok = false;
    this.playing = false;
    this.vol = MUSIC.volume;
    this.target = MUSIC.volume;
    this.lastBeat = -1;
    this.onBeat = null;
    this.spb = 60 / MUSIC.bpm;

    if (!el) return;
    el.volume = 0;
    el.addEventListener('canplaythrough', () => { this.ok = true; }, { once: true });
    el.addEventListener('error', () => { this.ok = false; this.failed = true; });
    /* the element's own `loop` does the wrapping; this is only a safety net
       in case a decoder ends the stream instead of looping */
    el.addEventListener('ended', () => {
      if (!this.playing) return;
      try { el.currentTime = 0; el.play().catch(() => { }); } catch (e) { }
    });
  }

  get available() { return !!this.el && !this.failed; }

  start(fromTop) {
    if (!this.el || this.failed) return false;
    try {
      if (fromTop !== false) this.el.currentTime = 0;
      this.lastBeat = -1;
      const p = this.el.play();
      if (p && p.catch) p.catch(() => { this.playing = false; });
      this.playing = true;
      this.target = MUSIC.volume;
      return true;
    } catch (e) { this.playing = false; return false; }
  }

  stop() {
    if (!this.el) return;
    try { this.el.pause(); } catch (e) { }
    this.playing = false;
  }

  pause(p) {
    if (!this.el || !this.playing) return;
    try { if (p) this.el.pause(); else this.el.play().catch(() => { }); } catch (e) { }
  }

  /* 0 = silent, 1 = full — used to duck under the death sequence */
  duck(v) { this.target = MUSIC.volume * clamp01(v); }

  setMuted(m) { this.muted = m; }

  update(rdt) {
    if (!this.el) return;
    this.vol = damp(this.vol, this.muted ? 0 : this.target, 6, rdt);
    try { this.el.volume = clamp01(this.vol); } catch (e) { }

    /* ---- the beat clock ---- */
    if (!this.playing || !this.onBeat) return;
    const t = this.el.currentTime;
    if (!isFinite(t)) return;
    const b = Math.floor((t - MUSIC.offset) / this.spb);
    if (b < this.lastBeat) { this.lastBeat = b; return; }   // the track looped
    if (this.lastBeat < 0) { this.lastBeat = b; return; }
    /* never fire a burst of catch-up beats after a stall */
    const missed = Math.min(2, b - this.lastBeat);
    for (let i = 0; i < missed; i++) this.onBeat(this.lastBeat + 1 + i);
    this.lastBeat = b;
  }
}
