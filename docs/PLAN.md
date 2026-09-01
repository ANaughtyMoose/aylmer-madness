# Aylmer Madness — execution plan

Written 2026-09-01 as a cold-start handoff; reviewed and extended the same afternoon (Wave 1 status, difficulty, model assignment, open questions). Read this, then `docs/VERIFY.md` (how to know a change worked — it is the
merge gate), then `docs/NEXT.md` for the raw playtest notes. You should not need to ask Thomas anything already
written down here.

---

## How to pick this up (written 2026-09-01, 14:00, at Thomas's pause)

Do these in order. Each is one sitting.

1. **Merge PR #5** (`wave/1-memory`, six commits + docs). Gate first: the
   twenty-minute Safari run to Ottawa with `index.html?drive=ottawa` and no
   reload banner, then the boot check in `docs/VERIFY.md`. Then
   `gh pr merge 5 --merge --admin`.
2. **Merge PR #4** (this document). `gh pr merge 4 --merge --admin`.
3. **Fix Adam.** He lives in Mayo, Québec, off-map (settled below). Re-point
   « Ramasser la gang » stage 3 and « Adam jusqu'aux Galeries », and delete
   every mention of 20 chemin Vanier / Deschênes for him. Opus, one branch,
   `smoke_story.mjs` green. Small, do it before Wave 2 so no brief inherits it.
4. **Cut the Wave 2a and 2b briefs** from this document, file ownership copied
   in verbatim, and run them in parallel off `wave/2-spine`. 2a is Fable, 2b is
   Opus — see *Which model does what*.
5. Answer the three remaining questions at the end whenever convenient; none
   blocks Wave 2.

### Reviewed — will this be fun?

Reviewed by Fable on 2026-09-01 against the code as it is, the numbers in
*Difficulty*, and what Thomas's friends will actually do: open a link, click GO
twice, and play for twenty minutes. Verdict: **yes, if Waves 2 and 3 are built
as written, and in that order.** The reasoning, so nobody has to redo it:

- **The game already has the hard part.** A real town people recognise, a truck
  that drives well, 22 missions, races, cops, weather, a day/night cycle, a
  radio, and 1,900 lines of written voice. What it lacks is *stakes* and
  *variety*, and both are cheap next to what exists.
- **Wave 2 gives it stakes in under a week of work.** An envelope with a
  number, a calendar with a countdown, and two endings. A goal on screen is the
  difference between "I did a delivery" and "I have eleven days." The one rule
  (a job costs a day) does the economy tuning that a dozen constants could not,
  and the budget table means the ending is reachable by an ordinary player and
  tense for everyone.
- **Wave 3 is where the fun lives, and it is not optional.** Eighteen
  deliveries is a courier sim whatever the meter says. A third of the jobs
  become something else; Sayyad challenges you on the road home; Zahra's bike
  makes the town a different map. Five characters with five separate summers is
  the replay hook. If time is short, cut Wave 5 before touching Wave 3.
- **The comedy is structural, not written.** Ottawa in English with proper,
  faintly disapproving people; Russell charging pizza and beer; Mike being the
  only one allowed a speech. These are rules, and they are already settled.
  Keep them; they are what will make the people this is for laugh.
- **The first fifteen minutes decide it.** Envelope and days-left visible from
  the first frame of driving. First job pays inside three minutes. Sayyad's
  Civic unlocks by the second job. A race interrupts by the third. Nothing on
  screen in a language the game does not otherwise speak. That is the bar, and
  it is measurable with the existing headless tools.
- **The risks are known and named.** Traffic on the wrong side and the camera
  jitter are the two things a new player feels before anything else; both are
  Fable diagnosis jobs and both should land with Wave 2. The money exploit and
  the placebo difficulty option are in 2a's list. Nothing else in the bug list
  stops it being fun.

---

## Where things are

- Repo: `~/Desktop/Coding Projects/aylmer-madness`, branch `main`, pushed to
  `github.com/ANaughtyMoose/aylmer-madness` (public, `main` protected: PR + 1
  approval, admin can bypass with `gh pr merge N --merge --admin`).
- **Live at https://anaughtymoose.github.io/aylmer-madness/** via GitHub Pages
  off `main`. Any push to `main` redeploys in ~2 minutes. Thomas emails this
  link to friends, so **do not break `main`**.
