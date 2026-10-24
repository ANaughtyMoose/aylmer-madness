# Save, storage and reliability review - 2026-09-29

Branch `claude/quality-review-2026-09-29`. Read-only wave: no source edited. Probes live in
`/private/tmp/claude-501/save-audit/` and run with plain `node <file>` from the repo root.
Baseline: `node tools/smoke_save.mjs` passes (358 assertions).

Severity scale: **Blocker** = data loss or corruption; **High** = likely loss/corruption in a real
workflow or a cross-save leak; **Medium** = wrong behaviour, recoverable; **Low** = hygiene.

## 1. Storage inventory

All keys are on the page origin. `index.html` uses them raw. `prototype.html` goes through
`src/prototype/boot.js`, which re-points `window.localStorage` at a prefixed view:
`aylmer2004.prototype.<key>`, or `aylmer2004.audio-review.<key>` with `?audioReview=1`.

| Key | Owner | Schema / version | In save slot? | Cleared by "wipe"? |
|---|---|---|---|---|
| `aylmer.save.<char>.<1\|2\|3\|auto>` (20 keys) | save.js | `SAVE_VERSION = 2` JSON, `normalizeSave` on every read | is the slot | yes |
| `aylmer.save.last` | save.js | qualified slot id | - | yes |
| `aylmer.save.migrated` | save.js | stamp `'2'` (`'1'` = older migration) | - | no (correct) |
| `aylmer.settings` | store.js | `normalizeSettings`, clamped, unversioned | no (by design) | no (correct) |
| `aylmer.map` | store.js | `{size, range}` clamped | no | no |
| `aylmer.cars` | garage.js | `{bought, seen, mods, feats}` mirror of the in-memory garage | copy in `unlocks` | **no** |
| `aylmer.radio`, `aylmer.radio.station` | store.js / radio.js | clamped | no | no (correct) |
| `aylmer.recorded-radio.v1` | recorded-radio.js | `{version:1,...}` | no | no (correct) |
| `aylmer.tutorial`, `aylmer.legend`, `aylmer.slang` | ui.js / heckle.js | `'0'/'1'` | no | no |
| `aylmer.achievements` | flavour.js | string[] <= 64 | no | yes (`flavour.reset()`) |
| `aylmer.hangout` | hangout.js | `{nights, best, said[], gifts[]}` | **no** | **no** |
| `aylmer.bestlap` | racejobs.js | `{id: secs}` | **no** | **no** |
| `aylmer.modes` | modes.js | `{id: secs}` | **no** | **no** |
| `aylmer.progress`, `aylmer.best`, `aylmer.garage` | legacy | read once by `migrateLegacy`, never deleted | - | no |
| `aylmer.money` | legacy | deleted by migration | - | - |
| IndexedDB `aylmer2004-local-radio-v1` (+`-review`) | radio-storage.js | v1 store `files`, one record `station-library-v1` = `[{id,file:File,stationId}]`, falls back to legacy `playlist` | no | no (correct) |
| `visual-options` (prototype only) | panel.js | `{dayMinutes}` | no | no |

`missions.js` `loadProgress/saveProgress/resetProgress` (src/game/missions.js:546-571) are dead
code that still writes the legacy `aylmer.progress` key. No caller in `src/`.

## 2. Things verified as sound

- Every localStorage touch in `index.html` code paths is inside try/catch or uses a guarded
  `store()` helper. Probe P2 (getter throws SecurityError): migration, list, write, settings
  all return quietly.
- `localStorage.setItem` is atomic, so a torn slot write is not possible in a browser.
  `JSON.parse` failures fall back to null/defaults.
- `normalizeSave` drops unknown car ids from `parked`/`health` and falls back to the
  character's own start car (probe `probe_cars.mjs`: Zahra gets `dbike` once `vehicles.js` has
  registered it. That depends on import side effects, which main.js always has in place).
- Mid-mission text comes from the **current** definitions: `resumeMission` re-runs `def.build()`,
  `applyStage()` sets objective text from the new stage, the toast uses `def.title`. A removed job
  id gives a "Job perdue" toast and free roam. The stage index is clamped to the new stage count
  (main.js:1419-1453).
- Money paid mid-job (`m.paid`) and the wallet are both in the snapshot, so `refundJob` stays
  consistent after a load.
