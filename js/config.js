'use strict';
/* ============================================================================
   PRISM — config.js

   Feature switches, persisted per browser. Everything here defaults to the
   shipping game; turning a switch off never deletes data, it only stops that
   feature running. So a level keeps its rainbow pickups in the file even with
   `stars` off — flip it back and they return.

   Press ` (backtick) in game to open the panel, or use the console:
       DEV.set('stars', false)
       DEV.reset()
   ========================================================================== */

const CONFIG_DEFAULTS = {
  /* the rainbow pickups and the three-star mastery they feed */
  stars: true,
  /* the dash, in case the simplest version of the game has no verbs but move */
  dash: true,
  /* --- the rest are for building levels, not for playing --- */
  invincible: false,      // walk a chart without dying
  noHazards: false,       // see the orb route with nothing thrown at you
  slowmo: false,          // half speed, to read a pattern
};

const CONFIG_META = [
  { key: 'stars', label: 'Rainbow pickups', hint: 'three-star mastery', group: 'game' },
  { key: 'dash', label: 'Dash', hint: 'phase through anything', group: 'game' },
  { key: 'invincible', label: 'Invincible', hint: 'nothing can kill you', group: 'dev' },
  { key: 'noHazards', label: 'No hazards', hint: 'orbs only', group: 'dev' },
  { key: 'slowmo', label: 'Half speed', hint: 'read a pattern', group: 'dev' },
];

const CONFIG = Object.assign({}, CONFIG_DEFAULTS, storageGet('prism.config', {}));

const DEV = {
  get(k) { return CONFIG[k]; },
  set(k, v) {
    if (!(k in CONFIG_DEFAULTS)) { console.warn('no such setting:', k); return; }
    CONFIG[k] = !!v;
    storageSet('prism.config', CONFIG);
    if (DEV.onChange) DEV.onChange(k, CONFIG[k]);
    return CONFIG[k];
  },
  toggle(k) { return DEV.set(k, !CONFIG[k]); },
  reset() {
    Object.assign(CONFIG, CONFIG_DEFAULTS);
    storageSet('prism.config', CONFIG);
    if (DEV.onChange) DEV.onChange(null, null);
  },
  /* true when anything is off-spec, so the game can show a quiet marker */
  get modified() {
    return Object.keys(CONFIG_DEFAULTS).some(k => CONFIG[k] !== CONFIG_DEFAULTS[k]);
  },
  onChange: null,
};