- Run locally: `./serve.sh` → http://localhost:8123. Never `file://`.
- Test: `for t in tools/smoke*.mjs; do node $t; done` — **26 suites on `main`, 27 with `wave/1-memory`, all green.**
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

## Wave 1 — Memory. Done on `wave/1-memory`; waiting on the Safari run and the PR.

**Status 2026-09-01 13:30.** Two commits on `wave/1-memory` did it, and the
reason was simpler than the plan guessed: memory did not grow with where you
drove. Everything was built up front and the bridge was just the total.

| Point | Before (heap / GPU) | After free-the-builders `4d36f57` | After sector gating `29d8333` |
|---|---|---|---|
| Driveway, 299 Fraser | 1057 / 390 MB | 182 / 390 | 148 / 183 |
| Galeries | 1057 / 390 | 182 / 390 | 148 / 183 |
| Hull | 1057 / 390 | 182 / 390 | 168 / 213 |
| Champlain Bridge | 1057 / 390 | 182 / 390 | 169 / 213 |

Home build 1.1 s instead of 4.9 s. Four spatial sectors (Aylmer / Hull /
Chelsea / Ottawa — the river and every bridge deck belong to Hull), a sector
bakes at 1 200 m from its nearest road and frees at 2 600 m, two resident at
most. The seam card is text for now and holds the sim rather than resetting it,
so the clock, weather and radio carry on — exactly the settled constraint. The
illustrated GTA-style card is Wave 5 work and the music shift is Wave 4 (see
below). `tools/smoke_sectors.mjs` is the 27th suite; `index.html?drive=ottawa`
is a dev chauffeur so the twenty-minute Safari test can be run on a laptop with
no developer tools.

**Still to do before this merges:** the Safari run to Ottawa with no reload
banner, then PR to `main` with the boot check. The Wave 1 session owns that.

**What the plan got wrong, for the record:** the "invisible wall" on the
Champlain Bridge was not memory (the memory bill was the same everywhere). It
was the river polygon under the deck: `cars.js` counted any water under the
car as being in it, so the truck sank to a walk mid-bridge with no collider
near it. Fixed in `5100c3c` (a road over water is a bridge), with a driving
test and a deck-premise test. Keep memory and colliders apart in future bug
reports.

---

## Wave 2 — The spine. The thing that makes it a game.

Everything for this is written and validated in `assets/text/`; **none of it is
wired.** This is code, not writing. Two agents, disjoint files.

**The goal (from `story.json`, and it is good):** buy the Ranger off your father
for **$1,200 cash by Labour Day**. He leaves the keys on the kitchen table beside
a Caisse populaire envelope marked *"Ranger — 1 200 $ avant septembre. Sinon le
concessionnaire le prend en échange pis tu prends la bus."* The reasoning is
sound and specifically Québécois: CEGEP cost ~$150 a session, so nobody saves all
summer for tuition — what traps you at seventeen in Aylmer is having no car.

### 2a — Envelope, calendar, fuel, ending, difficulty (one agent, **Fable**)

Owns `economy.js`, `money.js`, `missionkit.js`, `arc.js`, the pay values in
`missions.js` / `sidejobs.js` / `racejobs.js` / `modes.js`, the difficulty read
in `options.js` / `store.js`, a new `calendar.js`, a new `fuel.js`, `hud.js` for
the two new HUD elements, and one hook block in `main.js`. Does **not** touch
`save.js` (2b has it); it lists the fields it needs persisted (`day`, `fuel`,
`target`) and 2b adds them.

1. **The envelope meter.** Always on screen, top-right, `340 $ / 1 200 $`. It is
   the existing `G.wallet` with a target drawn beside it — the wallet already
   goes up on job pay and down on parts, repairs, tows and tickets
   (`missionkit.js`, `garage.js`, `damage.js`, `cops.js`). Nothing to invent;
   the number just needs to be *shown against the goal* so a $300 set of tyres
   becomes a decision.