- Missing assets: materials atlas → `MATS_STUB` (main.js:857), models manifest → empty registry,
  all `assets/text/*.json`, `summer2004.json`, `playlist.json`, car skins and cinematic art fail
  quietly. The game boots with every non-JS asset missing. The Cloudflare SPA fallback returning
  `index.html` with a 200 for a missing JSON is also caught: `r.json()` throws inside the same
  try/catch.
- `tools/serve.mjs` listens on `127.0.0.1` only (:55). It checks Host (DNS rebinding) (:17),
  rejects cross-site and foreign-Origin requests (:18) and dot segments (`..`, `.git`) (:34), and
  runs a `realpath` containment check against ROOT or AUDIO (:38-39), which also defeats symlink
  escapes. `/__local_radio/` serves only files named in `RECORDINGS` (15, none with path
  separators), with `CORP: same-origin` and `no-store`.
- `.assetsignore` keeps `assets/radio/`, `references/`, `gemini-inbox/`, `docs/`, `tools/`,
  `data/` out of the Wrangler deploy. `tools/build-public.mjs` also skips `assets/radio` (except
  `playlist.json`) and `assets/models/src`.

## 3. Findings

### SR-01 High - Dev harnesses on the play origin overwrite the player's real autosave
- **Observed:** `tools/first-drive-check.html`, `life-check.html`, `principale-check.html`,
  `fortier-check.html` and `repair-review.html` iframe `../index.html` (raw keys, no namespace). They
  click `#start` + `#startconfirm`. That starts a new game as `pickedCharacter`, which boot sets to
  the character of the player's most recent save (main.js:2956-2962). Finishing a job calls
  `autosave('job')` → `saveToSlot(G, `${G.character}.auto`)` (main.js:1651, 2721-2727). Midnight
  and economy events autosave too (main.js:1349, economy.js:384-630). The overwritten autosave
  carries the newest `savedAt`, so it becomes the **Continue** target (`continueSlot`,
  save.js:442). A new game also runs `garage.reset()` → writes `aylmer.cars`.
- **Expected:** a test fixture can never write to the player's slots.
- **Why it happens in practice:** docs/MACBOOK-HANDOFF.md:128-133 lists the game and
  `repair-review.html` on the **same origin** (`localhost:8136`). The only safeguard is prose
  ("Use it only in a disposable browser profile/origin"). first-drive-check prints "Uses the
  preview origin only", but nothing enforces it.
- **Repro:** serve on 8123 and play Tom to an autosave. Open `/tools/first-drive-check.html` and
  press Run. `localStorage['aylmer.save.tom.auto']` now holds a fresh day-1 summer with
  `last: 'L'alternateur'`.
- **Fix:** give index.html the same namespace shim prototype.html has. Move boot.js's prefix view
  into `src/core/storage-ns.js` and activate it from any `?sandbox=<name>` (harnesses pass
  `?sandbox=first-drive` etc.). Belt and braces: `autosave()` returns early when
  `window.top !== window` and no sandbox is set.
- **Validation:** snapshot `Object.keys(localStorage)` and the values before and after each
  harness run. The unprefixed keys must be byte-identical.
- **Confidence:** high (code path traced end to end; not run in a browser per the no-browser rule).

### SR-02 High - Screenshot/memory tools wipe all site data for the play origin
- **Observed:** `tools/measure_memory.mjs:57` (default origin `localhost:8123`, the README play
  port), `tools/shots_landmarks.mjs:96` and `tools/shots_ottawa.mjs:113` call
  `Storage.clearDataForOrigin {storageTypes:'all'}` unconditionally. `tools/headless.mjs:66` does
  the same with `--fresh`. They attach to whatever Chrome owns `:9222` and never spawn their own
  profile. `'all'` covers localStorage (all 20 slots) **and** IndexedDB (the imported MP3 radio
  library).
- **Expected:** automation clears only a throwaway profile.
- **Fix:** always launch Chrome with `--user-data-dir=$(mktemp -d)`, or use
  `Target.createBrowserContext` and clear only inside that context. Refuse to clear if the target
  was not created by the tool.
- **Confidence:** medium. Harm needs the debug Chrome to be a profile Tom plays in. Chrome 136+
  refuses remote debugging on the *default* profile, which lowers the odds, but any persistent
  `--user-data-dir` review profile is exposed.

