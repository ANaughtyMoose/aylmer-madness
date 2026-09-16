# MacBook Air handoff — start here

Updated 15 September 2026. This is the current continuation guide; older handoffs describe earlier snapshots.

## 1. What to pick up

Repository: https://github.com/ANaughtyMoose/aylmer-madness

- Repair PR #42: https://github.com/ANaughtyMoose/aylmer-madness/pull/42 — roads, sidewalks, cemetery, pause audio/UI, campaign order, Glenwood houses and chained spare. Reviewed gameplay head: `ef6fb794d63f1e801eaad833fb4465192933819c`.
- Follow-up PR #43: https://github.com/ANaughtyMoose/aylmer-madness/pull/43 — flying roadside objects, damage controls and photographed Ranger details. Gameplay commit: `ef4414a`; first published handoff: `611b3be`.
- Integration status when this guide was written: both PRs are open. #42 targets protected `main`; #43 currently targets `codex/aylmer-repairs`. The owner requested merging both, but the administrator override was rejected by automatic approval review because explicit bypass approval is still needed. No protection settings were changed. Check the PR pages for the authoritative current state.
- After both are merged, use `main`. Until then, `codex/ranger-impact` contains both complete change sets and this guide. Do not cherry-pick the Glenwood commits again: they are already integrated.

## 2. First launch on the Mac

Prerequisites: Git, Node.js and a browser with WebGL2. Windows validation used Node `v24.14.1`; the exact patch is a recorded baseline, not an enforced version requirement. Use Node 24 for the closest reproduction. Verify installations with `git --version` and `node --version`. No package installation, bundler, Python, paid service or deployment is needed to play or run the JS tests.

In Terminal, for a new checkout:

```sh
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/ANaughtyMoose/aylmer-madness.git
cd aylmer-madness
git switch main
git pull --ff-only
```

If either PR is still open, use the complete review branch instead:

```sh
git fetch origin
git switch --track origin/codex/ranger-impact
```

If that local branch already exists, use `git switch codex/ranger-impact` and then `git pull --ff-only`. For an existing checkout, first run `git status --short --branch`; preserve any local work before changing branches. Never use a hard reset or clean command just to follow this guide.

Run from the repository root:

```sh
node tools/serve.mjs 8136
```

Leave that Terminal running. Open another Terminal tab and run:

```sh
open -a "Google Chrome" http://localhost:8136/index.html
```

If Chrome is not installed, `open http://localhost:8136/index.html` opens the default browser; Chrome is the browser used for the recorded checks. Do not double-click index.html: ES modules require HTTP. Stop only this server with Control-C in its Terminal. If port 8136 is already occupied, use 8137 and change the browser URL accordingly. The local server is for development; do not port-forward it or treat it as production hosting.

Start the game with the new-game button and its confirmation, then proceed through the briefing. The game builds scenery on first start; a visible loading screen is expected. Do not launch several copies while it is loading.

## 3. MacBook Air memory and performance

No MacBook Air benchmark was performed during this Windows repair session. Do not present Windows measurements as Mac FPS or RAM requirements.

- Start with one game tab and no other game preview running. The tests bake large worlds; run them serially, preferably after closing the game tab.
- Start with Medium quality. If needed, lower render resolution, maximum screen pixels and draw distance in Options. A Retina display can cost considerably more pixels than a normal-resolution window.
- The measured full-world graphics-buffer figure was about 327 MB. This is not total browser RAM: CPU geometry, textures, audio and browser overhead add to it.
- Breakable objects retain compact CPU geometry; only hit objects get separate GPU meshes. At most 40 debris pieces are retained, and sector unload/eviction frees their GPU meshes.
- Keep the browser's normal graphics acceleration. Software-rendering/headless flags are not a normal play setup.
- If a browser crashes, close that test instance, restart one instance and recover from Git and these docs. Do not launch parallel replacement browsers or kill every Chrome process on the machine.

## 4. What changed and how to check it

### Roads, grass, sidewalks and cemetery

Terrain, asphalt, markings and sidewalks now share terrain triangles. This addresses grass surfaces cutting diagonally through roads and footpaths. Residential streets receive sidewalks on both sides; furniture and curb placement reject road overlap. Rail embankment crossings paint onto the actual crossing surface. Saint-Paul's perimeter fence follows mapped edges with street/sidewalk setbacks; the entrance pillars remain.

Drive Chemin Fraser, an intersection, the Samuel-Edey rail crossing and the Saint-Paul frontage. Look at oblique camera angles for grass streaks, disappearing pavement, fence intrusion and sidewalk gaps. Road wear is restrained: patches, thin cracks, manholes, joints and faded paint. Cosmetic cracks do not create physical bumps. This remains a summer game.

### Pause and campaign