2. **The calendar.** Summer runs **Saturday 26 June to Monday 6 September 2004**
   — 73 days. The HUD shows days left beside the envelope (`47 jours`). A day
   ends when a job or a race ends (win, lose, or Backspace) or when the
   ten-minute day/night cycle wraps in free roam, whichever comes first.
   **Every activity costs a day** — that is the whole anti-farming rule, and it
   is the only one needed. Tom's birthday on 23 July is a beat, not a toast: a
   card, one line from whoever is in the truck, and the day still counts. See
   *Difficulty* below for why 73 is right for normal and what easy/hard do.
3. **Fuel.** The story says gas at 85 ¢/L and the meter going down for it, and
   right now fuel does not exist — "réservoir plein" is flavour. Add a gauge:
   the Ranger does ~25 km on a tank-worth, a fill at Petro-Can / Ultramar is
   ~$35, other vehicles scale by mass. Empty does **not** strand you — the engine
   coughs to a 20 km/h limp and the GPS points at the nearest station. Fuel is a
   rhythm and a $250-a-summer cost, not a trap.
4. **Wire the 18-job campaign** from `campaign.json` — validated: no invented
   places, zero consecutive destination repeats, seven kinds of reward. The
   existing 22 missions carry the pay; `campaign.json` carries the *unlock
   kinds* (cash, shortcut, place, tool, character, discount, vehicle). Marry
   them: each existing mission gets its campaign entry's unlock on top of pay.
5. **Pay at the end, not per stage.** `stageSettle` pays each stage as it lands
   and `failMission` never claws back, so on « La surchauffe du pont » you take
   three $30 deliveries and press Backspace before the $60 charge stage: +$90,
   repeatable forever. Pay on completion; charge `cost` stages immediately.
6. **Read the difficulty option.** `store.js` already persists
   easy / normal / hard and comments that nothing reads it. Read it — the table
   in *Difficulty* says what each does.
7. **The ending** from `story.json`: on Labour Day with ≥ $1,200, your father
   counts it, **pushes it back**, and hands over the keys *and* the signed
   registration — "keep it for your plates and insurance." Then Tuesday
   7 September, 6:45am, the light on Wilfrid-Lavigne, wipers going, cassette
   adapter, and you pull into the traffic. **Short of $1,200:** the bus ending,
   ten seconds, wry, no lecture — the STO 41 at the corner of Fraser in the
   rain, and the offer to start that character's summer again. The stakes on
   the envelope have to be real or the calendar is decoration.
8. **Friends' differing views** on whether you leave, surfacing in the truck over
   the summer (`story.json.friendsOnTheSpine`, five lines, dated). Mike is the
   only one who changes his mind — and the only one who may deliver it as a
   speech.

**Done means:** a new game states the goal and the days left in the first five
minutes, the meter moves both ways, a job costs a day, and both endings fire.

### 2b — Per-character saves, and saving mid-job (one agent, **Opus**)

Owns `save.js` and the slot UI only. Settled decision: a slot per character,
each summer independent, the envelope per character. Extend the existing
`aylmer.save.1/2/3/auto` shape rather than replacing it. Also the open playtest
item #11: a slot must carry the job in progress (`mission.def.id`, stage index,
`timeLeft`, stage state) so loading mid-job resumes it instead of silently
dropping it. `smoke_save.mjs` is the gate.

---

## Difficulty — the numbers, and the one rule

Thomas's brief: not too hard, not too easy, fun. Here is what the code does
today (audited 2026-09-01) and the target.

### Today

| | |
|---|---|
| Start | $80 |
| One clean pass of all 22 missions | gross $850, costs $126, **net $724** — the goal is unreachable in one pass |
| But every job pays again on replay, in full | unbounded |
| 8 race courses, repeatable, never marked done | $435 per pass, unbounded |
| Style bonus per completion | up to $22, uncapped across replays |
| Full engine + tyres + suspension + brakes + transmission on the Ranger | ≈ $1,590 |
| Police ticket | $150 — eight poutine runs, for a first-timer who ran one red |
| Tow at 100 damage | $60, car reset to the driveway, fully repaired |
| Rivals' cruise speed | 62–68 km/h against a 150 km/h Ranger and a 178 km/h Civic — ~40 % of you |
| Timers | per stage; failing costs nothing; retry is immediate |
| Calendar, fuel | do not exist |
| Difficulty option | persisted, read by nothing |