### SR-03 Blocker (data loss, low likelihood) - v1→v2 migration deletes before it writes
- **Observed:** `migrateLegacy` calls `removeRaw(KEY_PREFIX + n)` *before* parsing and before
  `writeSlot` (save.js:544-564). If `writeSlot` fails (QuotaExceeded, or a transient
  SecurityError), the v1 slot is gone and nothing replaced it. The stamp `'2'` is then written
  (:602) anyway, so there is no retry.
- **Repro:** `probe_save.mjs` P1. With `aylmer.save.1` = a v1 save holding `progress:['school','gang']`
  and `setItem` throwing, the keys after migration are `["aylmer.save.last"]` only. `tom.1` is
  null and the progress survives nowhere.
- **Fix:** parse → `writeSlot` → read back → only then `removeRaw`. Leave the stamp unwritten if
  any step failed, so the next boot retries. The same applies to `removeRaw(MONEY_KEY)` (:601):
  delete only after the slots that needed the loose wallet are safely written.
- **Validation:** extend smoke_save §2 with a storage whose `setItem` throws for new keys.
  Assert the v1 key still exists and the stamp is absent.
- **Confidence:** high (reproduced).

### SR-04 High - A slot with `unlocks: null` inherits the previous summer's garage
- **Observed:** `enterDrive` only resets the garage when there is **no** save, and only restores it
  when `save.unlocks` is truthy (main.js:959-960, 1009). Slots produced by `migrateLegacy` path (b)
  always have `unlocks: null` (save.js:576-595), and so can v1 slots. Loading such a slot keeps
  whatever the in-memory garage holds: another character's bought cars, fitted mods and feats, or
  the boot-time `aylmer.cars` mirror. The next autosave writes the leaked set into this slot
  permanently.
- **Repro:** `probe_garage_leak.mjs`. Mike buys the Cutlass and the Benz, then Tom's legacy
  "Ancienne partie" slot ($50) is loaded. Tom now owns `['cutlass','benz']`, `has('benz') = true`.
- **Fix:** in `enterDrive`, `if (!save || !save.unlocks) garage.reset()` before any restore. In
  `migrateLegacy`, fold the legacy `aylmer.cars` into the migrated slot's `unlocks` once, since that
  key was the v1 truth for purchases.
- **Validation:** node test: `restore(mike)`, then enterDrive-equivalent with `unlocks:null`.
  Expect `bought` to be empty (or equal to the migrated `aylmer.cars`).
- **Confidence:** high (reproduced against the real Garage class).

### SR-05 Medium - Newer-build saves are silently downgraded by an older build
- **Observed:** `normalizeSave` keeps `raw.version` as-is but drops every field it does not know,
  and rewrites unknown `carId`s (save.js:265-337). Nothing compares against `SAVE_VERSION`. Probe P5:
  a v3 save with `pets` and `carId:'hovercraft'` round-trips through this build as `version:3`
  with `pets` gone and `carId:'ranger'`. The slot still claims to be v3.
- **Why it matters here:** several checkouts and worktrees are served on the same
  `localhost:8123`, so they share one localStorage. Opening an older branch and letting it
  autosave strips a newer branch's save.
- **Fix:** in `readSlot`, if `raw.version > SAVE_VERSION`, mark the row read-only
  ("sauvegarde d'une version plus récente"). `writeSlot` refuses to overwrite a newer-version
  slot, or first copies it to `aylmer.save.<slot>.bak`. Always stamp `SAVE_VERSION` on what this
  build writes.
- **Confidence:** high.

### SR-06 Medium - A corrupt slot is shown as "empty" and can be saved over
- **Observed:** `readSlot` returns null on bad JSON, so `listSlots` renders the slot as empty
  (P3). `hasAnySave()` still returns true, which enables "Charger" (main.js:780) on a screen of
  empty boxes, and `continueSlot()` is null. Saving into the "empty" box destroys the only copy.
  In the other direction, `'[]'` is accepted as a valid save with defaults (P4), because
  `typeof [] === 'object'`.
- **Fix:** `listSlots` returns `{corrupt:true}` for unparsable data. The UI labels it "illisible".
  Before overwriting, move the raw string to `aylmer.save.<slot>.corrupt`. `normalizeSave` rejects
  arrays.
- **Confidence:** high.