Pause gates gameplay audio, including an already-playing police siren. The pause screen uses the current mission's briefing art/objective and resume/restart actions. Upcoming/completed missions are collapsed; new missions unlock sequentially while completed missions remain replayable. Existing completion is preserved.

Check pausing during a chase, resuming audio, restarting the current mission, and a fresh campaign where later jobs cannot be chosen immediately. Do not overwrite the owner's real save to test a fresh campaign: use a separate browser profile or test origin.

### Glenwood houses

Three reference-based shallow-gable bungalows are integrated: carport/grey lower facade, off-centre entry/picture window, and covered corner porch. They are restricted to one-storey detached houses on Rue Glenwood (29 eligible buildings: 11/9/9). `opts.glenwood=false` disables them; explicit variant selection exists for the model preview.

They were inspected on the real street after integration. The full building footprint remains a car collider, so you cannot drive under a carport. Stairs/railings have no separate collision. See GLENWOOD-HANDOFF.md for the original Opus contribution; its cherry-pick instructions are historical now.

### Breakable objects and damage

Streetlights, utility poles, traffic-light masts, stop signs and small trees can detach with their original geometry. The standing collider is removed, and a broken traffic-light mast loses its floating lit lens. Objects fly, bounce and settle relative to terrain, including clearance for a fallen canopy. Fast collision detection sweeps through the frame's travel rather than testing only the final position.

At default damage, a hard head-on breakable impact adds 14.7798 points. Six hits from a repaired truck leave 88.6788; the seventh reaches 100 and disables it. This calibration assumes sufficiently hard impacts; glancing/slow contacts can do less, and other collisions contribute damage. Gentle nudges leave the object standing.

Options → Controls → Collision damage / Dégâts de collision offers 0–2 times damage. At zero, objects still break and impact motion remains. The setting persists, applies to the player after vehicle changes, and native slider arrow keys work. Test at 1×, then zero, then restore 1×.

Debris is arcade physics, not a full rigid-body simulation. It is capped at 40 pieces and resets when its sector reloads. Large trees retain their existing behavior; buildings/heavy obstacles remain solid.

### Ranger likeness and spare

The owner's photos informed the rusty white front bumper, black lower valance, black steel rear bumper, damaged grey grille, oval badge, larger lamps/amber corners, weathered steel wheels, front-fender badges, fine grey stripes, aluminum tailgate lip, black handle and rear-window seal/center brake light. Preserving original profile points fixes the rear window that the previous coarse sampling skipped.

The rusty spare and attached chain remain. Spare motion responds to meaningful vertical impacts and is bounded to 7.5 cm; reset clears its motion. The geometry remains stylized. Do not claim exact unseen rear details: no clear straight-on rear reference was supplied. Owner review is the standard for likeness.

## 5. Verification baseline and commands

Recorded before this documentation update:

- Full serial smoke run: 54/54 suites passed.
- World test: 23/23 checks passed, about 327 MB graphics buffers.
- Final keyboard-input and canopy-clearance assertions also passed in smoke_breakables.mjs after their addition.
- Real game browser: streetlight and tree each broke with 14.7798 damage; zero-damage setting broke a tree without damage; pause gain was zero; saved slider restored to 1 with keyboard arrows.
- Final Ranger preview: front/side and rear/bed, including rear window, tailgate cap and spare. Final visual likeness still merits owner review on the Mac.

Run lightweight checks first:

```sh
node --check src/main.js
node tools/smoke_breakables.mjs
node tools/smoke_campaign_spare.mjs
node tools/smoke_glenwood.mjs
```

For a broad code change, with the game tab closed:

```sh
npm test
```

This calls `tools/run_smoke.mjs`, which runs the suites serially. A failure means inspect the complete failing suite directly; do not weaken its threshold or push repeatedly to use CI as a debugger. Node suites alone do not prove the game boots: finish with a real browser launch.

With the local server running:

- Game: http://localhost:8136/index.html
- Ranger model: http://localhost:8136/tools/ranger-review.html
- Glenwood model: http://localhost:8136/src/game/glenwood_lab.html
- Developer repair/impact harness: http://localhost:8136/tools/repair-review.html

The harness can create a new test game, teleport, repair/reposition the truck and simulate impacts. Use it only in a disposable browser profile/origin. Preview pages prove geometry rendering; they do not substitute for in-game terrain, physics or save checks. Older VERIFY.md contains historical suite counts and broad process-killing commands; use the serial runner and stop only your own server/browser instead.

## 6. Saves and reference photos do not travel through Git

Game progress/settings live in browser localStorage. Cloning the repository does not transfer them. Browser profile and exact origin matter: localhost:8136, localhost:8123 and 127.0.0.1:8136 are separate saves. Chrome on another computer is also separate. Keeping the same URL makes future use predictable but does not itself sync data.

Optional manual save transfer, only if you want the Windows progress on the Mac:

1. On Windows, explicitly save in-game and pause. Open Developer Tools → Console on the actual game page/origin, not a preview iframe.
2. Run the export below. It downloads only keys beginning `aylmer.`; keep the file private and transfer it with AirDrop, a private drive or another method you control.
3. On the Mac, open the game at the intended origin, remain at the menu, and export any existing Mac progress first as a backup.
4. Run the import below and select the transferred file. It overwrites matching game keys only after confirmation, then reloads. It does not delete unrelated browser storage or unrelated game keys.

Export:

```js
const saveData = Object.fromEntries(Object.keys(localStorage)
  .filter(k => k.startsWith('aylmer.')).map(k => [k, localStorage.getItem(k)]));
const saveURL = URL.createObjectURL(new Blob([JSON.stringify(saveData, null, 2)], {type:'application/json'}));
const saveLink = document.createElement('a');
saveLink.href = saveURL; saveLink.download = 'aylmer-browser-backup.json'; saveLink.click();
setTimeout(() => URL.revokeObjectURL(saveURL), 1000);
```

Import (manual recovery helper, not an in-game feature or an exercised cross-device transfer):

```js
const savePicker = document.createElement('input');
savePicker.type = 'file'; savePicker.accept = '.json,application/json';
savePicker.onchange = async () => {
  if (!savePicker.files.length) return;
  const incoming = JSON.parse(await savePicker.files[0].text());
  if (!incoming || Array.isArray(incoming) || typeof incoming !== 'object') throw Error('Invalid backup');
  const entries = Object.entries(incoming);
  if (!entries.length || entries.some(([k,v]) => !k.startsWith('aylmer.') || typeof v !== 'string'))
    throw Error('Not an Aylmer browser backup');
  if (!confirm('Replace matching Aylmer save/settings keys? Export this browser first.')) return;
  for (const [k,v] of entries) localStorage.setItem(k,v);
  location.reload();
};
savePicker.click();
```

Seven original Ranger photos were preserved on Windows outside Git at the following local-only folder:

`C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\work\ranger-references`

Copy that folder privately to the Mac if further reference work is needed. Do not add the photos or personal save backups to this public repository. The code, procedural assets and documentation needed to run the game are already in Git.

## 7. Implementation map

| Area | Primary files |
|---|---|
| Terrain/pavement/fence alignment | src/game/world.js, surface.js, cemetery.js, historic.js |
| Glenwood variants | src/game/houses.js; docs/GLENWOOD-HANDOFF.md |
| Pause/campaign integration | src/main.js, src/game/ui.js, src/core/audio.js |
| Breakable registration and collider removal | src/game/world.js, src/game/sectors.js |
| Fragment extraction, flight, landing rotation | src/game/breakables.js |
| Swept contacts and damage tuning | src/game/cars.js: Vehicle.collidePoles and Vehicle.hit |
| Debris rendering | src/game/damage.js; signals.js for broken lights |
| Ranger body, lamps and wheels | src/game/cars.js: buildCarBody, addDetails, buildCarLamps, buildWheel |
| Spare/chain | src/game/spare.js and src/main.js |
| Damage setting and keyboard control | src/game/store.js, options.js, i18n.js, src/core/input.js |
| Regression coverage | tools/smoke_breakables.mjs, smoke_world.mjs, smoke_campaign_spare.mjs |

Paths abbreviated in the same row remain under the explicitly named directory. Start with the smallest relevant module rather than rebuilding the world or replacing the renderer.

## 8. Next-agent prompt

> Continue Aylmer Madness from the checked-out repository on this Mac. Read docs/MACBOOK-HANDOFF.md first, then docs/RANGER-IMPACT-HANDOFF.md and the current Git status/log. Check PR #42 and #43 on GitHub before assuming integration: use main after both merge, otherwise codex/ranger-impact contains both change sets. Preserve local edits and do not redo the completed repair/Glenwood work. The owner requested merge, but bypassing the required GitHub review needs explicit approval; do not change branch protection or infer that an old handoff permits it. First launch one game instance with node tools/serve.mjs 8136 and inspect it in a real browser. Establish Mac performance rather than claiming Windows results apply. Treat the owner's Ranger photos as the visual reference, keep them outside public Git, and ask only for missing views that matter. Make bounded changes, run relevant local tests, record actual results and remaining gaps, and update this guide. Commit checkpoints locally; batch pushes. Never edit workflows, trigger CI test loops or push tags without the required authorization. Future changes should go through a review PR unless the owner explicitly authorizes merging them.

## 9. GitHub policy and recovery discipline

The repo is public. There are no checked-in Actions workflows in this snapshot; the existing dynamic Pages deployment is active. Merge can trigger deployment, but deployment success was not part of the local verification and must not be assumed. Do not add/edit workflows or change protection settings. Documentation-only commits use `[skip ci]`. Keep a meaningful recovery checkpoint and one batched push per phase, and verify the remote contains the intended commit before declaring the work backed up.