So the game is currently *both* too hard (the number cannot be reached honestly)
and too easy (nothing stops you replaying « Run au dep » forty times, and no
friend can lose a race). Nobody has felt this yet because the goal is not on
screen.

### The rule

**Every job and every race costs one day, and the summer has 73 of them.** That
single rule bounds farming without a replay penalty, makes the calendar mean
something, and never punishes a normal player: 22 missions + 8 courses + a
handful of hangouts is ~35 days. A player who does everything once has five
weeks of slack for replays, races that interrupt, and driving around. A player
who farms hits September. That is the right shape — the deadline is there to be
*felt in August*, not to fail people in July.

### The budget (normal), one pass of everything, an ordinary driver

| | $ |
|---|---:|
| Start | 80 |
| 22 missions, pay lifted so early jobs are worth an hour of a 17-year-old's time (min $20, cap $100) | ~950 |
| 8 race courses, once each | 435 |
| Style bonus, capped at $15 a job, average ~$8 | ~180 |
| **In** | **~1,645** |
| Fuel over the summer | −250 |
| Repairs at the station (20 % of damage, min $5) | −80 |
| One tow | −60 |
| One ticket (lowered to $75) | −75 |
| **Out** | **−465** |
| **Net on Labour Day** | **~1,180** |

That is the target: an ordinary player who does everything once lands *just
under*, and makes the last $20–$100 with two replays or a race in the final
week. A careful driver (no ticket, no tow) is at ~$1,300 with margin. A player
who buys the $320 tyres in July feels it, which is the point. Tune the mission
pay table until a script over `tools/timers.mjs` reproduces this table; do not
tune by feel.

### Easy / normal / hard

| | Easy | Normal | Hard |
|---|---|---|---|
| Days | 73, and a job costs half a day | 73 | 44 — the summer starts 24 July, the day after Tom's birthday |
| Pay multiplier | ×1.3 | ×1 | ×0.8 |
| Rival cruise speed, as a fraction of *your car's* top speed | 0.70 | 0.82 | 0.92 |
| Ticket | $40 | $75 | $120 |
| Timers | +40 % | as generated | −10 % |

Rivals must scale from the player's vehicle, not from a table — today they are
tuned for nobody. Rubber band stays weak (0.88 ahead / 1.08 behind): a race you
cannot lose is not a race, and a race you cannot win is a courier job with a
scoreboard.

### Timers