### SR-07 Medium - Storage failure is invisible until a manual save
- **Observed:** `autosave()` returns null on failure and logs nothing to the player
  (main.js:2721-2727). Only a manual save toasts `save.failed`. Nothing tells a player in a
  blocked-storage browser that no autosave will ever land. Safari's 7-day cap on script-writable
  storage can also silently delete every slot on a deployed build. There is no
  `navigator.storage.persist()` call and no save export/import.
- **Fix:** probe write/read/remove of a test key at boot and show a persistent HUD badge when it
  fails. Toast once on the first failed autosave. Request `navigator.storage.persist()` after the
  first save. Add an "Exporter / Importer" JSON of all `aylmer.save.*` keys.
- **Confidence:** high for the silent failure, medium for the Safari eviction impact.

### SR-08 Medium - "Effacer toutes les sauvegardes" leaves progress behind, and a running game resurrects it
- **Observed (P8):** the wipe (main.js:2790-2797) removes the 20 slots, `last` and achievements.
  These survive: `aylmer.cars` (read by the boot-time Garage, so the menu still shows old unlocks),
  `aylmer.hangout` (one-time cash gifts are never offered again), `aylmer.bestlap`,
  `aylmer.modes` (old records), legacy keys, `aylmer.tutorial`, and `settings.storySeen`. The wipe
  is reachable from the pause menu. The session keeps running, and the next job, midnight or
  purchase autosave writes the wiped progress straight back to `<char>.auto`. It is two clicks
  within 4 s (options.js:255-272), covers all five characters, and has no undo.
- **Expected:** a wipe removes every progress key (not settings or the radio library) and ends the
  current summer.
- **Fix:** one `PROGRESS_KEYS` list in store.js that wipe iterates. After a wipe from pause,
  return to the main menu. Keep a one-level backup (`aylmer.wiped.<iso>`) that is cleared on the
  next boot, or offer "Annuler" for the toast's lifetime.
- **Confidence:** high.

### SR-09 Medium - Per-browser state that should be per-summer
- `aylmer.hangout` (`gifts`, `nights`, `said`), `aylmer.bestlap` and `aylmer.modes` are global.
  Loading an earlier slot or switching character keeps them. A hangout gift is cash
  (hangout.js:656-659), so it can be claimed once per browser, never once per summer, and Zahra's
  dialogue facts see Tom's `nights`. Fix: move them into the slot (`stats` already round-trips
  arbitrary objects), or key them per character.
- **Confidence:** high.

### SR-10 Medium - Mid-mission restore loses state that earlier stages built
- **Observed:** resume rebuilds only the *current* stage (`applyStage` → its `onEnter`), then
  overlays saved scalars. Objects that an earlier stage's `onEnter` created are gone. Concrete
  case: race jobs spawn rivals and measure `m.legs` in the **grid** stage (racejobs.js:151-154). A
  save taken during the **race** stage resumes with no rivals and straight-line leg lengths
  (race.js:543-548), and the count-in replays. `styleStart` is re-based at load time, so the style
  bonus is measured from the load (main.js:1433-1436). Saved `stageTime`/`held` overwrite the
  fresh values that `stageEnter` just set (missionkit.js:71-75), which is intended but not tested.
- **Fix:** a def-level `resumeAt(idx)` hook (race jobs return the grid index), or a generic rule
  that resumes at the last stage with no `onEnter` dependency. Add a smoke test that saves at every
  stage index of every def, resumes, and steps 60 frames without throwing and with
  `G.rivals.length > 0` for race jobs.
- **Confidence:** high for the race case (code traced). Other defs not exhaustively checked.

### SR-11 Medium - prototype.html boots to a blank page when site data is blocked
- **Observed:** `src/prototype/boot.js:2` reads `window.localStorage` at top level, outside the
  try block that draws the error card (:12-21). With cookies/site data blocked the getter throws
  and the module rejects. The probe (`probe_boot_blocked.mjs`) shows the rejection with no error
  card. `index.html` is unaffected.
- **Fix:** `let realStorage; try { realStorage = window.localStorage; } catch {}` and fall back to
  an in-memory Map-backed Storage.
- **Confidence:** high.

### SR-12 Medium (latent data loss) - Radio library import race at startup
- **Observed:** `mountLocalRadio` wires the file input and the "Retirer" buttons, then awaits
  `readLibrary()` (src/prototype/local-radio.js:95-112). An import in that window runs `save()` with
  `rows = [newFile]`, and `writeLibrary` replaces the single record `station-library-v1`. The later
  `rows = await readLibrary()` then drops the new file from memory.
