// Presentation only: rewards, saves and stage transitions stay in the runner.
import { setModal } from './ui.js';
import { getLang } from './i18n.js';

export function missionClock(stages, scale = 1) {
  const timed = stages.filter(s => s.time != null);
  return timed.length ? timed.map(s => Math.max(1, Math.round(s.time * scale))) : null;
}

export const CINEMA_ART = {
  home: 'assets/cinema/fraser-2004.png',
  alternateur: 'assets/cinema/alternateur.png',
};

export class Cinematic {
  constructor({ clearInput = () => {}, onHold = () => {} } = {}) {
    this.active = false;
    this.clearInput = clearInput;
    this.onHold = onHold;
    this.root = document.createElement('section');
    this.root.id = 'cinematic';
    this.root.className = 'hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'cinema-title');
    this.root.innerHTML = `<div class="cinema-art" aria-hidden="true"></div>
      <div class="cinema-copy"><p class="cinema-eyebrow"></p><h1 id="cinema-title"></h1>
      <p class="cinema-body"></p><div class="cinema-task"></div>
      <footer><button type="button" class="cinema-go"></button><p class="cinema-note"></p></footer></div>`;
    document.body.appendChild(this.root);
    this.button = this.root.querySelector('button');
    this.button.onclick = () => this.finish();
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      // A held key cannot dismiss the next card or leak throttle into driving.
      if (e.code !== 'Tab') e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Tab') { e.preventDefault(); this.button.focus(); }
      if (!e.repeat && ['Enter', 'Space', 'KeyE', 'Escape'].includes(e.code)) this.finish();
    }, true);
  }

  show({ title, body, task = '', note = '', art = 'home', eyebrow, button, onDone = null }) {
    const en = getLang() === 'en';
    this.previousFocus = document.activeElement;
    this.onDone = onDone;
    this.active = true;
    this.clearInput();
    this.onHold();
    const set = (selector, text) => { this.root.querySelector(selector).textContent = text; };
    set('.cinema-eyebrow', eyebrow || (en ? 'AYLMER, QUÉBEC · SUMMER 2004' : 'AYLMER, QUÉBEC · ÉTÉ 2004'));
    set('h1', title);
    set('.cinema-body', body);
    set('.cinema-task', task);
    set('.cinema-note', note || (en ? 'Enter to continue · Esc to skip' : 'Entrée pour continuer · Échap pour passer'));
    set('button', button || (en ? 'Continue →' : 'Continuer →'));
    this.root.dataset.art = art;
    const layer = this.root.querySelector('.cinema-art');
    layer.style.backgroundImage = '';
    const src = CINEMA_ART[art];
    // Missing art leaves a deliberate dark background and usable controls.
    const request = this.request = {};
    if (src) {
      const image = new Image();
      image.onload = () => { if (this.request === request) layer.style.backgroundImage = `url("${src}")`; };
      image.src = src;
    }
    setModal('cinematic', true);
    this.button.focus();
  }

  finish() {
    if (!this.active) return false;
    const done = this.onDone;
    this.hide();
    if (done) done();
    return true;
  }

  hide() {
    this.active = false;
    this.onDone = null;
    this.request = null;
    this.clearInput();
    setModal('cinematic', false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
