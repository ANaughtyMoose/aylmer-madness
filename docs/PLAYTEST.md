# Playtest — a new player, start to finish

One pass through the game the way somebody who has never seen it would: new
game → tutorial → first job pillar → drive « Première période » → borrow a
friend's car → save/load → the map → the police → the garage → the used lot →
the side jobs → the races → the radio → the options → and the new golf cart.

Everything below was run against the real game in headless Chrome
(`node tools/headless.mjs http://localhost:8143/index.html … --script …`),
driving with dispatched `KeyboardEvent`s through `window.AYLMER`. Where a leg
had to be *driven* rather than teleported (the school run, rolling up to a job
pillar, rolling up to the cart) a pure-pursuit bot followed `nav.route` the way
`race.js`'s rivals do. Screenshots are in `docs/shots/playtest-*.jpg`.

**Owner** is who should act on it: `feel` (the driving-model agent), `story`
(mission and UI text), `qa-fixed` (fixed on this branch), `open` (nobody's yet —
needs a call).

---

## The table

| # | Step | Result | Severity | Owner |
|---|---|---|---|---|
| 1 | Main menu, new game | 9 car cards, 8 locked with a reason, turntables render on all 9. The Club's cart is card 9 and is unlocked from the first frame. | — | ok |
| 2 | Tutorial, cards 1–4 | W / A-D / S / Espace each wait for the player to actually do it (W past 12 km/h, steer past 0.35, brake *while moving*, handbrake *above 12 km/h*). All four fired. | — | ok |
| 2b | Tutorial, the handbrake card | It will not clear if you pull the handbrake standing still, and nothing on the card says "while moving". Easy to think it is broken. | cosmetic | story |
| 3 | HUD, free roam | The objective line reads **“Free roam”** in the French build — `i18n.js:110`, the FR table has the English string. Every other line around it is French. (`playtest-01`, `playtest-07`) | annoying | story |
| 4 | First job pillar | Prompt « ⏎ Première période · Q pour une autre job » appears inside 12 m and clears outside it. **Q** cycles the four jobs that share 299 Fraser. | — | ok |
| 5 | Taking a job with E while rolling | Pressed at 8 km/h: the job started on the same frame. E and ⏎ both work, exactly as the legend says. | — | ok |
| ~~6~~ | « Première période », driven — **stale: timer is now 420 s in `missions.js`** | Bot drove it in **99.4 s of the 130 s** timer, +$20. `tools/timers.md` puts the leg at 1 925 m — a 53 km/h door-to-door average in a 131 km/h truck. Fair, but it is the first thing a new player ever does and there is no margin for one wrong turn. | annoying | open |
| 7 | Intro card | 2 s of title / brief / clock / route preview, clock held. On a 17 m first leg the route preview is two dots on an empty canvas. | cosmetic | open |
| 8 | Margaret's Saturn | It is **not there** until « Ramasser la gang » is finished — the car and the job that unlocks it are the same beat, so "take the Saturn, then start the gang job" is not a thing a new player can do in that order. Working as designed; noting it because the README reads the other way round. | cosmetic | open |
| 9 | Taking the Saturn with E | « E — prendre le 1997 Saturn SL 4-door de Margaret ». Swaps, and the Ranger stays exactly where you stepped out of it. | — | ok |
| 10 | « Ramasser la gang » re-plans | 5 stages in the Ranger (bench), 4 in the Saturn, 5 in the golf cart. | — | ok |
| 11 | **Save mid-job, then load** | The slot does not carry a job in progress. Loading dropped « Ramasser la gang » at stage 1 and put the player back in free roam **with no warning either way**. | annoying | qa-fixed (warning) / open (real fix) |
| 12 | **Esc to resume** | **Esc never resumed the game — 6 tries out of 6.** The DOM keydown listener closes the pause menu, then the very next frame `handleKeys()` sees the same press and re-opens it. Only the « Reprendre » button worked. Pre-existing on `main`. | **blocker** | qa-fixed |
| 13 | Tab, the full-screen map | Opens, arrows pan (156 m in 0.3 s), +/− zooms 0.45→0.63, a click drops a waypoint (« Waypoint placé »), Tab closes it, and the GPS line re-plans to the waypoint. All 15 job pins draw. (`playtest-04`) | — | ok |
| 14 | N, minimap size | Cycles 200 m ↔ 340 m cleanly, toast « Minimap — grand / petit », and it is the same setting as the Options one. | — | ok |
| 15 | Run a red | « T'as brûlé un feu rouge », heat 1, one cruiser inside 2 s. Forced to 3 stars: two cruisers, roadblock toast « TROIS ÉTOILES — Y ont bloqué la rue en avant. » (`playtest-05`) | — | ok |
| 16 | Repairs at the Petro-Canada | Pull onto the forecourt → « Reste là cinq secondes, on te r'garde ça » → 5 s later damage 87 → 0, « Comme neuf. » | — | ok |
| 17 | The used lot with $0 | Every car's prompt says the price **and** what you are short: « E — acheter 1987 Oldsmobile Cutlass Ciera · 300 $ (il te manque 300 $) ». The bus says « pas avant 10 jobs — encore 10 ». With $260 the Caravan sold and the wallet went to $10. (`playtest-06`) | — | ok |
| 18 | Pressing E when broke | Nothing audible or visible happens — the refusal is toasted, but the toast queue is usually already holding two older messages, so in practice you press E and the game does nothing. | cosmetic | open |
| 19 | « Le canot à 45 piasses » | Intro card, then a held-E purchase gated on the wallet: at $10 the prompt becomes « Quarante-cinq piasses. T'en as pas quarante-cinq. Va tondre des gazons. » Bought at $80 → $35 and the stage advanced. | — | ok |
| 20 | Backspace, abandon | Drops the job, clears the objective back to free roam, cleans up the stage's props. | — | ok |
| 21 | Race countdown | Grid stage « E — « trois, deux, un » », rival spawned, then « — 3 — », « — 2 — », « — 1 — », GO in the prompt line. Borrowed rival cars go back to `G.parked` on abandon. | — | ok |
| 22 | Radio, R | R → CKOI 102.1 with a track name in the HUD; R again → off. **The cassette step is skipped** because `assets/radio/playlist.json` is a 404, but the legend and the README both say « CKOI / cassette / off ». | cosmetic | open |
| 23 | Options, both copies | All four sections render in the pause tab and on the main menu. Picking « Basse » re-seeds drawDist 720→520, render scale 0.85→0.68, fog 1.45→2.0. FR↔EN retranslates the pause tabs, titles and menu live. Sliders apply on `input`. | — | ok |
| 24 | Esc flows | Esc opens the pause menu; Esc closes it (**after the fix in #12**); Esc closes the Options overlay and the Charger screen; Esc closes the map. « Le garage » returns to the main menu with the car list rebuilt. | — | ok |
| 25 | Pause menu job list | All **15** jobs, each with ✓ / ·, its brief, where it starts and the best time. Clicking a row drops a waypoint on it and unpauses. (`playtest-03`) | — | ok |
| 26 | Audit: KEYMAP vs `handleKeys` | Every cap in the legend is handled: W/S/A/D/Espace in `input.js`, Shift · C · Tab · N · +/− · E/⏎ · Q · ⌫ · T · H · R · 0 · Esc · ? in `handleKeys`, F5 on the window listener. Nothing in the legend is dead and nothing handled is missing from the legend. | — | ok |
| 27 | Audit: PLACES used by missions | All 19 keys every stage names exist. All **15** givers route from home over the real graph (15 m … 3 161 m). | — | ok |
| 28 | Audit: dead PLACES key | `marc` (« 27 Bancroft », commented *unused now*) was referenced by nothing. Removed. | cosmetic | qa-fixed |
| 29 | Audit: « Steph » / « Marc » | No player-facing string anywhere in `src/`. The only hits were in the generated `tools/timers.md`, which was stale — regenerated. | cosmetic | qa-fixed |
| 30 | **The golf cart** | Parked on the clubhouse apron, 17.1 m off the job marker so « E — prendre le Cart de golf du Club » and « ⏎ Le cart du Club » are two different prompts. 24.2 km/h flat out, 2.4 × 1.2 × 1.8 m, 400 kg, 832 tris. (`playtest-07`) | — | ok |
| 31 | The cart on turf | Grip 0.79 on grass and 0.97 on a path against 0.55 on tarmac, and turf costs it no top speed (24.2 km/h on grass, path and sand). Gravel is not turf and still cuts it to 15 km/h. (`playtest-08`) | — | ok |
| 32 | « Le cart du Club » | 3 stages from a car (fetch a cart → the beach → back), 2 if you already took the cart with E. Finishing in anything else is refused with « Le marshal compte les carts, pas les chars. » Pays $25, swaps you back into the car you arrived in and re-parks the cart on the apron. | — | ok |
| 32b | The cart's menu card | It says « 3 places » — the card prints `seats + 1`, and the cart carries `seats: 2` because that is what makes « Ramasser la gang » re-plan into two trips like the Ranger's bench. The bench really has two places. Same off-by-one the Ranger has had all along. | cosmetic | open |
| ~~33~~ | **The cart job is 25 minutes long** — **stale: `golfjob.js` now drops at the Aigle and `BACK_TIME` is 360 s** | Measured over the road graph: **9 979 m**, of which the return leg alone is 4 979 m — 773 s at the cart's 24 km/h *flat out with no traffic*. The brief asked for “generous, 6 min”; six minutes is not generous here, it is impossible, so the marshal timer shipped at a measured 1 200 s. The job works; it is just a very long crawl. **Needs an owner call**: move the drop-off to somewhere within ~1 km of the clubhouse and 360 s works as written (one constant, `DROP`, at the top of `golfjob.js`). | **blocker** (design) | open |
| 34 | Reverse, and the cart downhill | Not touched — the reverse feel is FEEL's. Note for them: the cart's spec asks for “30 km/h downhill”, which the model cannot do — `Vehicle.update`'s longitudinal acceleration is engine + drag only, and a slope only writes `pitch` and `vy`. There is no along-slope gravity term for any car. | annoying | feel |
| 35 | Chase camera on a 2.4 m vehicle | `CAMS[0].dist` is 9.2 m, tuned for a 4.5 m car. Behind the golf cart it reads as watching a bug from across a fairway. | cosmetic | feel |
| 36 | Club de Golf Gatineau's clubhouse | Renders as three bare brown wall slabs with no roof, and the chase camera clips straight through them. Every other landmark in town is fine; this footprint is not getting an archetype. | cosmetic | open |
| 37 | `node tools/car_views.mjs` | Runs, draws the cart correctly (2.40 × 1.22 × 1.80 m, +0.1 % / +1.5 % / +0.0 %, wheels proud 0.070 m) and still exits 1 — because the **Ranger** measures 2.12 m wide against a 1.77 m spec: its XLT chrome mirror heads are drawn even under `{ noMirrors: true }`. Pre-existing, not touched. | cosmetic | open |
| 38 | Console on every boot | ~30 `404` lines for `assets/cars/*/*.png` and `assets/radio/playlist.json`. Both are optional by design, but a real error is now very easy to miss in the noise. | cosmetic | open |

---

## Fixed on this branch (`qa-fixed`)

- **Esc now resumes the game.** `Input` grew a `consume(...codes)` that drops a
  press so a second reader in the same frame cannot act on it; `main.js`'s
  window keydown handler calls it after closing the pause menu, the Options
  overlay or the Charger screen. Without it `handleKeys()` re-opened the menu on
  the next frame, every time.
- **Saving during a job says so.** The save toast now adds *« (la job en cours
  est pas sauvegardée) »* when `G.mission` is live. It does not make the save
  carry the job — that is a real feature — but it stops the silent loss.
- **`PLACES.marc` removed** (dead since the friends were renamed).
- **`tools/timers.md` regenerated** — it was the last place in the repo saying
  “Chez Marc” / “Chez Steph”, and it now covers the golf job too.
- **« E — prendre le Cart de golf du Club »** rather than «…du Club de Le
  Club »: a spec may now spell its own possessive with `whoDe`, or say it needs
  none with `whoDe: ''`.

## Left for somebody else

- `hud.freeroam` is untranslated in the French table (**story**).
- The handbrake tutorial card does not say “while moving” (**story**).
- Reverse feel, and no along-slope gravity for any car (**feel**).
- Chase-camera distance does not scale with the car (**feel**).
- « Première période »'s 130 s asks 53 km/h of a first-time driver (**open**).
- Saving mid-job silently drops the job (**open** — the slot shape would have to
  carry `mission.def.id`, `idx`, `timeLeft` and the stage's own state).
- The cassette step of **R** is invisible without `assets/radio/playlist.json`
  (**open**).
- The golf job is 10 km of driving at 24 km/h (**open**, and the one thing on
  this list that changes whether the job is fun).
- The clubhouse footprint renders as bare walls (**open**).
- The Ranger's mirrors ignore `noMirrors`, so `car_views.mjs` exits 1 (**open**).

## Screenshots

| file | what it shows |
|---|---|
| `playtest-01-start.jpg` | New game, tutorial card 2, the first job prompt — and “Free roam” in the French HUD. |
| `playtest-02-school.jpg` | Mid-drive on « Première période », 1:24 left on the clock at 83 km/h. |
| `playtest-03-pause.jpg` | The pause menu: all 15 jobs, ✓ on the one that is done, best times. |
| `playtest-04-map.jpg` | Tab: the whole town, every job pin, and a waypoint just dropped. |
| `playtest-05-cops.jpg` | Three stars, two cruisers on the chase. |
| `playtest-06-lot.jpg` | The used lot with an empty wallet — the prompt says how short you are. |
| `playtest-07-cart.jpg` | The golf cart on the clubhouse apron with its take-me prompt. The brown slabs behind it are the clubhouse (#36). |
| `playtest-08-cartjob.jpg` | Driving the cart across the fairway on « Le cart du Club », 20 km/h on grass. |
