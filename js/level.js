'use strict';
/* ============================================================================
   PRISM — level.js

   The level format, its storage, and the runner that plays one back.

   PORTABILITY NOTE — this format is deliberately engine-agnostic, because the
   real build is going to Godot. Nothing in a level file refers to a class, a
   function, a pixel or a frame. Specifically:

     · time is in BEATS, never seconds or frames, so a chart survives any
       tempo and any frame rate
     · positions are NORMALISED 0..1 of the arena, so they survive any
       resolution or arena size
     · magnitudes (thickness, speed, radius) are normalised to arena WIDTH
     · colours are indices into a named palette that travels with the file
     · angles are degrees, clockwise, 0 = +X
     · every type is a plain string with a documented parameter set

   A Godot importer is then: parse JSON -> for each event, instance a scene and
   multiply the normalised numbers by the arena size. See LEVEL_FORMAT.md.
   ========================================================================== */

const LEVEL_FORMAT = 'prism.level';
const LEVEL_VERSION = 1;

/* Canonical arena the editor authors against. Runtime may use any size; all
   stored geometry is normalised so it scales cleanly. */
const CANON = { w: 1280, h: 800 };

/* ---------------------------------------------------------------- tracks --
   One entry per piece of music. Adding a song is a data change, nothing more:
   drop the file in audio/, measure its tempo, add a row. */
const TRACKS = {
  'trailer_2': {
    id: 'trailer_2',
    title: 'Trailer Draft 2',
    src: 'audio/trailer_song_2_draft.mp3',
    bpm: 130.0,
    offset: 0.4267,
    beats: 80,
  },
};
function getTrack(id) { return TRACKS[id] || TRACKS['trailer_2']; }

/* ------------------------------------------------------------ event spec --
   Each entry lists the parameters an event of that type carries, with the
   default used when a field is absent. This table is the single source of
   truth for the editor's inspector, the validator and the documentation. */
const EVENT_SPEC = {
  /* a band that sweeps the whole arena */
  wave: {
    label: 'Wave',
    fields: {
      color: { def: 0, type: 'color' },
      angle: { def: 0, type: 'angle', min: 0, max: 360 },        // degrees of travel
      thickness: { def: 0.11, type: 'norm', min: 0.03, max: 0.4 },  // × arena width
      speed: { def: 0.24, type: 'norm', min: 0.06, max: 0.9 },   // arena widths / second
      telegraph: { def: 2, type: 'beats', min: 0.25, max: 16 },
    },
  },
  /* a shape hurled across the arena in a straight line */
  shard: {
    label: 'Shard',
    fields: {
      color: { def: 0, type: 'color' },
      x: { def: 0.5, type: 'unit' },        // spawn point, 0..1 of arena
      y: { def: -0.06, type: 'unit' },      // outside the arena is fine
      angle: { def: 90, type: 'angle', min: 0, max: 360 },
      aim: { def: 'fixed', type: 'enum', values: ['fixed', 'player'] },
      speed: { def: 0.33, type: 'norm', min: 0.08, max: 1.2 },
      radius: { def: 0.012, type: 'norm', min: 0.004, max: 0.05 },
      sides: { def: 3, type: 'int', min: 3, max: 6 },
      telegraph: { def: 1.5, type: 'beats', min: 0.25, max: 16 },
    },
  },
  /* a seed that opens into a ring of shards */
  bloom: {
    label: 'Bloom',
    fields: {
      color: { def: 0, type: 'color' },
      color2: { def: -1, type: 'color2' },    // -1 = single colour
      x: { def: 0.5, type: 'unit' },
      y: { def: 0.5, type: 'unit' },
      petals: { def: 8, type: 'int', min: 3, max: 18 },
      speed: { def: 0.24, type: 'norm', min: 0.08, max: 0.8 },
      spin: { def: 0, type: 'angle', min: 0, max: 360 },          // petal offset
      telegraph: { def: 2, type: 'beats', min: 0.25, max: 16 },
    },
  },
  /* a pickup. Miss one and the run ends, same as the arcade mode. */
  orb: {
    label: 'Orb',
    fields: {
      color: { def: 0, type: 'color' },
      x: { def: 0.5, type: 'unit' },
      y: { def: 0.5, type: 'unit' },
      life: { def: 8, type: 'beats', min: 1, max: 64 },           // how long before it fades
    },
  },
};

/* -------------------------------------------------------------- defaults -- */
function blankLevel(id, name) {
  return {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    id: id || 'untitled',
    name: name || 'UNTITLED',
    author: '',
    difficulty: 1,             // 1..5, purely presentational
    track: 'trailer_2',
    arena: { w: CANON.w, h: CANON.h },
    palette: HUES.map(h => h.name),
    length: 80,                // beats; the level ends here
    leadIn: 4,                 // beats of quiet before the first event may fire
    events: [],
  };
}

/* Fill in missing fields and sort. Never mutates the input. */
function normaliseLevel(raw) {
  const L = Object.assign(blankLevel(), raw || {});
  L.arena = Object.assign({ w: CANON.w, h: CANON.h }, raw && raw.arena);
  L.palette = (raw && raw.palette) || HUES.map(h => h.name);
  L.events = ((raw && raw.events) || []).map(e => {
    const spec = EVENT_SPEC[e.type];
    if (!spec) return null;
    const out = { type: e.type, beat: +e.beat || 0 };
    for (const k in spec.fields) {
      out[k] = e[k] === undefined ? spec.fields[k].def : e[k];
    }
    return out;
  }).filter(Boolean);
  L.events.sort((a, b) => a.beat - b.beat || a.type.localeCompare(b.type));
  L.length = Math.max(1, +L.length || 80);
  return L;
}

