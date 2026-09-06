# Aylmer Madness — full review and asset pass (Gemini 3.8 Flash, Antigravity)

Paste everything below the line into a new Antigravity agent opened on the
`aylmer-madness` folder. It is one long task; the agent should work through it
top to bottom and leave a `STATUS.md` when it runs out of budget.

---

You are reviewing and supporting **Aylmer Madness**, a from-scratch WebGL2
open-world driving game set in the real Aylmer, Québec, in the **summer of
2004**. It is being built by Thomas for himself and about eight friends who grew
up there. No dependencies, no build step, plain ES modules, ~35,000 lines under
`src/`. The people in it are real, the streets are real, and the cars are the
actual cars people drove.

**The bar is high.** This has to be a beautiful, fun, engaging game that draws
you in: something you would keep playing if you had never heard of Aylmer,
that looks like a place at golden hour rather than a tech demo, that feels
good in the hands in the first ten seconds, and that makes you want to see what
happens tomorrow in the story. Recognising your own street is the bonus on top,
not the goal. Review it against that standard. "It works" is not praise here,
and a finding that would make it more beautiful or more absorbing ranks as
high as one that stops a crash.

You have a terminal, a browser you can drive and screenshot, the whole repo, and
(if your build has it) image generation. Use all of them. Your value here is
that you can **play the game and look at it**, not just read the code.

## The one hard rule: you do not edit the game

- **Do not modify any existing file.** Nothing in `src/`, `tools/`, `docs/`,
  `assets/`, `index.html`, `style.css`, `README.md`. Not a typo, not a one-line
  fix, not a test. You are producing a report and new assets; a human and
  another agent will apply changes.
- **Git is read-only for you.** `git log`, `git diff`, `git blame`, `git show`
  are fine. No `checkout`, `switch`, `stash`, `commit`, `add`, `push`, `reset`,
  `clean`, no branch changes of any kind. Another session's work is on this
  branch. Record the branch and commit you reviewed at the top of your report:
  `git branch --show-current && git rev-parse --short HEAD`.
- **Everything you produce goes under a new top-level folder `gemini-inbox/`.**
  New files only. Start with `gemini-inbox/INDEX.md` listing what is there.
- **Do not run more than one headless browser at a time**, and check `uptime`
  before trusting any timing or memory number. This machine has been driven to
  load average 30 by parallel agents before, and every measurement taken under
  load was garbage. Above load 8, re-measure later and say so.
- Serve the game on **port 8151**, not 8123 (another process may hold 8123):
  `python3 -m http.server 8151 --bind 127.0.0.1` from the repo root. ES modules
  refuse to load over `file://`.
- `data/raw/reference/` holds **photographs of real people** and is gitignored on
  purpose. You may look at them to judge the avatars. Never copy them, never
  include them in anything you write, never describe anyone's appearance beyond
  what is needed to say whether the avatar matches.

## Read these first, in this order

1. `docs/PLAN.md` — the five-wave plan, the non-negotiable rules, the settled
   decisions from Thomas. **Do not re-litigate the settled decisions**; review
   against them.
2. `docs/VERIFY.md` — "the four ways this project lies to you." Every rule there
   came from a real failure. The most important: **no test imports
   `src/main.js`**, so all 27 suites can be green while the game does not load.
3. `docs/NEXT.md` — the playtest backlog, the cast, the Street View corrections.
4. `docs/PLAYTEST.md` — a prior start-to-finish playtest with a numbered table.
   Several rows are still open; you will re-test them.
5. `README.md`, `CONTRIBUTING.md`, `BACKLOG.md`.
6. Then `src/main.js` and `src/game/*.js`. You have the context window for all
   of it; read all of it before you write a single finding.

## What is settled (so you do not waste findings on it)

- **Setting**: Aylmer, summer 2004. Nothing after Labour Day, Monday
  6 September 2004, exists. Player-facing text is **Québécois French** (joual,
  Outaouais register), except in Ottawa, where it switches to English and the
  people are proper and serious. Crossing the river is a deliberate seam with a
  loading-card moment, GTA-style.
