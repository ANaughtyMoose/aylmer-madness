// core/input.js with a fake window and a fake gamepad: the legend key on a
// Québec keyboard, pad button edges, menu keys left to the browser, and the
// half-pressed trigger on a non-standard pad (UX review P4, P5, P6, P12).
//
//   node tools/smoke_input.mjs
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  — ' + extra : '')); }
};

const listeners = {};
globalThis.window = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
let pads = [];
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
const { Input, PAD_EDGES } = await import('../src/core/input.js');

const key = (type, code, key = '', mods = {}) => {
  let prevented = false;
  const e = { type, code, key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    target: { tagName: 'BODY' }, preventDefault() { prevented = true; }, ...mods };
  for (const f of listeners[type] || []) f(e);
  return prevented;
};

console.log('the legend key is whatever types « ? »');
{
  for (const k of Object.keys(listeners)) delete listeners[k];
  const inp = new Input();
  key('keydown', 'Digit6', '?', { shiftKey: true });        // Canadian French / CSA: Shift+6
  ok(inp.hit('Legend'), 'CSA Shift+6 (« ? ») toggles the legend');
  inp.endFrame();
  key('keydown', 'Slash', 'é');                                // CSA: the US slash position types é
  ok(!inp.hit('Legend'), 'the « é » key on a CSA keyboard does not');
  inp.endFrame();
  key('keydown', 'Slash', '/');                                // US layout, unshifted
  ok(inp.hit('Legend'), 'US « / » still does');
  inp.endFrame();
  key('keydown', 'Minus', '?', { ctrlKey: true, altKey: true }); // AltGr layouts
  ok(inp.hit('Legend'), '« ? » typed through AltGr (Ctrl+Alt) does too');
}

console.log('menus keep Tab, the arrows and Space');
{
  for (const k of Object.keys(listeners)) delete listeners[k];
  const inp = new Input();
  let mode = 'drive';
  inp.captureNav = () => mode === 'drive';
  ok(key('keydown', 'Tab', 'Tab') === true, 'driving: Tab is the game’s (map), default prevented');
  mode = 'menu';
  ok(key('keydown', 'Tab', 'Tab') === false, 'in a menu Tab moves focus');
  ok(key('keydown', 'Space', ' ') === false, 'in a menu Space presses the focused button');
  ok(key('keydown', 'ArrowDown', 'ArrowDown') === false, 'in a menu the arrows scroll');
}

console.log('pad buttons arrive as presses, once per press');
{
  for (const k of Object.keys(listeners)) delete listeners[k];
  const inp = new Input();
  const btn = (n, on) => ({ pressed: on, value: on ? 1 : 0 });
  const pad = (down = []) => ({ connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => btn(i, down.includes(i))) });
  ok(inp.pollPad() === null, 'no pad: nothing');
  pads = [pad([9])];
  inp.pollPad();
  ok(inp.hit('PadStart'), 'Start pressed: PadStart');
  ok(!inp.hit('Escape'), '...under its own name, not the keyboard’s');
  inp.endFrame(); inp.pollPad();
  ok(!inp.hit('PadStart'), 'held Start does not repeat');
  pads = [pad([])]; inp.pollPad(); inp.endFrame();
  pads = [pad([0, 3])]; inp.pollPad();
  ok(inp.hit('PadA') && inp.hit('PadY'), 'A and Y on the same frame both land');
  ok(PAD_EDGES.some(([i, n]) => i === 8 && n === 'PadBack'), 'Back is mapped (map)');
}

console.log('a half-pressed trigger on a non-standard pad');
{
  for (const k of Object.keys(listeners)) delete listeners[k];
  const inp = new Input();
  pads = [{ connected: true, mapping: '', axes: [0, 0, -1, 0], buttons: [{ pressed: false, value: 0 }] }];
  inp.update(1 / 60);
  ok(Math.abs(inp.throttle - 0.5) < 1e-9, 'axes[3] at exactly 0 is half throttle, not released', String(inp.throttle));
  pads = [];
}

console.log('Shift used in a chord is not a look-back tap (J3)');
{
  for (const k of Object.keys(listeners)) delete listeners[k];
  const inp = new Input();
  key('keydown', 'ShiftLeft', 'Shift', { shiftKey: true });
  key('keydown', 'KeyW', 'W', { shiftKey: true });
  key('keyup', 'ShiftLeft', 'Shift');
  ok(!inp.hit('LookBackToggle'), 'Shift+W released: no rear-view latch');
  inp.endFrame();
  key('keydown', 'ShiftLeft', 'Shift', { shiftKey: true });
  key('keyup', 'ShiftLeft', 'Shift');
  ok(inp.hit('LookBackToggle'), 'a clean Shift tap still latches');
}

console.log('main.js wiring (text: main.js cannot be imported in node)');
{
  const fs = await import('node:fs');
  const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // P1/P2 live in economy.js now (one mechanism, integration 29 Sept): every
  // shop close goes through releaseSim(), which consumes Escape; the unlock
  // card consumes its key and drops it from the held set.
  const ECON = fs.readFileSync(new URL('../src/game/economy.js', import.meta.url), 'utf8');
  const release = ECON.slice(ECON.indexOf('function releaseSim'), ECON.indexOf('function openShop'));
  ok(/G\.input\.consume\('Escape'/.test(release)
    && /function closeShop\(\)[\s\S]{0,160}releaseSim\(\)/.test(ECON)
    && /function closeVolkov\(\)[\s\S]{0,160}releaseSim\(\)/.test(ECON)
    && /onClose: \(\) => releaseSim\(\)/.test(ECON), 'Escape that closes a shop screen is consumed (P1)');
  ok(/momentVisible\(\) && \['Space', 'KeyE', 'Enter', 'Escape'\][\s\S]{0,400}G\.input\.consume\(e\.code\)[\s\S]{0,120}G\.input\.keys\.delete\(e\.code\)/.test(ECON),
    'the unlock card owns its keys, held Space included (P2)');
  ok(!/econScreenOpen|econMomentOpen/.test(MAIN), 'and main.js has no second copy of it');
  ok(/saveSettings\(\{ \.\.\.G\.settings, cam: G\.cam \}\)/.test(MAIN), 'C saves the camera (P9)');
  ok(/input\.captureNav = /.test(MAIN), 'main.js tells Input when the game owns Tab/arrows/Space (P4)');
  ok(/input\.pollPad\(\)/.test(MAIN) && /hit\('Escape', 'PadStart'\)/.test(MAIN), 'the pad is polled every frame and Start pauses (P5)');
  ok(/input\.hit\('Legend'\)/.test(MAIN) && !/hit\('Slash'/.test(MAIN), 'the legend reads the layout-proof Legend press (P6)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
