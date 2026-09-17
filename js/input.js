'use strict';
/* ============================================================================
   PRISM — input.js   keyboard + mouse + gamepad, hot-swappable
   ========================================================================== */

class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.moveX = 0; this.moveY = 0;
    this.colorIndex = null;      // absolute pick this frame, or null
    this.colorStep = 0;          // -1 / +1 cycle this frame
    this.stickAngle = null;      // raw right-stick angle when pushed
    this.stickMag = 0;
    this.device = 'keyboard';
    this.padIndex = null;
    this.padConnected = false;
    this._prevPad = [];
    this._firstInput = false;
    this.onFirstInput = null;
    this._bind();
  }

  _bind() {
    const stop = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'Enter',
      'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);
    const typing = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
        t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    window.addEventListener('keydown', e => {
      /* the editor has real form fields — typing in them must not be
         swallowed by the game's key handling */
      if (typing(e)) return;
      if (stop.has(e.code)) e.preventDefault();
      if (e.repeat) { this._touch('keyboard'); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      this._touch('keyboard');
    }, { passive: false });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('wheel', e => {
      this._wheel = (this._wheel || 0) + sign(e.deltaY);
      this._touch('keyboard');
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('gamepadconnected', e => { this.padIndex = e.gamepad.index; this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = false; this.padIndex = null; this.device = 'keyboard'; });
  }

  _touch(d) {
    this.device = d;
    if (!this._firstInput) { this._firstInput = true; if (this.onFirstInput) this.onFirstInput(); }
  }

  down(...c) { for (const k of c) if (this.keys.has(k)) return true; return false; }
  hit(...c) { for (const k of c) if (this.pressed.has(k)) return true; return false; }

  _pad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { this.padIndex = i; return pads[i]; }
    return null;
  }
  static dz(v, d = 0.22) { const a = Math.abs(v); return a < d ? 0 : sign(v) * (a - d) / (1 - d); }

  update() {
    /* ---- keyboard ---- */
    let kx = 0, ky = 0;
    if (this.down('KeyA', 'ArrowLeft')) kx -= 1;
    if (this.down('KeyD', 'ArrowRight')) kx += 1;
    if (this.down('KeyW', 'ArrowUp')) ky -= 1;
    if (this.down('KeyS', 'ArrowDown')) ky += 1;

    this.colorIndex = null;
    this.colorStep = 0;
    for (let i = 0; i < 6; i++) if (this.hit('Digit' + (i + 1))) this.colorIndex = i;
    if (this.hit('KeyQ')) this.colorStep = -1;
    if (this.hit('KeyE')) this.colorStep = 1;
    if (this._wheel) { this.colorStep = this._wheel > 0 ? 1 : -1; this._wheel = 0; }

    /* ---- gamepad ---- */
    this.padButtons = []; this.padPressed = [];
    let gx = 0, gy = 0;
    this.stickAngle = null; this.stickMag = 0;
    const pad = this._pad();
    this.padConnected = !!pad;
    if (pad) {
      const ax = pad.axes;
      gx = InputManager.dz(ax[0] || 0);
      gy = InputManager.dz(ax[1] || 0);
      const rx = InputManager.dz(ax[2] || 0, 0.3);
      const ry = InputManager.dz(ax[3] || 0, 0.3);
      const m = len(rx, ry);
      if (m > 0.35) { this.stickAngle = Math.atan2(ry, rx); this.stickMag = clamp01((m - 0.35) / 0.5); }
      for (let i = 0; i < pad.buttons.length; i++) {
        const p = pad.buttons[i].pressed;
        this.padButtons[i] = p;
        this.padPressed[i] = p && !this._prevPad[i];
      }
      this._prevPad = this.padButtons.slice();
      if (Math.abs(gx) > 0.02 || Math.abs(gy) > 0.02 || this.stickAngle !== null || this.padPressed.some(Boolean)) {
        this._touch('gamepad');
      }
      /* d-pad also cycles colour */
      if (this.padPressed[14]) this.colorStep = -1;
      if (this.padPressed[15]) this.colorStep = 1;
    } else this._prevPad = [];

    if (this.device === 'gamepad' && pad) {
      this.moveX = gx; this.moveY = gy;
      const l = len(this.moveX, this.moveY);
      if (l > 1) { this.moveX /= l; this.moveY /= l; }
    } else {
      const l = len(kx, ky);
      this.moveX = l > 0 ? kx / l : 0;
      this.moveY = l > 0 ? ky / l : 0;
    }
  }

  endFrame() { this.pressed.clear(); }

  padHit(...idx) { if (!this.padPressed) return false; for (const i of idx) if (this.padPressed[i]) return true; return false; }
  get dashPressed() { return this.hit('Space', 'ShiftLeft', 'ShiftRight') || this.padHit(0, 5, 7); }
  get confirmPressed() { return this.hit('Enter', 'Space') || this.padHit(0, 9); }

  rumble(duration = 140, weak = 0.4, strong = 0.5) {
    const pad = this._pad();
    if (!pad) return false;
    try {
      if (pad.vibrationActuator && pad.vibrationActuator.playEffect) {
        pad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0, duration: clamp(duration, 10, 3000),
          weakMagnitude: clamp01(weak), strongMagnitude: clamp01(strong),
        }).catch(() => { });
        return true;
      }
      if (pad.hapticActuators && pad.hapticActuators[0] && pad.hapticActuators[0].pulse) {
        pad.hapticActuators[0].pulse(clamp01(strong), clamp(duration, 10, 3000));
        return true;
      }
    } catch (e) { }
    return false;
  }
}