Per-stage timers stay. Regenerate them from `tools/timers.mjs` at an implied
**40 km/h door-to-door for the first five jobs, 50 km/h through the middle,
55 km/h for the arc finale**, and never below 60 s. Failing a timer costs the
day — that is the cost, no money is lost. The playtest rows that said
« Première période » had no margin (#6) and the golf cart job was 25 minutes
(#33) are stale: the code is at 420 s and a near drop-off now.

### What "fun" actually rests on

Numbers do not make it fun; they stop it being broken. Fun is Wave 3: a third
of the jobs are not deliveries, Sayyad challenges you on the road you just
drove, Zahra's bike goes where the truck cannot, and the friends say something
about *you*. Do Wave 2 quickly and correctly and spend the time on Wave 3.

---

## Wave 3 — Stop it feeling like a courier sim

Currently every job is pick up / drive / drop off. Eighteen times. Three agents
(verbs and missions · races and rivals · characters and their vehicles), each
owning its own module and one hook block, after Wave 2 is on `main` — a race
that interrupts has to cost a day and pay into the envelope, so it cannot be
built before those exist.

Review note: item 3 below is the one that makes people replay. Five characters,
five different games, five separate summers (settled). Build Zahra first — the
bike is the cheapest vehicle and the most different game.

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
   Adam is a passenger who *arrives* from Mayo, never one you fetch from a
   house in town — the gang job and the Galeries race change accordingly (step
   3 of *How to pick this up* does this before Wave 2, so no Wave 3 brief
   inherits Deschênes).
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
- **Build from the 2009 pack, undoing what changed.** Gemini's
  `assets/text/streetview_pack.json` (in the repo since `065a42d`) describes
  1 rue Arial house and garage, 129 Frank-Robinson, 75 Denise-Friend and
  299 Fraser with materials, colours, trim and a `changedSince` field that says
  what to *undo* for 2004: the big evergreen back on the lawn at Arial, the
  woodpile and the trailer in the drive, Sayyad's house in olive clapboard with
  burgundy posts, Mike's dormer in brown shakes. It also has the twelve
  Principale storefronts in order and the four landmarks. Zellers at the
  Galeries is period-correct and should be on the pylon.
- **Ottawa is another country** (settled): once you cross, the radio is an
  English station, the peds and signage are English, and the seam music shifts.
  Third agent in this wave; owns `radio.js` station data, `peds.js` lines and
  the seam hook only.

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
5. **The seam cards** (settled: an illustrated landscape or landmark, cartoon-
   styled but faithful): the Peace Tower for Ottawa, the Portage towers for
   Hull, the hills for Chelsea, the Auberge Symmes for Aylmer. Wave 1 shipped
   the card as text with the hold-not-reset behaviour; this replaces the text
   with a picture and nothing else. The pack's landmark entries are the
   reference.

---

## Which model does what

Thomas asked that fixes go to the right model. The rule of thumb: **Fable for
anything whose spec is "make it feel right" or where two systems have to agree;
Opus for anything whose spec is a table.** Opus with a clear brief and a smoke
test to satisfy is fast and reliable; it is the wrong tool for diagnosing a
camera ringing against a suspension, or for deciding what a race that interrupts
should feel like. Either way the brief names the files it owns and the files it
must not touch.

| Work | Model | Why |
|---|---|---|
| Wave 2a spine: envelope, calendar, fuel, pay table, difficulty, endings | **Fable** | One coherent design touching economy, missions, HUD and arc at once |
| Wave 2b per-character saves, mid-job save | Opus | Well-specified data shape, one file, `smoke_save.mjs` to satisfy |
| Wave 3 verbs and missions that are not deliveries | **Fable** | Design work; the brief is a feeling |
| Wave 3 races that interrupt, rival scaling | **Fable** | Rival AI, missions and traffic have to agree |
| Wave 3 playable characters' vehicles (Forester, Sienna, Zahra's bike) | Opus | `vehiclekit.js` recipes from a spec table |
| Wave 3 skills that improve with use | **Fable** | Physics feel |
| Wave 4 Russell's: house and garage geometry from `streetview_pack.json` | Opus | Faithful build from a description with colours already named |
| Wave 4 Russell's dialogue and the pizza-and-beer bill | **Fable** | Voice, and an economy rule |
| Wave 4 avatar corrections and four new avatars | Opus | Parameter changes in `avatars.js` from written descriptions |
| Wave 4 Ottawa as another country: English radio, English peds, seam music | Opus | Content wiring, i18n |
| Wave 5 materials atlas to roads, walls, ground | Opus | `materials.json` is already the spec |
| Wave 5 shadow map, baked AO, tone mapping | **Fable** | Shader work that has to look right, not just run |
| Wave 5 seam cards: illustrated Peace Tower / Portage / hills | Opus | Canvas or SVG from a reference, one per sector |
| Wave 5 house variation from the 60 recipes | Opus | Recipes exist |
| Bug: traffic on the wrong side | **Fable** | Needs diagnosis, not a table |
| Bug: camera jitter over bumps | **Fable** | Same |
| Bugs: buses bog on grass, footpath penalty, poutine place missing | Opus | Each is a constant or a placement |
| Playtest cosmetics: #3 untranslated string, #2b handbrake card, #18 broke toast, #32b seats+1, #38 console 404s | Opus, one agent, one branch | Small, disjoint, testable |
| Integration passes and merges to `main` | **Fable** | The merge is where the design disagreements surface |

---

## Known bugs, ranked

1. ~~Memory~~ — fixed on `wave/1-memory`, see Wave 1.
2. **Traffic drives on the wrong side of the road.** `traffic.js` `laneAt` /
   `wantOn`; suspect the lane-offset sign for one direction, or a one-way being
   read as two-way.
3. **Camera still jitters over bumps** and slightly under acceleration. Already
   softened once (two slow sines instead of one at 9.7 Hz, plus a shake slider).
   Remaining source is the suspension feeding `camPitch` and the chase camera's
   `dt * 9` position lerp ringing at the new higher top speeds.
4. **Money exploit:** stages pay as they land and a failed job keeps them, so
   « La surchauffe du pont » banks $90 per Backspace. Wave 2a fixes it.
5. **The difficulty option is a placebo** — persisted, read by nothing. Wave 2a.
6. Both buses bog to 1.3 km/h on grass and cannot leave tarmac.
7. `SURF.path` gives a footpath no penalty — the Ranger does 149 km/h down one.
8. The « Poutine express » destination does not visibly exist at the Galeries.
9. ~30 console 404s on every boot (`assets/cars/*/*.png`) hide real errors.

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
| Adam Actell | 1997 Pontiac Sunfire | — | Side character. **Lives in Mayo, Québec, off-map** — drives in (see below). |
| Tyler Yank | **Chevrolet Cavalier** | — | ~312 rue Samuel-Edey, lives with her aunt. |
| Rob French | — | — | Out of town, drives in. Last to arrive, first to leave. |

**Zahra needs her own bike.** Existing canon gives the chrome cruiser to Sayyad
and the Diamondback to Tom, so a third is needed — or she borrows her brother's,
which is funnier and free.

### Adam Actell lives in Mayo, Québec — off-map (settled 2026-09-01, 13:50)

Thomas: "Adam doesn't live in Deschênes — that was imagined and it's not
true. He lives in Mayo, Québec, off-map." 20 chemin Vanier was invented and is
gone. Mayo is up the Lièvre north of Buckingham, forty minutes east, so Adam
is the other one who *drives in*, like Rob French, and arrives in the Sunfire.
Consequences: « Ramasser la gang » stage 3 no longer fetches him — he is
already at the meeting point or drives himself; « Adam jusqu'aux Galeries »
starts wherever the Sunfire is parked in town, not at a house; every place,
dialogue and heckle line placing him in Deschênes is rewritten. Nothing in the
Aylmer sector is his address.

---

## Open questions for Thomas — do not pick, ask

~~Adam: Deschênes or out of town?~~ Answered: Mayo, off-map. See *Decisions*.

1. **Champlain Bridge bike path in 2004.** The 2009 pack says the separated
   bidirectional path came with a recent rebuild; Thomas previously said it was
   there after the 2002–03 NCC work. He rode it.
2. **The summer's first day.** This plan assumes **Saturday 26 June 2004** (73
   days to Labour Day), the first weekend after Québec schools let out. If
   Thomas remembers otherwise, one constant in `calendar.js` moves; nothing
   else does.
