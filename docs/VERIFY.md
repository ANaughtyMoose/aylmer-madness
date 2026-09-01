# How to know it actually worked

Companion to `docs/PLAN.md`. Every rule below exists because it failed in a real
session and cost real time. Follow it even when it feels excessive.

---

## The four ways this project lies to you

### 1. Green tests, broken game

**No smoke suite imports `src/main.js`.** All 26 passed while the merged tree
carried an unresolved conflict marker and the game did not load at all.

> **Rule: any change touching `main.js`, `index.html` or `style.css` is not done
> until it has booted in a real browser.** Node cannot tell you.

```bash
grep -rn '^<<<<<<<\|^>>>>>>>' src/ tools/   # must print nothing
node --check src/main.js                    # must parse
# then actually boot it (see "The boot check" below)
```

### 2. A verification that silently didn't run

Ten agents at once took this machine to load average 30. Headless Chrome stopped
completing, and several agents reported success on measurements that never
happened. One agent killed another's browser while cleaning up its own tabs.

> **Rule: at most 3 concurrent headless Chromes.** Check `uptime` before trusting
> any timing or screenshot. If load > 8, the number is meaningless — re-measure.

A world build measured 4.7 s on a quiet machine and 10.5 s under load. Same
commit. Nothing had regressed.

### 3. Assertions that encode a stale assumption

Three suites failed only after merging, and every one was a real interaction:

- Rival AI couldn't corner because top speeds rose from 110 to 180 km/h and the
  lookahead was capped at 56 m.
- The garage's handbrake upgrades were being silently overwritten by
  `finalizeCar()` — **the failing test was catching a genuinely broken feature.**
- No single sand-drag value could let a truck cross the beach while a bike still
  won, because the penalty was constant deceleration.

> **Rule: when a test fails, first decide whether the code or the assertion is
> wrong. Never loosen an assertion to get green.** If the promise it encodes
> still matters, fix the code. Say in the commit message which of the two it was.

### 4. Confident, wrong written content

Gemini produced good material and specific falsehoods, all marked high
confidence: an invented surname for Sayyad; real radio call signs that didn't
match the game's own stations; the 1831 Symmes Inn described as the school; the
Maman sculpture dated 2004 when it was acquired in 2005.

> **Rule: validate every content file programmatically before wiring it.** Counts,
> schema, and cross-references against the real game data — not a read-through.

```bash
python3 - <<'PY'
import json
c=json.load(open('assets/text/campaign.json'))['campaign']
print('jobs', len(c))
print('consecutive repeats', [j['n'] for i,j in enumerate(c) if i and j['to']==c[i-1]['to']] or 'none')
# every destination must exist in the real game
PY
```

---

## The boot check — run this after every wave

```bash
# 1. quiet machine
uptime                                   # load should be < 4
pkill -f "http.server"; pkill -f headless.mjs

# 2. all suites
p=0;f=0; for t in tools/smoke*.mjs; do node "$t" >/dev/null 2>&1 \
  && p=$((p+1)) || { f=$((f+1)); echo "FAIL $t"; }; done; echo "$p passed, $f failed"

# 3. real browser, cold, fresh storage
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9222 --use-angle=swiftshader \
  --enable-unsafe-swiftshader --user-data-dir=/tmp/cr-verify &
(cd . && python3 -m http.server 8123 --bind 127.0.0.1 &)
node tools/headless.mjs http://localhost:8123/index.html 6 /tmp/boot.jpg --fresh
```

The page script must click `#start`, wait ~400 ms, click `#startconfirm`, then
poll for `window.AYLMER.G.mode === 'drive'`. **Clicking only `#start` hangs
forever** — the menu is two clicks now.

**Then read `/tmp/boot.jpg` yourself.** A boot that returns `mode: drive` with a
black screen is still broken. Look at it.

**Pass means:** 26+ suites green · `drive` reached · zero `[EXCEPTION]` and zero
`[error]` in the console (AudioContext-autoplay and SwiftShader ReadPixels
warnings are expected and fine) · the screenshot shows the town.

---

## Memory — the measurement protocol for Wave 1

Do not change anything until you have a baseline, and re-measure after every
step. "It feels lighter" is not a measurement.

```js
// in a page script, after reaching drive mode
const m = performance.memory;                       // Chrome only
const r = performance.getEntriesByType('resource');
return JSON.stringify({
  heapMB: Math.round(m.usedJSHeapSize / 1e6),
  totalHeapMB: Math.round(m.totalJSHeapSize / 1e6),
  downloadedMB: +(r.reduce((s,x)=>s+(x.transferSize||0),0)/1e6).toFixed(1),
  buildMs: window.AYLMER.G.buildMs,
  tris: window.AYLMER.G.world.stats,
});
```

**Baseline as of `fedc4b1` (quiet machine):** heap ~1044 MB · downloaded 21.4 MB ·
world build 4.9 s · 3.79 M triangles · 6,068 chunks · ~260 MB vertex buffers.

**Target:** heap under ~500 MB, and the game survives twenty minutes of driving
in **Safari**, which is stricter than Chrome and is what actually killed it.

Measure at four points, not one — the whole point is that memory grows with where
you drive:

1. Just after reaching drive at 299 Chemin Fraser.
2. After driving to the Galeries (Aylmer only).
3. After crossing into Hull.
4. After crossing the Champlain Bridge into Ottawa — **the worst case, and the
   spot that reads as an invisible wall.**

Record all four before and after. A change that helps at step 1 and not at step 4
has not fixed the bug.

**Safari is the real test.** Open the local build in Safari, drive to Ottawa, and
watch for the "reloaded because it was using significant memory" banner. Chrome
tolerates far more, so a Chrome-only pass proves nothing.

---

## Merging parallel work

If more than one agent runs, they merge sequentially, and after **every single
merge**: `node --check src/main.js`, all suites, and a browser boot. Do not batch
merges and test once at the end — four conflicts today were each a real
disagreement, and one resolution silently left a conflict marker in the file.

When two branches have both rebaselined the same golden numbers (this happened to
`smoke_terrain.mjs`), **neither side's table is correct.** Regenerate it from the
merged code rather than picking one.

Before merging, check nothing has claimed the same key twice:

```bash
grep -rhoE "'Key[A-Z]'" src/main.js src/game/*.js | sort | uniq -d   # must be empty
```

`K` was bound to both the weather and the Kijiji screen after a merge, and no
test could see it because the handlers live in different modules.

---

## Definition of done, per change

- [ ] The suites pass, and any assertion you changed, you can justify.
- [ ] It boots in a real browser and you have looked at the screenshot.
- [ ] No conflict markers, no duplicate keybindings.
- [ ] If it touches driving, physics or memory: a measured before/after number.
- [ ] If it adds player-facing text: Québécois French, 2004, no invented surnames.
- [ ] The commit message says what was wrong and why the fix is right — not what
      you typed.

## Definition of done, per wave

- [ ] Everything above.
- [ ] The four-point memory measurement, unchanged or better.
- [ ] A Safari run to Ottawa with no reload banner.
- [ ] `docs/NEXT.md` updated: strike what is fixed, add what you found.