- **The cast are real people. Never invent a surname or a fact about them.**
  Tom (the player, 299 chemin Fraser, white 1993 Ford Ranger **XL** — base trim,
  2.3 four-cylinder, five-speed, not an XLT). Sayyad (75 rue Denise-Friend,
  1988 Civic Si, Hawaiian shirts, chrome cruiser bicycle; in 2004 no glasses, no
  grey hair, slim). Zahra (Sayyad's sister, **15**, at Symmes). Margaret
  (1997 Saturn SL; 2004: slimmer, dark brown hair). Adam Actell (Sunfire,
  Deschênes, out of town). Mike McDonald (129 avenue Frank-Robinson, green
  1998 Subaru Forester, huge front-yard tree with a couch in it; **Mike is the
  only character allowed to make a speech**). Russell (16, 1 rue Arial,
  skateboarder, fixes cars *with* Tom in the detached garage; charges pizza and
  beer for labour, parts cost money). Russ's dad (fifties, moustache, work
  jacket). Norm Lafleur (the paid garage, on the map). Abraham (841 boulevard
  Wilfrid-Lavigne, guitar, beaten-up ~5-year-old Toyota Sienna). Tyler Yank
  (~312 rue Samuel-Edey, lives with her aunt, Chevy Cavalier). Rob French
  (drives in from out of town, leaves first). Birthdays: Tom 23 July, Zahra
  14 April, Sayyad 2 May, Mike 20 September.
- **Playable**: Tom, Sayyad, Zahra, Mike, Abraham. Separate saves per
  character, each from the beginning. Tom is the only one with a truck; each
  character's car is *their* car and drives differently.
- **The spine** (Wave 2, not built yet): an envelope of cash toward leaving for
  university, a days-remaining calendar to Labour Day, 18 jobs in
  `assets/text/campaign.json`, and an ending where the father counts the money,
  pushes it back, and hands over the keys and the signed registration.
- Thomas attended Philemon Wright and Heritage College, **not Symmes** (Zahra
  goes to Symmes). Do not assume otherwise.
- Internal ids `steph`, `marc`, `dave`, `racedave` are historical. They must
  never appear on screen.

## How to boot and drive it

- Menu is **two clicks**: click `#start`, wait ~400 ms, click `#startconfirm`.
  Clicking only `#start` and polling for drive mode hangs forever.
- A fresh game opens a modal story card that swallows driving keys. Escape
  closes it.
- The page exposes `window.AYLMER = { G, step, render, teleport, save, load,
  resetCars }`. `G.mode === 'drive'` means you are in. `teleport(x, z)` moves
  the car. Map coordinates for places are in `src/game/places.js`.
- `index.html?drive=ottawa` is a dev chauffeur that drives Aylmer ↔ Parliament
  Hill on the GPS route forever. Use it for the memory soak.
- Headless harness: `node tools/headless.mjs <url> <seconds> <shot.jpg>
  [--fresh] [--script s.js] [--menu]`, which needs a Chrome on port 9222
  (`--headless=new --remote-debugging-port=9222 --use-angle=swiftshader
  --enable-unsafe-swiftshader`). Memory tool: `node tools/measure_memory.mjs`.
  Your own Antigravity browser is fine too, and better for looking.
- Suites: `for t in tools/smoke*.mjs; do node "$t" >/dev/null 2>&1 && echo "ok $t"
  || echo "FAIL $t"; done`.
- Keys: W/S throttle-brake (hold S for reverse), A/D steer, Space handbrake,
  Shift look back, C camera, Tab map (click drops a waypoint), N minimap size,
  E/Enter take a job or buy or borrow a car, Q cycle jobs at a marker,
  Backspace abandon, R radio, M modes, V weather, K Kijiji, T put the car back
  on the road, H horn, 0 mute, F5 quick-save, `?` key legend, Esc pause.
  Verify this list against the code; the legend has drifted before.

