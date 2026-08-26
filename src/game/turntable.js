// The menu car cards, showing the real lofted model instead of a paint swatch.
// Same idea as garage.html, but one WebGL context total: each card is a small
// 2D canvas and we render the car once into an off-screen GL canvas and blit.
// Only runs while the menu is on screen.

import { Renderer } from '../core/gl.js';
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4 } from '../core/math.js';
import { CARS, buildCarBody, buildWheel } from './cars.js';

const GL_W = 300, GL_H = 200;       // off-screen render size, in CSS px
const FPS = 24;                     // the menu is static; this is plenty
const STEER_SWING = 0.30;           // radians the front wheels sweep through

const ENV = {
  sky: [0.42, 0.50, 0.62], ground: [0.20, 0.22, 0.24], sun: [0.95, 0.90, 0.82],
  lightDir: [0.42, 0.80, 0.43], fog: [0.086, 0.113, 0.141], fogDensity: 0.004,
};

export class CarTurntable {
  constructor() {
    this.ok = false;
    this.cards = [];        // [{ id, ctx, w, h }]
    this.running = false;
    if (typeof document === 'undefined' || !document.createElement) return;
    try {
      const cv = document.createElement('canvas');
      cv.width = GL_W; cv.height = GL_H;
      cv.style.cssText = `position:fixed;left:-4000px;top:0;width:${GL_W}px;height:${GL_H}px;pointer-events:none`;
      document.body.appendChild(cv);
      this.glCanvas = cv;
      this.r = new Renderer(cv);
      this.r.maxDpr = 1;
      this.r.scale = 1;
      this.r.setEnvironment(ENV);
      this.bodies = {}; this.wheels = {};
      for (const c of CARS) {
        this.bodies[c.id] = this.r.upload(buildCarBody(c));
        this.wheels[c.id] = this.r.upload(buildWheel(c));
      }
      const floor = new MeshBuilder();
      floor.flat(-14, -14, 14, 14, 0, rgb(0x1c242c));
      this.floor = this.r.upload(floor);
      this.mm = m4.create();
      this.ok = true;
    } catch (e) {
      // No WebGL2 in this browser: the cards keep their paint swatch.
      console.warn('turntable off:', e && e.message);
      this.ok = false;
    }
  }

  // cards: [{ id, canvas }] — one small 2D canvas per menu card.
  setCards(cards) {
    this.cards = [];
    if (!this.ok) return false;
    for (const c of cards) {
      const ctx = c.canvas && c.canvas.getContext ? c.canvas.getContext('2d') : null;
      if (!ctx) continue;
      this.cards.push({ id: c.id, ctx, canvas: c.canvas });
    }
    return this.cards.length > 0;
  }

  start() {
    if (!this.ok || this.running) return;
    this.running = true;
    this.t0 = now();
    this.lastFrame = 0;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const t = now();
      if (t - this.lastFrame < 1000 / FPS) return;
      this.lastFrame = t;
      this.frame(t - this.t0);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  frame(ms) {
    const r = this.r, mm = this.mm;
    const spin = ms * 0.00035;
    // Front wheels sweep, so the steering knuckles are visibly doing something.
    const steer = Math.sin(ms * 0.0007) * STEER_SWING;
    for (const card of this.cards) {
      const spec = CARS.find((c) => c.id === card.id);
      if (!spec) continue;
      const dist = spec.len * 1.62;
      const pitch = -0.30;
      const cp = [Math.sin(spin) * dist * Math.cos(pitch), 1.15 - Math.sin(pitch) * dist,
        Math.cos(spin) * dist * Math.cos(pitch)];
      r.begin(cp, spin, pitch, 0.85);
      m4.identity(mm);
      r.draw(this.floor, mm);
      m4.compose(mm, 0, 0, 0, 0, 0, 0);
      r.draw(this.bodies[spec.id], mm);
      const wr = spec.wheelR;
      for (const sz of [1, -1]) for (const sx of [-1, 1]) {
        m4.compose(mm, sx * spec.track / 2, wr, sz * spec.axleZ,
          sz > 0 ? -steer : 0, ms * 0.0015, 0);
        r.draw(this.wheels[spec.id], mm);
      }
      r.end();
      // Same task as the draw, so the drawing buffer is still intact.
      const g = card.ctx, cv = card.canvas;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(this.glCanvas, 0, 0, cv.width, cv.height);
    }
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