- **Repro:** `probe_radio_race.mjs` (fake IndexedDB with a slow read). Library before
  `[a.mp3, b.mp3]`, after `[new-song.mp3]`. Real IndexedDB orders the transactions differently,
  but the result is the same: the disk holds `[new]` until the next save.
- **Fix:** keep the input and buttons `disabled` until the read resolves. Better: make
  `writeLibrary` a merge inside one readwrite transaction (get → merge by id → put).
- **Confidence:** medium. Reproduced with a mock. The window is short and sits at boot.

### SR-13 Medium (privacy) - `serve.sh` exposes the whole checkout to the LAN
- **Observed:** `serve.sh` runs `python3 -m http.server "$PORT"` with no `--bind`, so it listens
  on all interfaces. It is the documented default in README.md:14, CONTRIBUTING.md:11 and
  docs/PLAN.md:75. It serves `.git/`, `references/story/*` (real people's photos, gitignored but on
  disk in a working checkout) and `gemini-inbox/look/ui/tom_*` and car plates if present. It has
  no dot-file filter. `tools/serve.mjs` does not have this problem.
- **Fix:** `exec python3 -m http.server "$PORT" --bind 127.0.0.1`, or make serve.sh `exec node
  tools/serve.mjs "$PORT"`.
- **Confidence:** high (python `http.server.test(bind=None)` = all interfaces).

### SR-14 Low - `?audioReview=1` isolation is partial and opt-in
What it isolates, and only on `prototype.html`: every localStorage key (saves, settings, radio
prefs, `visual-options`) through the boot.js prefix, and the IndexedDB radio library through the
`-review` DB suffix (radio-storage.js:2). On `index.html` it does nothing. It does not isolate
origin-wide operations (SR-02), and tabs still share one origin (last writer wins; no `storage`
event listener).
`tools/integration-radio-library.html` derives the DB name from **its own** URL. Opened without
`?audioReview=1`, it imports "Personal QA recording.mp3", replaces the `majic100-1` row and
reassigns stations in the player's real library, and cleans none of it up. Fix: the harness
redirects to itself with the flag if it is missing, or `radio-storage.js` exports
`useDatabase(name)`.
The two `integration-*` pages that iframe `prototype.html?audioReview=1` are correctly isolated.

### SR-15 Low - Deploy boundary gaps (nothing private found shipping today)
Wrangler uploads the working tree (`directory = "./"`), not git. `.assetsignore` does not list
these, so they would ship if present locally: `out/` (the build-public copy), `.openai/`
(hosting.json with a project id), `assets/models/src/` (gitignored 333 MB of CC0 sources, some
over the 25 MiB limit), `spike-log.txt`, `*.bat`, and any `.claude/`. Fix: copy the "local only"
section of `.gitignore` into `.assetsignore`, or point Wrangler at `out/` after
`build-public.mjs`. Note that `build-public` omits `garage.html`/`prototype.html`, which
`index.html` links to, so on the OpenAI host those links fall back to the SPA page.

### SR-16 Low - Hygiene
- Dead `loadProgress/saveProgress/resetProgress` in missions.js still write legacy
  `aylmer.progress`. Delete them.
- Legacy `aylmer.progress/best/garage` are never removed after migration. Remove them after a
  successful stamp.
- The comment at main.js:1651 says autosave has "exactly two events". There are eight call sites
  (job, midnight, upgrade, bodywork, paint, restore, kijiji, famous). The options text should
  match.
- `store.js` header (:13) still documents `aylmer.save.1/2/3/auto`, the v1 names.
- The prototype wrapper's `key()`/`length` scan `Object.keys(realStorage)` on every call. Harmless
  but O(n).

## 4. Suggested order
SR-03 and SR-01 first (data loss, cheap fixes), then SR-04, SR-02, SR-08, SR-05/06/07. Each fix
should add its probe as a smoke assertion in `tools/smoke_save.mjs`.

## 5. Fix status (branch qr/save, 2026-09-29)

Regression suite: `node tools/smoke_storage.mjs` (one block per finding, run by `npm test`).

