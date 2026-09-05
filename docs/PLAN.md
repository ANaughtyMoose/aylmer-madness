# Aylmer Madness — execution plan

Written 2026-09-01 as a cold-start handoff. Read this, then `docs/VERIFY.md` (how to know a change worked — it is the
merge gate), then `docs/NEXT.md` for the raw playtest notes. You should not need to ask Thomas anything already
written down here.

---

## Where things are

- Repo: `~/Desktop/Coding Projects/aylmer-madness`, branch `main`, pushed to
  `github.com/ANaughtyMoose/aylmer-madness` (public, `main` protected: PR + 1
  approval, admin can bypass with `gh pr merge N --merge --admin`).
- **Live at https://anaughtymoose.github.io/aylmer-madness/** via GitHub Pages
  off `main`. Any push to `main` redeploys in ~2 minutes. Thomas emails this
  link to friends, so **do not break `main`**.
- Run locally: `./serve.sh` → http://localhost:8123. Never `file://`.
- Test: `for t in tools/smoke*.mjs; do node $t; done` — **26 suites, all green.**
- Real browser: start Chrome `--headless=new --remote-debugging-port=9222
  --use-angle=swiftshader --enable-unsafe-swiftshader`, then
  `node tools/headless.mjs <url> <seconds> <shot.jpg> [--fresh] [--script s.js] [--menu]`.

### Gotchas that will cost you an hour each

- **The menu is two clicks now.** A page script must click `#start`, wait ~400 ms,
  then click `#startconfirm` (a start point is pre-selected). Polling for
  `window.AYLMER.G.mode === 'drive'` after only clicking `#start` hangs forever.
- **No suite imports `src/main.js`.** All 26 can be green while the game is a
  syntax error and does not load at all. This has already happened once. After
  any change to `main.js`, boot it in a real browser.
- A fresh game opens a modal story card that swallows driving keys — dismiss
  with Escape before sending input.
- Shared shader uniforms need identical precision in both stages (fragment is
  `highp`) or ANGLE will not link. Never put a backtick in a GLSL template literal.
- Don't run more than ~3 headless Chromes at once. Ten concurrent agents took the
  machine to load average 30 and every browser verification silently failed.

---

## The rules (non-negotiable)

- **The people are real.** Sayyad (Civic, 75 Denise-Friend, Hawaiian shirts),
  **Zahra** (his sister, **15**, at Symmes), Margaret (Saturn, 299 Fraser),
  Adam Actell (Sunfire, Deschênes), Mike McDonald (129 Frank-Robinson),
  Russell (16, 1 rue Arial, skateboarder), Norm Lafleur (the paid garage),
  **Tom** (the player, 299 Fraser), **Abraham** (841 Wilfrid-Lavigne, guitar),
  **Tyler Yank** (~312 Samuel-Edey, lives with her aunt), **Rob French** (drives
  in from out of town). **Never invent a surname for any of them.**
- Internal keys `steph` / `marc` / `dave` / `racedave` are historical ids. Never
  show them to a player.
- **Only Mike gets to make a speech.** Everyone else gets a line and a shrug.
- All player-facing text is Québécois French. Setting is summer 2004 — nothing
  after it exists.
- Comments explain WHY, in the dry specific voice of the surrounding code.
- Reference photos are in `data/raw/reference/` and are **gitignored on purpose**:
  they are photographs of real people and the repo is public. Never commit them.

---

## How to run the work (fan-out, integration, and not breaking the live site)

**`main` is live.** GitHub Pages serves it to Thomas's friends within ~2 minutes
of any push. So:

- Never commit directly to `main`. Work on `wave/<n>-<name>`, open a PR, merge
  with `gh pr merge N --merge --admin` once the boot check passes.
- **`docs/VERIFY.md` is the gate.** Nothing merges to `main` that has not booted
  in a real browser and had its screenshot looked at.

**Fanning out.** Waves 3, 4 and 5 parallelise cleanly; Waves 1 and 2 do not.