---

# PART A — The review

Deliverable: `gemini-inbox/REVIEW.md`. One ranked list of findings, plus the
sections below. Every finding uses this template, no exceptions:

```
### A-017  Traffic uses the left lane on one-way ways read as two-way
Severity: bad          (blocker / bad / annoying / cosmetic)
Where: src/game/traffic.js:412 laneAt()
Repro: teleport(…), wait 20 s, watch northbound cars on chemin d'Aylmer
Evidence: gemini-inbox/shots/a017-traffic.jpg, console excerpt below
Suspected cause: …
Suggested fix (do not apply): …
Confidence: high / medium / low
Also affects: buses.js wantOn()
```

Severity means: **blocker** — a new player cannot get past it or the game
crashes / reloads; **bad** — it breaks the fiction or a feature visibly;
**annoying** — a player notices and sighs; **cosmetic** — a player would not
notice unprompted. Rank the whole list by severity, then by how early a new
player meets it. A finding without a repro or evidence is a guess; label it as
such in a separate "Suspicions" section rather than mixing it in.

## A1. Confirm or deny the known bugs first

Reproduce each of these with evidence before you go looking for new ones. For
each: **confirmed / not reproducible / fixed on this branch**, with the shot.

1. Traffic and buses drive on the wrong side of the road (`traffic.js`
   `laneAt` / `wantOn`; suspect the lane-offset sign for one direction, or
   one-ways read as two-way).
2. Camera jitters over bumps and under acceleration at speed (suspension
   feeding `camPitch`; chase-cam position lerp `dt * 9` ringing at 180 km/h).
