// Mission 9 overlays and keys (russellroyal). Everything here is created on
// demand and torn down by destroy(); every call is a no-op without a DOM, so
// the Node smoke tests can run the stages.
//
//   tag(on) / tagText(s)   a small tag under the objective: the marshal gap,
//                          the screech counter
//   keys(on) / space()     our own Espace listener (the handbrake is Space in
//                          core/input.js; the Vehicle does not keep the lever)
//   shake(amp)             the golf-ball sputter: the canvas jitters
//   ski(on) / skiDraw(s,k) the fairway-skiing card: a top-down cart, the rope,
//                          Tom swinging on the end of it, and the carve score
//   destroy()              removes all of it (idempotent)

const hasDom = () => typeof document !== 'undefined' && typeof window !== 'undefined' && !!document.body;

export function createRoyalFx() {
  let tagEl = null, skiEl = null, skiTom = null, skiRope = null, skiScore = null;
  let spaceDown = false, keysOn = false, shakeAmp = 0, shakeRaf = 0;
  const onDown = (e) => { if (e.code === 'Space') spaceDown = true; };
  const onUp = (e) => { if (e.code === 'Space') spaceDown = false; };
  const onBlur = () => { spaceDown = false; };

  function tag(on) {
    if (!hasDom()) return;
    if (on && !tagEl) {
      tagEl = document.createElement('div');
      tagEl.id = 'royal-tag';
      tagEl.style.cssText = 'position:fixed;top:92px;left:50%;transform:translateX(-50%);z-index:40;'
        + 'padding:4px 12px;border-radius:12px;background:rgba(20,40,20,.72);color:#f4f1dc;'
        + 'font:600 14px/1.3 system-ui,sans-serif;pointer-events:none;letter-spacing:.02em';
      document.body.appendChild(tagEl);
    } else if (!on && tagEl) { tagEl.remove(); tagEl = null; }
  }
  function tagText(s) { if (tagEl) tagEl.textContent = s; }

  function keys(on) {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    if (on && !keysOn) {
      window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
      window.addEventListener('blur', onBlur); keysOn = true;
    } else if (!on && keysOn) {
      window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur); keysOn = false; spaceDown = false;
    }
  }
  const space = () => spaceDown;

  function canvas() { return hasDom() ? (document.getElementById('gl') || document.querySelector('canvas')) : null; }
  function shake(amp) {
    shakeAmp = amp;
    const c = canvas();
    if (!c) return;
    if (amp > 0 && !shakeRaf && typeof requestAnimationFrame === 'function') {
      const step = () => {
        if (shakeAmp <= 0) { c.style.transform = ''; shakeRaf = 0; return; }
        const a = shakeAmp * 4;
        c.style.transform = `translate(${(Math.random() - 0.5) * a}px,${(Math.random() - 0.5) * a}px)`;
        shakeRaf = requestAnimationFrame(step);
      };
      shakeRaf = requestAnimationFrame(step);
    } else if (amp <= 0) {
      c.style.transform = '';
    }
  }

  function ski(on) {
    if (!hasDom()) return;
    if (on && !skiEl) {
      skiEl = document.createElement('div');
      skiEl.id = 'royal-ski';
      skiEl.style.cssText = 'position:fixed;left:16px;bottom:120px;z-index:40;width:150px;height:170px;'
        + 'border-radius:12px;background:rgba(40,90,40,.78);color:#f4f1dc;pointer-events:none;'
        + 'font:600 13px/1.2 system-ui,sans-serif;text-align:center;padding-top:4px;box-sizing:border-box';
      skiEl.innerHTML = '<div>SKI DE FAIRWAY</div>'
        + '<svg width="150" height="120" viewBox="-75 -20 150 120">'
        + '<rect x="-9" y="-12" width="18" height="26" rx="4" fill="#f2efe4" stroke="#333" stroke-width="1.5"/>'
        + '<line id="royal-rope" x1="0" y1="14" x2="0" y2="80" stroke="#e8d27a" stroke-width="2"/>'
        + '<g id="royal-tom" transform="translate(0,80)">'
        + '<circle cx="0" cy="-10" r="5" fill="#f4f1dc"/>'
        + '<line x1="0" y1="-5" x2="0" y2="8" stroke="#f4f1dc" stroke-width="2.5"/>'
        + '<line x1="-7" y1="0" x2="7" y2="0" stroke="#f4f1dc" stroke-width="2"/>'
        + '<line x1="0" y1="8" x2="-6" y2="16" stroke="#f4f1dc" stroke-width="2"/>'
        + '<line x1="0" y1="8" x2="6" y2="16" stroke="#f4f1dc" stroke-width="2"/>'
        + '</g></svg><div id="royal-score">0</div>';
      document.body.appendChild(skiEl);
      skiTom = skiEl.querySelector('#royal-tom');
      skiRope = skiEl.querySelector('#royal-rope');
      skiScore = skiEl.querySelector('#royal-score');
    } else if (!on && skiEl) { skiEl.remove(); skiEl = skiTom = skiRope = skiScore = null; }
  }
  function skiDraw(s, k) {
    if (!skiEl || !s) return;
    // Screen x is the swing (positive = cart's left = screen left), 11 px per m.
    const x = -s.swing * 11;
    const y = 14 + Math.sqrt(Math.max(0, k.rope * k.rope - s.swing * s.swing)) * 12;
    if (skiTom) skiTom.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${s.down > 0 ? 90 : (-s.swing * 8).toFixed(0)})`);
    if (skiRope) { skiRope.setAttribute('x2', x.toFixed(1)); skiRope.setAttribute('y2', (y - 10).toFixed(1)); }
    if (skiScore) skiScore.textContent = s.down > 0 ? 'OUCH' : `${Math.floor(s.score)} / ${k.skiNeed}`;
  }

  function destroy() {
    tag(false); ski(false); keys(false); shake(0);
    if (shakeRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(shakeRaf);
    shakeRaf = 0;
  }

  return { tag, tagText, keys, space, shake, ski, skiDraw, destroy, get alive() { return !!(tagEl || skiEl || keysOn); } };
}