| Wave | Agents | Why |
|---|---|---|
| 1 Memory | **1, alone** | Every step needs a real measurement, and concurrent Chromes make measurement meaningless |
| 2 Spine | **1** | One coherent system: meter, campaign, ending. Splitting it splits the design |
| 3 Verbs / races / characters | 3 | Verbs+missions · races+rivals · playable characters and skills |
| 4 Places and faces | 2 | Russell's (geometry + dialogue) · avatars (corrections + four new) |
| 5 Graphics | 2 | Materials atlas · lighting, AO and tone mapping |

**Rules for parallel agents**, learned the hard way:

- **Disjoint file ownership, stated explicitly in each brief.** Name the files an
  agent owns and the files it must not touch. Every collision today came from two
  agents editing the same file without knowing.
- **New modules over edits to `main.js`.** An agent gets *one* clearly-marked hook
  block in `main.js` and nothing more. Four of five merge conflicts were in that
  file.
- **Each agent claims its keybindings in its brief**, so two do not take `K`.
- **At most 3 concurrent headless Chromes** across all agents combined.
- Each agent works in its own `git worktree` off the wave branch; merge them
  sequentially with a full boot check after **each** merge.

**Integration.** After a wave's agents are merged, one integration pass:
regenerate any golden tables from the merged code, run the duplicate-keybinding
check, do the four-point memory measurement, boot in Safari, and only then PR to
`main`.

**The bar for "it just works":** a friend opens
https://anaughtymoose.github.io/aylmer-madness/ on a laptop they already own,
clicks GO twice, and is driving within fifteen seconds — no install, no account,
no crash after twenty minutes, and nothing on screen in a language the game does
not otherwise speak. If a change cannot survive that, it is not done.

---

## Wave 1 — Memory. Do this first, alone.