3. Both buses bog to 1.3 km/h on grass.
4. `SURF.path` gives footpaths no speed penalty; the Ranger does 149 km/h on one.
5. The « Poutine express » destination does not visibly exist at the Galeries.
6. Save mid-job then load drops the job silently (PLAYTEST #11).
7. Pressing E when broke does nothing visible (PLAYTEST #18).
8. `assets/radio/playlist.json` and `assets/cars/*/*.png` 404 on every boot,
   ~30 lines of console noise (PLAYTEST #22, #38).
9. The golf cart job is a 25-minute crawl (PLAYTEST #33).
10. No along-slope gravity term for any vehicle (PLAYTEST #34).
11. Club de Golf Gatineau's clubhouse renders as three roofless slabs (#36).
12. The Ranger measures 2.12 m wide because XLT mirror heads draw under
    `noMirrors` (#37) — and it is an XL, which should not have chrome mirrors.
13. Memory: heap was 1057 MB on `main`; this branch claims 148 MB at the driveway
    and 169 MB in Hull/Ottawa via sector gating (`src/game/sectors.js`). Verify
    with `tools/measure_memory.mjs` on a quiet machine, and then do the thing
    the tool does not: a **twenty-minute soak** with `?drive=ottawa`, sampling
    `performance.memory.usedJSHeapSize` every 30 s. If it climbs without a
    plateau, find the per-frame allocation.
14. The Champlain Bridge "invisible wall" was the river polygon under the deck
    (`5100c3c`). Drive the bridge both ways at speed and confirm. Also the
    Alexandre-Taché causeway.

## A2. Static review of the code

Read everything, then look specifically for:

- **Sector gating edge cases** (new, least tested): cross a sector boundary at
  180 km/h; a mission target or a parked friend's car inside a sector that has
  been freed; traffic and cops spawned in a sector that then unloads; save in
  Ottawa, reload, and see which sectors are resident; two sectors loading at
  once on the bridge; what happens to `G.parked` when a sector is freed and
  rebuilt; GPU buffers actually freed (`renderer.gpuBytes` before/after).
- **Per-frame allocation** in `step()`/`render()`: array literals, closures,
  `Float32Array` creation, string concatenation in the HUD, `Object.keys` in
  hot loops. Point at the line.
- **Event-listener and timer leaks** across new game / load / pause / options
  / seam card / mode changes.
- **Save/load completeness**: what state is in `save.js` and what is not
  (mission in progress, upgrades, weather, time of day, money, unlocks,
  per-character slots, Kijiji state, radio station, best times). Enumerate.
- **Keybinding collisions**: `grep -rhoE "'Key[A-Z]'" src/main.js src/game/*.js
  | sort | uniq -d` must be empty, and also check `Digit*`, `Escape`, `Tab`
  handled in more than one place (Esc used to open *and* close the pause menu
  on the same press).
- **i18n**: English strings in the FR table, FR strings in the EN table,
  keys used in code but missing from the table (grep `t('` and compare),
  France-French where joual belongs, and any English that leaks into the
  Aylmer side or French into the Ottawa side.
- **Shader risks**: precision mismatches between stages, backticks inside GLSL
  template literals, uniforms set but never declared, `discard` in hot paths,
  anything that depends on `OES_` extensions without a check. Safari WebGL2 is
  stricter than Chrome; call out anything Safari-specific.
- **Physics and feel**: reverse, handbrake, airborne pitch, the jump ramps
  (`jumps.js`, `stunts.js`), landing damage, the off-road model per surface,
  bikes (`bikes.js`) and the bus (`buses.js`) — anything where the numbers
  cannot produce the behaviour the comment promises.
- **Mission kit**: stages that can never complete, triggers whose radius is
  smaller than the parking geometry allows, timers that are impossible at the
  vehicle's top speed over the real road graph (measure distance over
  `nav.route`, do not eyeball), destinations that repeat back to back.
- **Economy**: can the player get stuck with no money, no fuel, no way to earn?
  Can any loop mint unbounded cash (repair-sell, race rewards, Kijiji flips)?
- **Dead code and duplicate systems** (there are two houses implementations,
  `materials.js` and `materials_stub.js`, lab HTML pages). Say what is dead and
  what is a real second path.
- **Console hygiene**: every warning or error on a clean boot, with its source.

## A3. Play it like a new player, and screenshot as you go

Deliverable: `gemini-inbox/PLAYTEST-GEMINI.md`, same table format as
`docs/PLAYTEST.md`, plus shots in `gemini-inbox/shots/`. Cold start, fresh
storage. Do it in your browser, at a normal window size, and look at every shot
before you write the row. Cover:

1. The main menu: is it obvious what to click? Can you read every panel at
   1280×800 and at 1440×900 without scrolling traps? Options, car cards,
   character choice, start points.
2. Tutorial, all cards. Does each card say what unblocks it?
3. The first three jobs in order. Time each against its timer with an honest
   drive, not a bot. Note where you got lost, what the GPS did, and what the
   destination looked like when you arrived. If it looks like nothing, say so.
4. Borrow a friend's car; drive each of the nine vehicles for two minutes and
   describe how each *feels* different, or does not.
5. Go to every house in the cast list above. For each: a screenshot, and a
   comparison against `assets/text/streetview.json` and
   `assets/text/streetview_pack.json` (2009 panoramas, the closest thing to
   2004 that exists). Colours, storeys, roof shape, porch, the big tree.
6. Philemon Wright, Symmes, Heritage College, the Galeries (there should be a
   Zellers), rue Principale storefronts, the marina, Plage des Cèdres, Norm's,
   Russell's, the used lot, the Petro-Canada, Club de Golf Gatineau, the jumps.
7. Cross the Champlain Bridge to Ottawa. The seam card. Parliament Hill, the
   Château Laurier, the Rideau Canal, Place du Portage on the way back. Does
   the language switch? Do the pedestrians change?
8. Race mode (M), Blitz, Checkpoint, Cruise. Can a new player find them?
9. The radio (R), each station, the slang translation hotkey, weather (V),
   time of day, Kijiji (K), the garage and upgrades, the police.
10. Save, quit, reload, and diff what came back against what you had.
11. Pause menu and every tab at both window sizes.
12. Then twenty minutes of just driving, watching heap and frame time.

For each row: what a player sees, what they expected, severity, and the shot.
Finish with **"The ten things a new player notices first"**, in order, in one
sentence each. That list is the most valuable thing in the whole report.

## A4. Audit the written content

Deliverable: `gemini-inbox/CONTENT-AUDIT.md`. `assets/text/` holds ~1,900
entries across ~25 JSON files, most of them written by a previous Gemini run.
Some are wired into the game and some are not (see `docs/PLAN.md`, "Written and
unwired"). The previous run was confidently wrong in specific ways: it invented
a surname for Sayyad, used real radio call signs that did not match the game's
own stations, described the 1831 Symmes Inn as the school, and dated the Maman
sculpture to 2004 when it was acquired in 2005. **Validate programmatically,
then read.**

- Schema and counts per file; every `to` / `place` / `poi` key resolves to a
  real entry in `places.js` or `MAP.pois`; every character name is on the cast
  list and has no surname that Thomas did not give; every radio station matches
  `radio.js`.
- **Anachronisms**: anything from after September 2004 (songs, phones, cars,
  businesses, slang, prices, the Expos leaving, the Sens roster, Facebook).
  Give the line and the year the thing actually appeared.
- **Register**: France-French where joual belongs; English idiom translated
  literally; a sacre used wrong; anyone but Mike making a speech.
- **Repetition**: the same joke or destination twice in a row in
  `campaign.json`; heckles that duplicate; storefronts that do not exist on
  that street.
- **Russell**: `russell.json` still frames labour as a 50 % discount. It should
  be pizza and beer, literally, as an item you fetch. Flag every line that
  gets this wrong.
- The `changedSince` fields in the two Street View files against what the game
  currently renders (tie back to your A3 shots).
- **A conflict for Thomas, not for you**: `streetview_pack.json` says the
  Champlain Bridge's separated cycling path was added in a recent rebuild;
  Thomas remembers riding it in 2004 after a 2002–03 NCC rebuild. Research the
  NCC's Champlain Bridge rehabilitation history and report the evidence with
  dates and sources. Do not pick a side.

## A5. Audit the tests

Deliverable: `gemini-inbox/TESTS-AUDIT.md`. For each of the 27 suites: what it
actually asserts, what it would *not* catch, and whether any assertion looks
loosened to get green (`git log -p tools/smoke_*.mjs` will show rebaselined
golden tables; say which look like a real physics change and which look like
someone chasing green). Then list the ten most valuable missing tests, each
with the exact behaviour it would pin and roughly how (through `window.AYLMER`,
through a module import, or only in a real browser).

## A6. What would make it beautiful, fun, and absorbing

Deliverable: a final section of `REVIEW.md` called **"What would make it
great"**. This section matters as much as the bug list. Twenty to thirty items,
each one paragraph: the change, what it does to the player's experience, and
roughly how hard it is in *this* codebase (name the files). Cover, explicitly:

- **Beauty**: what stops it looking like flat-shaded geometry. Materials,
  lighting, sky and time of day, shadows, fog, reflections on wet road, the
  water, trees that read as trees, a golden-hour look. Say which are cheap in
  a single-shader WebGL2 engine and which are not, and what the best possible
  version looks like within this engine's constraints.
- **Feel**: the first ten seconds in the driver's seat. Throttle response,
  weight transfer, the sense of speed, camera, sound, the handbrake, landing a
  jump. Compare against Midtown Madness, Burnout, and GTA: San Andreas (2004),
  and say specifically where this falls short and what number or curve to
  change.
- **Draw-in**: why someone keeps playing at minute two, minute ten, and day
  two. Onboarding, the first job, what the game promises early and when it
  pays it off, discovery, secrets, the story's hook, what the calendar and the
  envelope should feel like, why a player would come back tomorrow.
- **Life**: what makes the town feel inhabited rather than empty. Pedestrians,
  traffic behaviour, events, ambient sound, radio, weather, the friends
  reacting to what you do.
- **Signature moments**: five things this game could do that no other driving
  game does because it is Aylmer in 2004, concretely enough to build.

Rank them by how much they would change the experience per day of work. Be
specific to Aylmer and 2004; "add more polish" is not a finding.

---

# PART B — Things you can make that nobody else here can

Do Part A completely before any of this. Each item is independent; do them in
order and stop when you are out of budget. **New files only, under
`gemini-inbox/`. Do not wire anything into the game.**

## B1. Car skins (image generation)

The engine builds a car mesh from four orthographic PNGs; the spec is in
`assets/cars/README.md` and prompts in `assets/cars/GEMINI-PROMPTS.md`. None
have been made. Produce `gemini-inbox/cars/<slug>/{side,top,front,rear}.png`
for as many of these as you can, exactly to that spec (plain white
background, true orthographic elevations, nose LEFT, no shadow, 2048 px wide,
consistent scale across the four views):

`ranger` 1993 Ford Ranger XL regular cab, white, black steel wheels, black
plastic mirrors and bumpers, no chrome, whip antenna · `saturn` 1997 Saturn SL
4-door, blue · `civic` 1988 Honda Civic Si hatchback, red · `sunfire` 1997
Pontiac Sunfire coupe, teal · `forester` 1998 Subaru Forester, green ·
`sienna` 1999 Toyota Sienna, faded, one mismatched hubcap · `cavalier` 1991
Chevrolet Cavalier Z24, red · `cutlass` 1987 Oldsmobile Cutlass Ciera, brown ·
`caravan` 1988 Dodge Caravan, two-tone · `f250` early-1990s Ford F-250, two-tone
· `orion` Orion I city bus, STO livery · `newlook` GM New Look "fishbowl" bus,
STO 2004 livery · `bluebird` Blue Bird school bus, yellow.

If your build cannot generate images, write the exact prompts you would have
used into `gemini-inbox/cars/PROMPTS.md`, one block per view per car, and move
on. Do not spend more than a quarter of your budget here.

## B2. Material tiles for the atlas

`assets/materials/atlas.png` is a single 2048² atlas built by
`tools/make_atlas.py`; the shader multiplies the texture into the vertex colour,
so tiles must be **albedo only** (no baked lighting, no shadows), **seamlessly
tileable**, 512², PNG. Produce `gemini-inbox/materials/<name>.png` plus a
`manifest.json` giving, per tile, `metresPerTile` (real-world repeat) and a
one-line note. Needed, in priority order: red-brown brick (Tom's, Mike's), beige
brick, white vinyl siding, olive-green clapboard (Sayyad's 2004 colours),
weathered brown wood shakes (Mike's dormer), charcoal asphalt shingle,
red-brown asphalt shingle, worn asphalt road, concrete sidewalk with brick
banding (rue Principale), gravel driveway, cut grass, long grass, cedar hedge,
sandstone and limestone (Parliament), grey concrete (Place du Portage), Aylmer
1970s storefront stucco, 2004 STO bus-shelter glass. Same fallback as B1 if you
cannot render images: prompts into `PROMPTS.md`.

## B3. Sound design

You cannot produce audio, but the game does not use samples anyway: every
engine is synthesised in Web Audio (four-stroke pulse train at the firing
frequency, intake hiss, exhaust rasp, rev limiter, overrun pops, five-speed
ratios — see `docs/audio/README.md` and the audio code). Write
`gemini-inbox/audio/SOUND-DESIGN.md`:

- Per vehicle, the acoustic facts a synthesiser needs: cylinder count and
  firing order, idle rpm, redline, exhaust character, notable rattles (the
  Cavalier above 55, the Ranger's 2.3), the GM New Look's Detroit Diesel 6V71
  two-stroke drone and air-brake sigh, the Blue Bird's gas V8, a chrome cruiser's
  freewheel click, a Diamondback's chain slap.
- Ambience by place and hour: cicadas in July, the marina halyards, the beach,
  the bridge's expansion joints at speed, Parliament's carillon on the hour,
  a Hull construction site, an STO bus stop.
- A prioritised list of the ten sounds most missing from what you heard in A3.
- `SOURCES.md`: CC0 / public-domain recordings that could stand in for anything
  that is better sampled than synthesised, with the URL, the licence, and what
  it would be used for. Do not download anything.

## B4. Seam cards and key art

Thomas wants the Aylmer ↔ Ottawa crossing to be an event: a loading card with
an illustrated landmark, GTA-style. Produce, if you can render images,
`gemini-inbox/art/seam-{ottawa,hull,chelsea}.png` (Peace Tower over the river;
the Portage towers; the Gatineau hills up the 105), 1920×1080, painterly, summer
evening, no text, no people's faces. And `title.png`, key art for the main
menu: a white Ranger on chemin d'Aylmer at dusk. Prompts to `PROMPTS.md` as a
fallback.

## B5. The story, as a critic

Read `assets/text/story.json`, `campaign.json`, `arc.json`, `hangout.json`,
`russell.json`, `zahra.json` against the settled spine above and against what
you saw in A3. Write `gemini-inbox/story/STORY-NOTES.md`: where the eighteen
jobs sag, which ones are the same errand twice, where the stakes go missing
between job 6 and job 14, whether the ending earns itself, whether each
character has one thing only they would say, and where an Aylmer-specific
detail could replace a generic one. Borrow structure from good coming-of-age
stories if it helps, but everything has to feel like it happened on chemin
d'Aylmer. If you believe you can do materially better, put a complete
`campaign.v2.json` beside the notes, same schema, with a `changes` array at
the top saying what moved and why. Do not touch the original.

## B6. Multiplayer: a design, and a proof of concept if it costs nothing

Thomas asked how hard multiplayer would be. Write
`gemini-inbox/multiplayer/DESIGN.md`: for *this* engine (single `G` state,
`step`/`render` loop, chunked baked world, sector gating), what "eight friends
in the same Aylmer" would need. Compare a WebSocket relay against WebRTC with a
signalling server; what free hosting fits (Cloudflare Workers with Durable
Objects is available to Thomas); what state to send (position, yaw, speed,
vehicle id, horn) at what rate; interpolation; who owns traffic; what happens
at a sector boundary; how the seam card behaves when a friend is already
across; a realistic estimate of the work in days for one agent.

Then, **only if it can be done without modifying a single existing file**:
a proof of concept under `gemini-inbox/multiplayer/poc/` — a wrapper page that
loads the game in a same-origin iframe, reads `contentWindow.AYLMER.G`, and
exchanges positions through a tiny Node relay, drawing the other players on the
game's own minimap canvas or as a DOM overlay. It does not need ghost cars in
the 3D world. If it needs even one edit to `src/`, stop and write down exactly
which hook you would need instead.

## B7. Aylmer, summer 2004: a fact pack

Deliverable: `gemini-inbox/research/AYLMER-2004.md`. With sources and a
confidence per line. What was actually on rue Principale and chemin d'Aylmer in
2004 (Zellers at the Galeries is confirmed; what else); STO's 2004 fleet and the
routes that served Aylmer; the local radio stations' 2004 frequencies and
formats (validate the game's stations in `radio.js`); gas prices that summer;
what was on at the Cinéma at the Galeries; the Expos' last season; the June 28
federal election; Bluesfest 2004; Canada Day 2004; the weather that July and
August; what a 17-year-old in Aylmer would have had in the CD wallet. Flag
anything in the game that contradicts what you find.

---

# When you are done, or out of budget

Write `gemini-inbox/STATUS.md`: which parts are complete, which are partial,
which you did not start, the branch and commit you reviewed, the load average
during your measurements, and the three findings you would fix first if you
were allowed to. Then update `INDEX.md`.

Be blunt. The people who will read this built the thing and would rather hear
that the poutine place does not exist than that the game "shows promise".
