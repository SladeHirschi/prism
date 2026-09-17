'use strict';
/* ============================================================================
   PRISM — level.js   (format v2, step based)

   A level is a straight sequence of STEPS, played start to end. Each step is
   one orb plus the hazards that arrive while you go and get it. Collect the
   orb and the next step begins. Clear every step and the level is done.

   There is no tempo and no beat grid: delays are plain seconds measured from
   the moment a step starts. The music is a backdrop, nothing is synced to it.

   PORTABILITY — this is engine-agnostic on purpose, because the real build is
   going to Godot. Nothing here names a class, a pixel or a frame:
     · time is SECONDS
     · positions are NORMALISED 0..1 of the arena
     · sizes and speeds are fractions of arena WIDTH (per second for speeds)
     · colours are indices into a palette carried in the file
     · angles are degrees, clockwise, 0 = +X
   ========================================================================== */

const LEVEL_FORMAT = 'prism.level';
const LEVEL_VERSION = 2;
const CANON = { w: 1280, h: 800 };

/* ---------------------------------------------------------------- tracks --
   Music is a backdrop only. Adding a song is a data change: drop the file in
   audio/ and add a row. */
const TRACKS = {
  'trailer_2': {
    id: 'trailer_2', title: 'Trailer Draft 2',
    src: 'audio/trailer_song_2_draft.mp3',
    /* levels ignore these — only the procedural arcade mode spawns on a beat */
    bpm: 130.0, offset: 0.4267,
  },
};
function getTrack(id) { return TRACKS[id] || TRACKS['trailer_2']; }

/* ------------------------------------------------------------ hazard spec --
   The editor's inspector, the validator and the docs all read this table.
   `drag` says what a drag in the arena controls when you place one. */
const HAZ_SPEC = {
  wave: {
    label: 'Wave', drag: 'direction',
    speedRange: [0.08, 0.7],
    fields: {
      color: { def: 0, type: 'color' },
      angle: { def: 0, type: 'angle', min: 0, max: 360 },
      speed: { def: 0.26, type: 'norm', min: 0.06, max: 0.8 },
      thickness: { def: 0.11, type: 'norm', min: 0.03, max: 0.4 },
      delay: { def: 0, type: 'sec', min: 0, max: 20 },
      warn: { def: 1.1, type: 'sec', min: 0.2, max: 6 },
    },
  },
  shard: {
    label: 'Shard', drag: 'from-point',
    speedRange: [0.12, 1.1],
    fields: {
      color: { def: 0, type: 'color' },
      x: { def: 0.5, type: 'unit' },
      y: { def: -0.06, type: 'unit' },
      angle: { def: 90, type: 'angle', min: 0, max: 360 },
      speed: { def: 0.36, type: 'norm', min: 0.08, max: 1.2 },
      radius: { def: 0.012, type: 'norm', min: 0.004, max: 0.05 },
      sides: { def: 3, type: 'int', min: 3, max: 6 },
      aim: { def: 'fixed', type: 'enum', values: ['fixed', 'player'] },
      delay: { def: 0, type: 'sec', min: 0, max: 20 },
      warn: { def: 0.8, type: 'sec', min: 0.2, max: 6 },
    },
  },
  bloom: {
    label: 'Bloom', drag: 'from-point',
    speedRange: [0.1, 0.6],
    fields: {
      color: { def: 0, type: 'color' },
      color2: { def: -1, type: 'color2' },
      x: { def: 0.5, type: 'unit' },
      y: { def: 0.5, type: 'unit' },
      speed: { def: 0.26, type: 'norm', min: 0.08, max: 0.7 },
      petals: { def: 9, type: 'int', min: 3, max: 18 },
      spin: { def: 0, type: 'angle', min: 0, max: 360 },
      delay: { def: 0, type: 'sec', min: 0, max: 20 },
      warn: { def: 1.1, type: 'sec', min: 0.2, max: 6 },
    },
  },
};

