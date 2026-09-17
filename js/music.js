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

/* Per-track tempo lives in TRACKS (level.js). Measured for the first one:
   130.00 BPM, first downbeat at 0.4267s, 36.923s — exactly 80 beats, so the
   loop lands on the bar. */
const MUSIC_VOLUME = 0.55;

class Music {
  constructor(el) {
    this.el = el;
    this.ok = false;
    this.playing = false;
    this.vol = MUSIC_VOLUME;
    this.target = MUSIC_VOLUME;
    this.lastBeat = -1;
    this.onBeat = null;
    this.bpm = 130;
    this.offset = 0;
    this.spb = 60 / this.bpm;
    this.trackId = null;
    /* Whether the track is genuinely moving. `playing` only means we asked
       it to; a blocked autoplay, a failed decode or a stalled network all
       leave the element sitting at a fixed currentTime, and if we trusted
       that as the clock the level would simply never advance. */
    this.advancing = false;
    this._lastT = -1;
    this._stall = 0;

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

  /* Point the element at a track. Swapping songs is a data change: a level
     names a track id, and everything tempo-related follows from that. */
  load(track) {
    if (!this.el || !track) return;
    this.bpm = track.bpm;
    this.offset = track.offset;
    this.spb = 60 / track.bpm;
    if (this.trackId === track.id) return;
    this.trackId = track.id;
    this.failed = false;
    try {
      this.el.src = track.src;
      this.el.load();
    } catch (e) { this.failed = true; }
  }

  /* continuous beat position — the editor and any chart need sub-beat
     precision, so this is the number everything reads. Returns null unless
     the track is actually moving, so callers fall back to their own clock. */
  beatFloat() {
    if (!this.el || !this.playing || !this.advancing) return null;
    const t = this.el.currentTime;
    if (!isFinite(t)) return null;
    return (t - this.offset) / this.spb;
  }

  start(fromTop) {
    if (!this.el || this.failed) return false;
    try {
      if (fromTop !== false) this.el.currentTime = 0;
      this.lastBeat = -1;
      this._lastT = -1; this._stall = 0; this.advancing = false;
      const p = this.el.play();
      if (p && p.catch) p.catch(() => { this.playing = false; });
      this.playing = true;
      this.target = MUSIC_VOLUME;
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
  duck(v) { this.target = MUSIC_VOLUME * clamp01(v); }

  setMuted(m) { this.muted = m; }

  update(rdt) {
    if (!this.el) return;
    this.vol = damp(this.vol, this.muted ? 0 : this.target, 6, rdt);
    try { this.el.volume = clamp01(this.vol); } catch (e) { }

    /* is the playhead really moving? */
    const now = this.el.currentTime;
    if (this.playing && !this.el.paused && now > this._lastT + 1e-4) {
      this._stall = 0;
      this.advancing = true;
    } else {
      this._stall += rdt;
      if (this._stall > 0.3) this.advancing = false;
    }
    this._lastT = now;

    /* ---- the beat clock ---- */
    if (!this.playing || !this.onBeat) return;
    const t = this.el.currentTime;
    if (!isFinite(t)) return;
    const b = Math.floor((t - this.offset) / this.spb);
    if (b < this.lastBeat) { this.lastBeat = b; return; }   // the track looped
    if (this.lastBeat < 0) { this.lastBeat = b; return; }
    /* never fire a burst of catch-up beats after a stall */
    const missed = Math.min(2, b - this.lastBeat);
    for (let i = 0; i < missed; i++) this.onBeat(this.lastBeat + 1 + i);
    this.lastBeat = b;
  }
}