| Finding | Status | Where |
|---|---|---|
| SR-01 | fixed | `src/game/storage-ns.js` + `storage-boot.js` (loaded by index.html before main.js); harness pages use `?review=<page>`; any same-origin `/tools/` frame is isolated even without the flag |
| SR-02 | fixed | `tools/storage_guard.mjs`; tools run under `?review=<tool>`, `--wipe-origin` only on 8137-8199 / `AYLMER_TEST_PORTS` / `--i-mean-it` |
| SR-03 | fixed | `save.js migrateLegacy` write-verify-delete, stamp only on full success |
| SR-04 | fixed in save.js/garage.js | `readSlot` defaults `unlocks`; v1 slots take `aylmer.cars` once; mirror is per character. Belt-and-braces main.js patch below |
| SR-05 | fixed | newer slots never overwritten (`reason: 'newer'`), unknown fields kept |
| SR-06 | fixed in save.js | rows carry `corrupt: true` and a « illisible » name; bytes kept in `<key>.corrupt`. ui.js patch below renders it properly |
| SR-07 | hook done | `onSaveFailure`, `'aylmer:save-failed'` event, `storageHealth()`, `requestPersistence()`. HUD wiring = main.js patch below. Export/import not done |
| SR-08 | fixed in save.js | wipe clears `store.PROGRESS_KEYS`, blocks writes until `Garage.reset()`, `undoWipe()`. main.js patch below reloads after a wipe from pause |
| SR-09 | partly | the wipe now clears hangout/bestlap/modes; per-summer gifts need the hangout.js patch below |
| SR-10 | fixed for new saves | `missionSnapshot` rewinds to the grid / `def.resumeAt`; old saves need the main.js patch below |
| SR-11 | fixed | boot.js: session store + on-screen note |
| SR-12 | fixed | `radio-storage.js` merges pre-read writes and re-reads |
| SR-13 | fixed | `serve.sh --bind 127.0.0.1` |
| SR-14 | fixed | `?audioReview=1` isolates index.html; radio DB follows the namespace; radio-library page forces the flag |
| SR-15 | fixed | `.assetsignore` |
| SR-16 | partly | legacy keys removed after stamp; store.js header fixed. missions.js dead code and the main.js comment are not in this branch |

### Patches for files this branch does not own

**main.js (SR-07, toast on failed save).** After `G.autosave = autosave;`:
```js
onSaveFailure((e) => {
  if (G._saveWarned) return;
  G._saveWarned = true;
  hud.toast(e.reason === 'newer'
    ? 'Sauvegarde bloquée\ncette partie vient d’une version plus récente'
    : t('save.failed') + '\nle navigateur refuse d’enregistrer', 3600);
});
if (!storageHealth().ok) hud.toast('Stockage bloqué: rien ne sera gardé', 4000);
```
(import `onSaveFailure, storageHealth` from `./game/save.js`).

**main.js (SR-08, wipe from pause ends the summer).** In `optionsCtx().actions.wipeSaves`, after
`G.slot = null;`: `if (G.mode !== 'menu') { location.reload(); return; }` - the in-memory hangout,
race-record and garage objects would otherwise re-persist their keys on their next event.

**main.js (SR-04, belt).** In `enterDrive`, replace the two lines
`if (!save) garage.reset();` / `try { if (save && save.unlocks) garage.restore(...)`
with `if (!save || !save.unlocks) garage.reset(); else try { garage.restore(save.unlocks); } catch (e) { console.warn('unlocks', e); }`.

**main.js (SR-10, saves written before this branch).** In `resumeMission`:
```js
const at = Math.max(0, Math.min(stages.length - 1, saved.stage | 0));
const idx = resumeStage(def, stages, at);          // import from ./game/save.js
...
if (idx === at) { Object.assign(G.mission, saved.state || {}); if (saved.timeLeft != null) G.mission.timeLeft = saved.timeLeft; }
```

**hangout.js (SR-09, one gift per summer).** At the gift check (hangout.js:656):
```js
const given = Array.isArray(G.stats?.hangoutGifts) ? G.stats.hangoutGifts : [];
if (l.gift && G.wallet && G.stats && !given.includes(l.line)) {
  G.stats.hangoutGifts = [...given, l.line];
  // ...existing payout...
}
```
`G.stats` already round-trips through every slot and is reset for a new summer.

**ui.js (SR-06 / SR-05 rendering).** In `slotCell`, before the normal branch: if `r.corrupt`, render
`class="slot corrupt"` with meta « Sauvegarde illisible - une copie est gardée » and only the Delete
(and, in save mode, Save) buttons; if `r.newer`, hide the Save button.