/* The rainbow pickup. It accepts ANY colour — that is the whole point of it,
   and why it is drawn as every colour at once. Three per level, optional,
   short-lived, and deliberately placed away from the orb so that taking one
   is a real decision against the orb's own timer. */
const STAR_SPEC = {
  fields: {
    x: { def: 0.5, type: 'unit' },
    y: { def: 0.5, type: 'unit' },
    life: { def: 3.2, type: 'sec', min: 1.2, max: 10 },
    delay: { def: 0.4, type: 'sec', min: 0, max: 12 },
  },
};

const ORB_SPEC = {
  fields: {
    color: { def: 0, type: 'color' },
    x: { def: 0.5, type: 'unit' },
    y: { def: 0.5, type: 'unit' },
    life: { def: 6, type: 'sec', min: 1.5, max: 30 },
  },
};

/* -------------------------------------------------------------- defaults -- */
function blankStep() {
  return {
    orb: { color: 0, x: 0.5, y: 0.5, life: 6 },
    hazards: [],
    star: null,
  };
}
function blankLevel(id, name) {
  return {
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: id || 'untitled', name: name || 'UNTITLED', author: '',
    difficulty: 1, track: 'trailer_2',
    arena: { w: CANON.w, h: CANON.h },
    palette: HUES.map(h => h.name),
    steps: [blankStep()],
  };
}

function fillFields(spec, raw) {
  const out = {};
  for (const k in spec.fields) out[k] = raw && raw[k] !== undefined ? raw[k] : spec.fields[k].def;
  return out;
}

function normaliseLevel(raw) {
  const L = Object.assign(blankLevel(), raw || {});
  L.arena = Object.assign({ w: CANON.w, h: CANON.h }, raw && raw.arena);
  L.palette = (raw && raw.palette) || HUES.map(h => h.name);
  const steps = (raw && raw.steps) || [];
  L.steps = steps.map(st => ({
    orb: fillFields(ORB_SPEC, st && st.orb),
    hazards: ((st && st.hazards) || []).map(h => {
      const spec = HAZ_SPEC[h.type];
      if (!spec) return null;
      const o = fillFields(spec, h);
      o.type = h.type;
      return o;
    }).filter(Boolean).sort((a, b) => a.delay - b.delay),
    star: (st && st.star) ? fillFields(STAR_SPEC, st.star) : null,
  }));
  if (!L.steps.length) L.steps = [blankStep()];
  return L;
}

function validateLevel(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not an object'] };
  if (raw.format !== LEVEL_FORMAT) errs.push('format must be "' + LEVEL_FORMAT + '"');
  if (+raw.version > LEVEL_VERSION) errs.push('made by a newer version (' + raw.version + ')');
  if (!Array.isArray(raw.steps)) errs.push('steps must be an array');
  else raw.steps.forEach((st, i) => {
    if (!st || typeof st !== 'object') { errs.push('step ' + (i + 1) + ': not an object'); return; }
    (st.hazards || []).forEach((h, j) => {
      if (!HAZ_SPEC[h.type]) errs.push('step ' + (i + 1) + ' hazard ' + (j + 1) + ': unknown type "' + h.type + '"');
    });
  });
  return { ok: errs.length === 0, errors: errs };
}

/* ---------------------------------------------------------------- store -- */
const LevelStore = {
  KEY_LEVELS: 'prism.levels2',
  KEY_PROGRESS: 'prism.progress2',

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
    const p = this.progress()[id] || {};
    return {
      best: p.best || 0, cleared: !!p.cleared, attempts: p.attempts || 0,
      stars: Array.isArray(p.stars) ? p.stars : [false, false, false],
    };
  },
  /* Stars only stick if you finish the level — grabbing one and then dying
     does not count, which is what makes three stars mean "mastered". */
  record(id, percent, cleared, starsThisRun) {
    const all = this.progress();
    const cur = this.progressFor(id);
    cur.best = Math.max(cur.best, Math.round(percent));
    cur.cleared = cur.cleared || !!cleared;
    cur.attempts = cur.attempts + 1;
    if (cleared && Array.isArray(starsThisRun)) {
      cur.stars = cur.stars.map((had, i) => had || !!starsThisRun[i]);
    }
    all[id] = cur;
    storageSet(this.KEY_PROGRESS, all);
    return cur;
  },
  starCount(id) { return this.progressFor(id).stars.filter(Boolean).length; },

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
   Plays the steps in order. A step's hazards are scheduled from the moment
   the step begins; collecting its orb moves straight on to the next. */