function validateLevel(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not an object'] };
  if (raw.format !== LEVEL_FORMAT) errs.push('format must be "' + LEVEL_FORMAT + '"');
  if (+raw.version > LEVEL_VERSION) errs.push('made by a newer version (' + raw.version + ')');
  if (!Array.isArray(raw.events)) errs.push('events must be an array');
  else raw.events.forEach((e, i) => {
    if (!EVENT_SPEC[e.type]) errs.push('event ' + i + ': unknown type "' + e.type + '"');
    if (!isFinite(e.beat)) errs.push('event ' + i + ': beat must be a number');
  });
  if (raw.track && !TRACKS[raw.track]) errs.push('unknown track "' + raw.track + '"');
  return { ok: errs.length === 0, errors: errs };
}

/* ---------------------------------------------------------------- store --
   localStorage for now. Kept behind this object so swapping it for a file or
   a server later touches one place. */
const LevelStore = {
  KEY_LEVELS: 'prism.levels',
  KEY_PROGRESS: 'prism.progress',

  allCustom() {
    const raw = storageGet(this.KEY_LEVELS, []);
    return Array.isArray(raw) ? raw.map(normaliseLevel) : [];
  },
  save(level) {
    const list = storageGet(this.KEY_LEVELS, []);
    const i = list.findIndex(l => l.id === level.id);
    if (i >= 0) list[i] = level; else list.push(level);
    storageSet(this.KEY_LEVELS, list);
    return level;
  },
  remove(id) {
    storageSet(this.KEY_LEVELS, storageGet(this.KEY_LEVELS, []).filter(l => l.id !== id));
  },

  progress() { return storageGet(this.KEY_PROGRESS, {}); },
  progressFor(id) {
    const p = this.progress()[id];
    return p || { best: 0, cleared: false, attempts: 0 };
  },
  record(id, percent, cleared) {
    const all = this.progress();
    const cur = all[id] || { best: 0, cleared: false, attempts: 0 };
    cur.best = Math.max(cur.best, Math.round(percent));
    cur.cleared = cur.cleared || !!cleared;
    cur.attempts = (cur.attempts || 0) + 1;
    all[id] = cur;
    storageSet(this.KEY_PROGRESS, all);
    return cur;
  },

  /* a paste-able string, so levels can travel between browsers later */
  encode(level) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(level)))); }
    catch (e) { return ''; }
  },
  decode(str) {
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      return validateLevel(o).ok ? normaliseLevel(o) : null;
    } catch (e) { return null; }
  },
};

/* --------------------------------------------------------------- runner --
   Plays a level against a continuous beat position. Events are fired
   telegraph-beats EARLY so that a hazard becomes lethal exactly on its beat —
   that is what makes a chart feel locked to the music. */
class LevelRunner {
  constructor(level, game) {
    this.level = normaliseLevel(level);
    this.g = game;
    /* pre-compute each event's spawn beat and keep them in fire order */
    this.queue = this.level.events.map(e => ({
      ev: e,
      spawn: e.beat - (e.telegraph !== undefined ? e.telegraph : 0),
    })).sort((a, b) => a.spawn - b.spawn);
    this.next = 0;
    this.beat = 0;
    this.finished = false;
  }

  get length() { return this.level.length; }
  get percent() { return clamp01(this.beat / this.length) * 100; }

  reset() { this.next = 0; this.beat = 0; this.finished = false; }

  update(beatNow) {
    this.beat = beatNow;
    while (this.next < this.queue.length && this.queue[this.next].spawn <= beatNow) {
      this.fire(this.queue[this.next].ev, beatNow);
      this.next++;
    }
    if (!this.finished && beatNow >= this.length) { this.finished = true; return 'end'; }
    return null;
  }

  /* normalised -> world */
  _x(v) { return this.g.arena.x + v * this.g.arena.w; }
  _y(v) { return this.g.arena.y + v * this.g.arena.h; }
  _n(v) { return v * this.g.arena.w; }
  _secPerBeat() { return this.g.secPerBeat; }

  fire(e, beatNow) {
    const g = this.g;
    const spb = this._secPerBeat();
    const teleSec = Math.max(0.05, (e.telegraph || 0) * spb);

    if (e.type === 'wave') {
      g.hazards.push(new Wave(e.color, e.angle * DEG, this._n(e.thickness),
        this._n(e.speed), teleSec));
      g.audio.warn(e.color);

    } else if (e.type === 'shard') {
      const x = this._x(e.x), y = this._y(e.y);
      let a = e.angle * DEG;
      if (e.aim === 'player') a = Math.atan2(g.player.y - y, g.player.x - x);
      const sp = this._n(e.speed);
      g.hazards.push(new Shard(e.color, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        this._n(e.radius), teleSec, e.sides));
      g.audio.warn(e.color);

    } else if (e.type === 'bloom') {
      const two = e.color2 >= 0;
      const b = new Bloom(e.color, this._x(e.x), this._y(e.y), e.petals,
        this._n(e.speed), teleSec, two);
      if (two) b.ci2 = e.color2;
      b.offset = (e.spin || 0) * DEG;
      g.hazards.push(b);
      g.audio.warn(e.color);

    } else if (e.type === 'orb') {
      g.placeOrb(this._x(e.x), this._y(e.y), e.color, (e.life || 8) * spb);
    }
  }
}