3. **The bus ending.** This plan says yes: short of $1,200 on Labour Day, a
   ten-second wry ending and the offer to restart that character's summer.
   `story.json` rejects a *random* financial punishment; this is the stated
   stakes, not a random one. Thomas should say if he disagrees.

## Close-out checklist (2026-09-01)

What "clean everything up and close this out" means, in order:

- [x] Gemini's 2004 reference pack is in the repo as
      `assets/text/streetview_pack.json`, byte-identical to the vault copy in
      `ObsidianVault/working/`. Nothing to ingest; the Wave 4 and Wave 5 briefs
      point at it.
- [x] `wave/1-memory` pushed and opened as **draft PR #5**, with the Wave 1
      session's NEXT.md / VERIFY.md write-up committed onto it. The Wave 1
      session exited before doing this itself.
- [ ] PR #5: the Safari run and the boot check, then merge. Then merge PR #4.
- [x] Merged branches pruned: ten `agent/*` and `wave4` were 0 ahead of `main`
      with dead worktrees under a finished session's scratchpad.
      `backup/mixed-065a42d` is the Wave 1 session's safety copy; delete it
      after #5 merges.
- [x] Stale playtest rows struck (#6 and #33 are fixed in code).
- [x] Adam's address settled (Mayo, off-map); the code fix is step 3 of *How
      to pick this up*.
- [ ] After Wave 1 merges: `docs/NEXT.md` keeps only bugs found in play; the
      plan lives here. Delete the duplicated mission section from NEXT.md
      rather than maintaining two copies.
- [ ] Cut the Wave 2a and 2b briefs from this doc into two agent prompts, file
      ownership lists copied in verbatim, and run them in parallel off
      `wave/2-spine` once Wave 1 is on `main`.
- [ ] Thomas answers the three questions above; the answers go into the
      *Decisions* section and the questions are deleted.
