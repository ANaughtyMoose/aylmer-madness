// « La nuit du Tim »: the screen effects, and nothing else.
//
// Everything here is DOM that this mission creates and this mission removes:
//   clock   the watch clock (23 h 40 ... 3 h 10), a small card top-centre
//   black   the hard cut: a full-screen black div, on in one frame, no fade
//   daze    double vision on the game canvas plus a dark vignette
//   tag     « Le gars: 40 m derrière », the stranger who keeps following
//
// Double vision on a WebGL canvas: the renderer does not ask for
// preserveDrawingBuffer (src/core/gl.js), so copying the canvas into a 2D
// overlay with drawImage every frame is unreliable. Instead the canvas gets a
// CSS `filter: url(#nuittim-dv)`, an inline SVG filter that blurs the frame,
// shifts a copy sideways and lays it back on top at half opacity: a ghost of
// the same frame, offset, which is what seeing double looks like. `daze()`
// moves the offset every tick so the ghost swims. If the SVG filter cannot be
// built (or FX.mode is 'css') it falls back to a plain CSS blur plus a slow
// sway of the canvas, which is cheaper and still reads as "not right".
//
// Every function is a no-op without a document, so the node suites can drive
// the mission through all of this.
//
// teardown() restores the canvas's own filter/transform exactly as it found
// them and removes every node it made. The mission calls it from each stage's
// onExit where the effect ends, and from the mission's cleanup(), which runs on
// success, failure and Backspace alike.

export const FX = {
  mode: 'svg',          // 'svg' (ghosted double vision) or 'css' (blur + sway)
  maxBlurPx: 2.2,       // blur at full daze
  maxGhostPx: 16,       // how far the ghost copy sits from the real frame
  ghostAlpha: 0.5,      // opacity of the ghost copy
  vignette: 0.75,       // darkness of the vignette corners at full daze
  z: 9000,              // above the HUD; the black cut goes higher still
};

const hasDoc = () => typeof document !== 'undefined' && !!document.body;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createNuitFx() {
  const S = {
    nodes: {},          // id -> element we created
    canvas: null, savedFilter: null, savedTransform: null, dazeOn: false,
    ghost: null, blur: null,
  };
  const el = (id, css) => {
    if (!hasDoc()) return null;
    if (S.nodes[id]) return S.nodes[id];
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = css;
    document.body.appendChild(d);
    S.nodes[id] = d;
    return d;
  };
  const drop = (id) => {
    const d = S.nodes[id];
    if (d && d.parentNode) d.parentNode.removeChild(d);
    delete S.nodes[id];
  };

  function clock(text) {
    if (text == null) { drop('nuittim-clock'); return; }
    const d = el('nuittim-clock', `position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:${FX.z};`
      + 'pointer-events:none;padding:10px 22px;border-radius:10px;background:rgba(6,10,20,.78);'
      + 'color:#ffd98a;font:600 34px/1.1 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-align:center;'
      + 'box-shadow:0 4px 24px rgba(0,0,0,.5)');
    if (d) d.textContent = text;
  }

  function black(on) {
    if (!on) { drop('nuittim-black'); return; }
    // Opacity 1 from the first frame: a cut, not a fade.
    el('nuittim-black', `position:fixed;inset:0;background:#000;z-index:${FX.z + 50};pointer-events:none;opacity:1`);
  }

  function tag(text) {
    if (text == null) { drop('nuittim-tag'); return; }
    const d = el('nuittim-tag', `position:fixed;right:18px;top:40%;z-index:${FX.z + 1};pointer-events:none;`
      + 'padding:6px 12px;border-radius:8px;background:rgba(40,0,0,.65);color:#f3c7c7;'
      + 'font:600 15px/1.2 system-ui,sans-serif');
    if (d) d.textContent = text;
  }

  function buildSvg() {
    if (S.nodes['nuittim-svg']) return true;
    try {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      svg.innerHTML = '<filter id="nuittim-dv" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">'
        + '<feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b"/>'
        + '<feOffset in="b" dx="8" dy="0" result="o"/>'
        + `<feComponentTransfer in="o" result="g"><feFuncA type="linear" slope="${FX.ghostAlpha}"/></feComponentTransfer>`
        + '<feMerge><feMergeNode in="b"/><feMergeNode in="g"/></feMerge></filter>';
      document.body.appendChild(svg);
      S.nodes['nuittim-svg'] = svg;
      S.ghost = svg.querySelector('feOffset');
      S.blur = svg.querySelector('feGaussianBlur');
      return !!(S.ghost && S.blur);
    } catch (e) { return false; }
  }

  // level 0..1, t seconds (for the swim). level 0 switches the effect off.
  function daze(level, t = 0) {
    if (!hasDoc()) return;
    if (!(level > 0)) { undaze(); return; }
    if (!S.canvas) {
      S.canvas = document.getElementById('gl') || document.querySelector('canvas');
      if (!S.canvas) return;
      S.savedFilter = S.canvas.style.filter;
      S.savedTransform = S.canvas.style.transform;
    }
    S.dazeOn = true;
    const blur = FX.maxBlurPx * level;
    const swim = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4;
    const dx = FX.maxGhostPx * level * (0.55 + 0.45 * swim);
    const dy = FX.maxGhostPx * level * 0.25 * Math.sin(t * 1.3);
    if (FX.mode === 'svg' && buildSvg()) {
      S.blur.setAttribute('stdDeviation', blur.toFixed(2));
      S.ghost.setAttribute('dx', dx.toFixed(1));
      S.ghost.setAttribute('dy', dy.toFixed(1));
      S.canvas.style.filter = 'url(#nuittim-dv)';
      S.canvas.style.transform = S.savedTransform || '';
    } else {
      S.canvas.style.filter = `blur(${blur.toFixed(2)}px)`;
      S.canvas.style.transform = `scale(1.03) rotate(${(0.8 * level * swim).toFixed(2)}deg) translateX(${(dx * 0.3).toFixed(1)}px)`;
    }
    const v = el('nuittim-vig', `position:fixed;inset:0;z-index:${FX.z - 1};pointer-events:none;`
      + 'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,1) 100%)');
    if (v) v.style.opacity = (FX.vignette * level * (0.85 + 0.15 * Math.sin(t * 1.7))).toFixed(3);
  }

  function undaze() {
    if (S.canvas) {
      S.canvas.style.filter = S.savedFilter || '';
      S.canvas.style.transform = S.savedTransform || '';
    }
    S.canvas = null; S.dazeOn = false;
    drop('nuittim-vig');
    drop('nuittim-svg');
    S.ghost = S.blur = null;
  }

  function teardown() {
    undaze();
    for (const id of Object.keys(S.nodes)) drop(id);
  }

  return { clock, black, tag, daze, undaze, teardown, get live() { return Object.keys(S.nodes).length + (S.dazeOn ? 1 : 0); } };
}