**Why first:** Safari kills the tab ("reloaded because it was using significant
memory"). ~1 GB JS heap + ~260 MB GPU buffers, all built up front. This is the
only thing currently stopping Thomas's friends from playing, and it is almost
certainly also the phantom "invisible wall" on the Champlain Bridge — 385 samples
along that deck return **zero colliders**, and the bridge is the far east edge of
the map, so reaching it holds the most geometry resident.

**One agent, no parallelism**, because every step needs a real memory measurement.

1. **Sector gating.** Aylmer, Hull, Chelsea and Ottawa are separate data modules
   (`mapdata.js`, `hull_mapdata.js`, `ottawa_mapdata.js`, merged by
   `highway_to_hull.js` and `ottawa.js`). Do not build a sector until the player
   approaches it. Biggest win per hour, lowest risk.
2. **Free CPU-side arrays after GPU upload.** Check whether the heap is mostly
   vertex arrays nothing reads again. Possibly a very cheap large win.
3. **Chunk streaming** — the world is already 200 m chunks and the frustum culler
   already knows what is visible; extend that to what is *resident*.

**Done means:** measured heap under ~500 MB, the game survives twenty minutes of
driving in Safari, and 26 suites still green. Report before/after numbers.

---

## Wave 2 — The spine. The thing that makes it a game.

Everything for this is written and validated in `assets/text/`; **none of it is
wired.** This is code, not writing.

**The goal (from `story.json`, and it is good):** buy the Ranger off your father
for **$1,200 cash by Labour Day**. He leaves the keys on the kitchen table beside
a Caisse populaire envelope marked *"Ranger — 1 200 $ avant septembre. Sinon le
concessionnaire le prend en échange pis tu prends la bus."* The reasoning is
sound and specifically Québécois: CEGEP cost ~$150 a session, so nobody saves all
summer for tuition — what traps you at seventeen in Aylmer is having no car.

1. **The envelope meter.** Always on screen, top-right, `340 $ / 1 200 $`. Goes
   up with job pay, **down when you buy parts or gas.** This single change makes
   the existing economy matter: a $300 set of tyres becomes a decision.
2. **Wire the 18-job campaign** from `assets/text/campaign.json` — validated: no
   invented places, zero consecutive destination repeats, seven kinds of reward.
3. **The ending** from `story.json`: you make the $1,200, your father counts it,
   **pushes it back**, and hands over the keys *and* the signed registration —
   "keep it for your plates and insurance." Then the last scene: Tuesday
   7 September 2004, 6:45am, stopped at the light on Wilfrid-Lavigne, wipers
   going, cassette adapter, and you pull into the traffic.
4. **Friends' differing views** on whether you leave, surfacing in the truck over
   the summer. Mike is the only one who changes his mind — and the only one who
   may deliver it as a speech.

**Done means:** a new game states the goal in the first five minutes, the meter
moves, and the ending fires.

---

## Wave 3 — Stop it feeling like a courier sim

Currently every job is pick up / drive / drop off. Eighteen times.

1. **Change the verb.** At most a third should be deliveries. Others: keep up
   with someone who will not wait; arrive before something happens; don't get
   caught; find something from a description only; carry something fragile so the
   *driving* is the task; give someone a lift and listen; drop four people at
   four places in an order you choose.
2. **Races that interrupt.** Not a menu. Sayyad challenges you on the way home
   from a delivery, on a road you just drove. The Rival AI, twelve named rivals
   (`rivals.json`) and eight courses already exist — this is wiring.
3. **Playable characters**, each learning differently:
   - **Tom** — the truck is his; cargo stays put, hauling pays more.
   - **Sayyad** — fast, reckless, carries nothing; races pay double.
   - **Mike** — repairs cost less, sees shortcuts nobody else does.
   - **Zahra** — 15, so **no licence**: she is on a bike. Paths, the beach,
     between buildings, invisible to police. The most interesting one.
   - **Abraham** — people want him in the car; passenger jobs open for him alone.
4. **Skills that improve with use**, not purchase: brake later, hold a drift,
   land straight. The *player* gets better, not just the car.
5. **Vehicle capability matters** — `story.json.vehicleJobs` has eight worked
   examples: the cedar canoe only fits the Ranger; the golf cart because a pickup
   on the 18th green gets you thrown off; the school bus for timpani and twenty
   music stands; the Diamondback because municipal concrete blocks close the path
   to the Fraser Bay fishing spot.

---

## Wave 4 — Places and faces

- **Russell's garage, 1 rue Arial.** White house, gambrel roof, deep red trim,
  full-width porch. **A separate detached garage down a long driveway is where
  the work happens** — rough, wood stove in the middle of the floor. Early-90s
  **F-250** in the drive (not the modern truck in the photos; the neighbours in
  the photos are modern too and should not be copied).
  **Russell is a friend, not a vendor — Thomas and he fixed things together.**
  He charges **pizza and beer for labour; you pay for parts.** Norm charges money
  and does it properly. Rewrite `russell.json`, which frames it as a 50% discount.
  Russell's dad: fifties, shoulder-length hair, green work jacket, moustache.
- **Avatar corrections** (`avatars.js`): **Sayyad** — no glasses at all, slimmer,
  no grey. **Margaret** — slimmer, dark brown hair, not white.
- **New avatars**: Tom, Abraham, Tyler Yank, Rob French. Photo 37 is the best
  single reference for Tom, Abraham and Adam together.

---

## Wave 5 — Graphics (only after Wave 1)

The ceiling is not the renderer: **every surface is one flat colour.** In order:

1. **Materials.** `assets/text/materials.json` has 33 tileable specs with hex
   colours and real repeat sizes. `materials.js` already builds a 2048² atlas and
   houses already carry per-vertex atlas rects — it is built for houses and off
   everywhere else. Extend to roads, walls, ground. One shared texture, few MB,
   changes everything.
2. **Lighting contrast** — a sun shadow map, and bake ambient occlusion into
   vertex colours where walls meet ground (free at runtime, huge readability win).
3. **Tone mapping and mild bloom** — ~50 lines in the existing shader.
4. **House variation** — `assets/text/houses.json` has 60 recipes. Variation on
   existing archetypes, not more archetypes.

---

## Priorities after Gemini's review (2026-09-04) — the order for the big run

Gemini 3.8 Flash reviewed `wave/1-memory` at `4835c66` read-only; its package
is in `gemini-inbox/` (`INDEX.md`, `REVIEW.md`, `PLAYTEST-GEMINI.md`,
`CONTENT-AUDIT.md`, `TESTS-AUDIT.md`, `STATUS.md`). It reproduced eight of the
fourteen known bugs with screenshots, found the first-job problem is worse than
we thought, and got a few things wrong (listed below so nobody chases them).
This section supersedes the old "Known bugs, ranked".

### Step 0 — Ship Wave 1 (an hour, do it first)

`wave/1-memory` is done and **not on `main`**: heap 1057 → 148 MB, sector
gating, the bridge "wall" fixed. The live site still has the 1 GB build. Open
the PR, run the boot check from `docs/VERIFY.md`, merge, confirm the live URL
loads in Safari. Everything below branches from the merged `main`.

### Step 1 — The first two minutes (one agent, one branch, small diffs)

Gemini's "ten things a new player notices first" puts four defects in the
first two minutes of play. Fix these before the spine, because the spine is
pointless if the opening is broken:

1. **Traffic on the wrong side.** Gemini's proposed fix: the lane offset in
   `laneAt()` (`src/game/traffic.js` ~line 223, `rx = -e.dz*off, rz = e.dx*off`)
   has the wrong handedness. **Verify against the player car's own right-hand
   convention in `cars.js` before flipping it** — if the sign is right and the
   one-way flag is wrong, flipping it breaks every road. Add
   `tools/smoke_traffic.mjs` (every spawned car right of its edge's centreline)
   — the suite that would have caught this does not exist.
2. **The first job goes nowhere.** « Poutine express » ends in an empty
   parking lot at the Galeries with a ring floating over asphalt. Either build
   the casse-croûte / food-court entrance or move the job to one of the 120 real
   storefronts. **This is the first thing a player is asked to do.**
3. **Footpaths are free speed.** `SURF.path` in `terrain.js` ~line 69 has no
   penalty; the Ranger does 149 km/h through Parc des Cèdres. Gemini suggests
   `power 0.75, drag 1.35`; keep the bike and the golf cart fast on it.
4. **HUD overlap on boot.** The tutorial's « W — pour avancer » prompt draws on
   top of the « K — Kijiji » hint in the driveway.
5. **Save mid-job loses the job silently** (`save.js` ~line 58 does not
   serialise `G.mission`; radio station and time of day are not saved either).
   Serialise the mission, or at minimum keep the warning toast.
6. **Buses bog to 1.3 km/h on grass** (`cars.js`): a torque floor off-road.
7. **UI layering** — one modal at a time with the HUD hidden behind it, one
   prompt slot while driving, and the second start click removed (BACKLOG
   U7–U9). Small, and every screenshot in `gemini-inbox/shots/` shows why.

Done means: `smoke_traffic.mjs` exists and passes, and a fresh-storage boot
video shows the first job ending somewhere real.

### Step 2 — Wave 2, the spine (unchanged, one correction)

`assets/text/campaign.json` uses **descriptive French strings** for `to`, not
`places.js` keys, so nothing can resolve them yet. Gemini's
`gemini-inbox/story/campaign.v2.json` is **not** a drop-in either: it has 15
jobs, not 18, and seven of its keys do not exist (`russell`, `adam`, `petro`,
`british`, `galeries_hull`, `bymarket`, `civilisation`). The real work: add the
missing places (Russell's at 1 Arial, Adam's in Deschênes, the Petro-Canada,
the British Hotel, the Galeries de Hull, the Byward Market, the Museum of
Civilization), then map all 18 jobs to keys, then validate with the snippet in
`docs/VERIFY.md`. Everything else in Wave 2 stands. The two meters (envelope, calendar)
live top right, always, and the HUD chrome flips to English with the seam card
(BACKLOG U11–U12).

### Step 3 — Feel (one agent; Gemini's `look/FEEL.md` numbers arrive first)

Camera jitter (`main.js` ~1748: decouple the chase camera from instantaneous
suspension jounce, critically damp the position spring), along-slope gravity
(no `g·sin(pitch)` term anywhere in `cars.js` ~1395, so nothing coasts down the
Principale hill), the sense of speed. The look pass asks Gemini to tune these
live through `window.AYLMER.G` and write down the constants; take its numbers
as a starting point, not as truth.

### Step 4 — Wave 3 (verbs, races, characters) as written.

### Step 5 — Wave 4 + Wave 5 together: places, faces, and the look

The look pass (`docs/GEMINI_LOOK_PROMPT.md`) has Gemini pulling the 2009 Street
View panoramas as pixels this time, producing 2004-corrected orthographic
facades for every cast house and landmark, real tiles for the 26 atlas cells,
tree sprites, a sky palette, Québec road furniture, 13 car sheets, seam cards
and UI mocks, all under `gemini-inbox/look/` with an `INTEGRATION.md`. Wave 5
becomes wiring: facade quads on hero buildings via the signage texture path
(`renderer.texture` + `mb.textured`), the atlas swap, the sky table. Russell's
garage, the clubhouse roof (Gemini: three roofless slabs, `houses.js`), and the
avatar corrections go in the same wave because they are the same kind of work.

### What Gemini got wrong — do not act on these

- **"Keybinding collisions on R, T, M."** False. `KeyM` is only in `modes.js`
  (open/close/consume of the same screen), `KeyR` is in `main.js` and in the
  houses *lab*, `KeyT` is bound once. The duplicate check in `docs/VERIFY.md`
  is still the truth.
- **"No hysteresis on the sector seam at X = 5400."** `sectors.js` builds at
  `APPROACH = 1200` m and frees at 2600 m; there is hysteresis. Whether a
  build stalls the frame (Gemini measured 1.9 s under load) is worth a look,
  the claimed cause is not.
- **"`campaign.v2.json` resolves all destinations."** See Step 2.
- **Golf-cart job, asset 404s, Ranger mirrors, bridge wall:** correctly
  reported as already fixed on this branch.
- Its A6 list (`REVIEW.md`) has real keepers — the Tim Hortons drive-thru, the
  Principale hill coast, potholes with a dashboard rattle, cyclists on the
  Voyageurs pathway, the pull-over at a school zone — and generic filler. Read
  it, do not import it wholesale.
- The Champlain Bridge cycling-path conflict is resolved in Thomas's favour
  with 2002 Ottawa Citizen citations (`CONTENT-AUDIT.md` §7): the separated
  path opened October 2002. Strike the `changedSince` note in
  `streetview_pack.json`.

---

## Written and unwired, in `assets/text/`

~1,900 entries across 16 files. `campaign.json` (18 jobs), `story.json` (spine,
ending, vehicle jobs, friends), `materials.json` (33), `houses.json` (60),
`russell.json`, `places.json` (32 destinations), `arc.json`, `tutorial.json`,
`support.json`, `rivals.json`, `racing.json`, `mechanic.json`, `storefronts.json`
(120, wired), `heckles.json` (300, wired), `radio.json` (wired), `ambient.json`
(wired), `dialogue.json` + `zahra.json` (wired).

**Validate, don't trust.** Gemini wrote most of it and has been wrong in specific
ways: it invented a surname for Sayyad, used real radio station names that did
not match the game's own stations, described the 1831 Symmes Inn and labelled it
as the school, and asserted the Maman sculpture was installed in 2004 when the
gallery acquired it in 2005. All were caught by checking. Keep checking.

---

## Decisions from Thomas (2026-09-01) — these are settled, do not re-litigate

### Seams are allowed, and should be an event

Sector loading may be visible. Do not spend Wave 1 building seamless streaming.

When the player crosses into a new sector, show a **loading card in the GTA
manner: an illustrated landscape or landmark, cartoon-styled but faithful to the
real thing** — the Peace Tower for Ottawa, the Portage towers for Hull, the hills
for Chelsea. **The music shifts** with it. The crossing should feel like arriving
somewhere, not like a technical pause.

**Hard constraint: a seam must not change the time of day or the weather.** You
cross a bridge at dusk in the rain, you arrive at dusk in the rain. Nothing about
the world state may reset just because a sector loaded.

**Ottawa is a different country and should feel like one.** The language flips to
**English** — signage, radio, the people. Ottawans are *têtes carrées*: serious,
proper, correct, faintly disapproving. That contrast is the joke and it is the
reason crossing the river is worth doing. Aylmer stays Québécois French
throughout; this is not the bilingual UI toggle that was removed, it is the world
speaking a different language on the other side of the water.

### Playable characters: separate saves, each from the beginning

Choosing a different character **starts that character's story from the
beginning** — it is not a mid-run swap. But **each character keeps its own
progress independently**: play as Zahra for a while, switch to Sayyad, come back
to Zahra, and hers resumes exactly where it was.

So the save system needs a slot per character, not a single save with a character
field. `save.js` already has explicit slots (`aylmer.save.1/2/3/auto`); extend
that shape rather than replacing it. The $1,200 envelope is per character too —
whose truck it is differs by who you are.

### The calendar

The summer has a **fixed length and the player must always know how much is
left** — days remaining until Labour Day, alongside the envelope meter. That is
what turns "I should do a job" into "I have eleven days."

Labour Day 2004 was **Monday 6 September**; the first morning back is Tuesday
7 September, which is where `story.json`'s final scene is set. Work backwards
from that.

**Birthdays** — only these fall in range, and the first two are the useful ones:

| Who | Date | Notes |
|---|---|---|
| **Tom** (the player) | **23 July** | Falls mid-summer. He turns 18 — legal adult, halfway through. This should be a beat, not a notification. |
| **Mike** | **20 September** | **After the game ends.** Everyone has scattered by then. Do something quiet with this; do not explain it. |
| Zahra | 14 April | Before the summer — establishes she is already 15. |
| Sayyad | 2 May | Before the summer. |

Nobody else in the cast has a spring or summer birthday.

### Who drives what — and why it makes the characters play differently

**Tom is the only one with a truck.** That is the point: hauling is *his*
capability, not a generic one. Every other character's vehicle is the one that
actually suits them, and each gives a genuinely different game.

| Character | Vehicle | Playable | What it can do that others cannot |
|---|---|---|---|
| **Tom** | 1993 Ford Ranger XL | ✅ | Hauls — couch, canoe, lumber, bikes, a fridge. Slow. The only cargo bed in the cast. |
| **Sayyad** | 1988 Honda Civic Si | ✅ | Fast, light, carries nothing. Races pay; deliveries punish. |
| **Zahra** | **no licence — she is 15** | ✅ | A bike. Paths, the beach, between buildings, kerbs, and no police interest whatsoever. The most different of the five. |
| **Mike** | **green 1998 Subaru Forester** | ✅ | All-wheel drive: gravel, mud, wet grass, the Chelsea hills. Goes where the others get stuck rather than where they cannot fit. |
| **Abraham** | **beaten-up ~1999 Toyota Sienna** | ✅ | Seven seats. The people-mover — everybody piles in. Fits his trait: he is the one others want along. |
| Margaret | 1997 Saturn SL | — | Four doors, soft ride. Passengers who must not be jostled. |
| Adam Actell | 1997 Pontiac Sunfire | — | Side character. **Now established as out of town** (see conflict below). |
| Tyler Yank | **Chevrolet Cavalier** | — | ~312 rue Samuel-Edey, lives with her aunt. |
| Rob French | — | — | Out of town, drives in. Last to arrive, first to leave. |

**Zahra needs her own bike.** Existing canon gives the chrome cruiser to Sayyad
and the Diamondback to Tom, so a third is needed — or she borrows her brother's,
which is funnier and free.

**⚠️ Canon conflict to resolve with Thomas.** Adam is now "from out of town", but
existing code and missions place him at **20 chemin Vanier, Deschênes**, which is
inside the Aylmer sector, and « Ramasser la gang » is built around the long
detour to fetch him. Either Deschênes counts as out of town for these purposes,
or he moves and those missions need re-pointing. **Do not silently pick one.**