class LevelRunner {
  constructor(level, game) {
    this.level = normaliseLevel(level);
    this.g = game;
    this.reset();
  }

  get steps() { return this.level.steps; }
  get total() { return this.level.steps.length; }
  get percent() { return clamp01(this.done / Math.max(1, this.total)) * 100; }

  reset() {
    this.index = -1;
    this.done = 0;
    this.t = 0;            // never resets — the queue works in absolute time
    this.queue = [];
    this.finished = false;
  }

  /* world helpers */
  _x(v) { return this.g.arena.x + v * this.g.arena.w; }
  _y(v) { return this.g.arena.y + v * this.g.arena.h; }
  _n(v) { return v * this.g.arena.w; }

  begin() { this.nextStep(); }

  nextStep() {
    this.index++;
    if (this.index >= this.total) { this.finished = true; return; }
    const st = this.steps[this.index];
    /* Queue this step's hazards in absolute time. They are NOT cancelled if
       the player takes the orb early — a fast player still meets everything
       the level was built with, it just arrives while they are on the next
       orb. Otherwise playing well would quietly delete the level. */
    for (const h of st.hazards) this.queue.push({ at: this.t + h.delay, h });
    if (st.star) {
      this.queue.push({
        at: this.t + (st.star.delay || 0),
        star: { x: this._x(st.star.x), y: this._y(st.star.y), life: st.star.life, index: this.starIndexOf(this.index) },
      });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.g.placeOrb(this._x(st.orb.x), this._y(st.orb.y), st.orb.color, st.orb.life);
  }

  /* called by the game when the current orb is taken */
  orbCollected() {
    this.done++;
    if (this.done >= this.total) { this.finished = true; return true; }
    this.nextStep();
    return false;
  }

  /* which of the three a step's star is, counting from the top of the level */
  starIndexOf(stepIndex) {
    let n = 0;
    for (let i = 0; i < stepIndex; i++) if (this.steps[i].star) n++;
    return n;
  }
  get starTotal() { return this.steps.filter(st => st.star).length; }

  update(dt) {
    if (this.index < 0) return;
    this.t += dt;
    while (this.queue.length && this.queue[0].at <= this.t) {
      const q = this.queue.shift();
      if (q.star) this.g.placeStar(q.star.x, q.star.y, q.star.life, q.star.index);
      else this.spawn(q.h);
    }
  }

  spawn(h) {
    const g = this.g;
    const warn = Math.max(0.12, h.warn || 0.8);
    if (h.type === 'wave') {
      g.hazards.push(new Wave(h.color, h.angle * DEG, this._n(h.thickness), this._n(h.speed), warn));
    } else if (h.type === 'shard') {
      const x = this._x(h.x), y = this._y(h.y);
      let a = h.angle * DEG;
      if (h.aim === 'player') a = Math.atan2(g.player.y - y, g.player.x - x);
      const sp = this._n(h.speed);
      g.hazards.push(new Shard(h.color, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        this._n(h.radius), warn, h.sides));
    } else if (h.type === 'bloom') {
      const two = h.color2 >= 0;
      const b = new Bloom(h.color, this._x(h.x), this._y(h.y), h.petals, this._n(h.speed), warn, two);
      if (two) b.ci2 = h.color2;
      b.offset = (h.spin || 0) * DEG;
      g.hazards.push(b);
    }
    g.audio.warn(h.color);
  }
}
