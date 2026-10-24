# S4-SUMMER: the summer has a middle and an end you can feel

Builder s4-summer, branch rf/s4-summer, base fix/look-on-qr 2fb304c. Ports 8282 / 9482.

Status: code done and committed; browser proof partly run (bot finale passed), the rest stopped on the lead's order (Mac heat, 20 Oct) and listed below for the cloud.

## Steps
1. Pacing: date gates for the ten main missions and the optional jobs, live in index.html; sleep at home (Z) to pass time. (done, 3d26b04)
2. Finale in the Ranger, by script and by the bot. (done, fc9f2d6; bot run passed; script run not yet run)
3. Summer-end screen after the last card. (done, 3d26b04, fc9f2d6, 1e53da0; seen live in the bot run, frames of the card itself pending)

## What changed

### Step 1: pacing (done)
- `src/game/campaign.js` DATE_GATES: every main mission and six optional jobs have a « not before » date, live in index.html (the prototype keeps only the Saint-Jean: it runs a real 24-minute day and has no sleep). Real dates where canon fixes them: the Saint-Jean 24 June; the sauna on 30 July, the hottest day in the recorded summer file (30.0 degrees, humidex 36); the nachos on Sunday 5 September, the Labour Day weekend, so the day they spend IS Labour Day and the finale needs no jump.
- Schedule (day: job): 0 alternateur, 1 sayyad, 2 arcbache (24 juin), 5 solerrand, 10 divan (2 juil), 14 racedave, 18 canot (10 juil), 22 blitz, 26 golfcart (18 juil), 31 circuit, 38 stvincent (30 juil), 45 nuittim (6 août), 52 school (13 août), 57 russellroyal (18 août), 63 highwayhull, 69 chelsea, 75 curfew (5 sept), finale 76 (lun 6 sept).
- `src/game/summer.js` (new): what opens next, the free-roam wait line (« Prochaine histoire : Le divan de Mike, le 2 juillet / Z au 299 Fraser pour dormir jusque-là »), the end-card note (« Prochaine histoire : le 2 juillet · il reste 68 jours d’été »), sleeping, and the summer-end screen.
- Sleep: Z, stopped within 30 m of 299 Fraser, no job: a card (« Dodo. » or « Les jours passent. », the dates, what opens), then the morning of the next day something opens (never past it, never past Labour Day). Open jobs stay open. Not on the last night, not in the prototype. The HUD adds « Z : dormir jusqu’au 2 juillet » when you are parked at home.
- main.js: four marked `S4-SUMMER` blocks (import, Z key, the HUD hint plus trySleep, the end-card note) and one line in the crash show (crash counter).
- Harness: seedFor brings the calendar to a job's date when it seeds it; a seedless plan (campaign.json) drives home and sleeps with a real Z when the next job waits for its date.
- Tests: tools/smoke_summer.mjs (new); smoke_campaign and smoke_econ: the « index.html has no date gate » checks now assert the gate (the behaviour changed on purpose); the D31 migration check runs on the sauna's own date.

### Step 2: the finale in the Ranger
- The friends' callback lines stay as s1-english wrote them (all English); nothing in FINALE_CALLBACKS' text changed.
- arc.js (marked `S4-SUMMER finale` blocks): `finaleTodo(m)` keeps the places not seen tonight in `m.fin.todo`; the objective counts them (« Le dernier soir : 3/11 places de l’été », sub « Les lumières sur la carte, c’est l’été. Rentre quand t’es prêt, pis E. », then « T’as fait le tour. » when all 11 are seen, with one toast « Toutes les places de l’été. Il reste juste chez vous. »).
- main.js: the places left are pins on the minimap (job rings) and on the big map (with their names) during stage 1 only. Still no GPS line: the lights are the list.
- The bot (page-agent.js): in the finale's stage 1 it tours `tourN` places (default 4, nearest first, or a `tour` list), each leg to the road end next to the place, a leg that cannot land in 240 s is dropped; the stage's assist and abandon clocks are held while it tours (`T.holdT`), then it drives home and the old code taps E for the gate, the phone and the brochure. No teleport.
- The script (tools/review/beats/E-09.mjs, new): the finale seeded on Labour Day, a drive through `tour` with drive tasks, each callback asserted, home, the phone and the brochure by an attached mission task with no tour, then every card read and shot (the three end cards, then the summer-end screen), asserts named per column.
- Plans: `handPlay` removed from arcdernier in full, ranger-rerun, campaign, full-rest and julie; in full, ranger-rerun and full-rest the finale moved to the last beat (after it the summer is over, which would change every later beat's cards). New plans/finale.json: boot, russellroyal, curfew, arcdernier (bot), E-09 (script).
- Harness: the mission task passes `tour`, `tourN`, `tourLegS`.

### Step 3: the summer-end screen
- After the last end card, a cinema card on the night grade of 299 Fraser: eyebrow AYLMER, QUÉBEC · ÉTÉ 2004, title « Ton été », the narrator (French, always): « Le Ranger est dans l’entrée. Le moteur fait tic, tic, en refroidissant. C’était ça, l’été. », then up to seven lines in the HUD's language: story steps and jobs done, km and the share of Aylmer's streets, jumps (longest airtime), crashes, near misses, records (story jobs and courses, with the best course time), money, and « Le divan : encore dans l’arbre » when the couch job is done. Button « Roule → »; free roam goes on after it.
- Medals do not exist yet (C-02a is not built), so the screen shows records only.
- New counter: `G.stats.crashes` (+1 at each crash show, the same threshold as the slow-mo). Saved with the stats.
- Z is in the key legend (« Dormir au 299 Fraser : les jours passent jusqu’à la prochaine affaire »).

## Checks

### Step 1
- smoke_summer (the date gates smoke): a player who does each new thing once plays 22 jobs, sleeps 13 times, longest stretch with nothing new 6 nights (bar 6); the story spans the summer (mains on days 0 1 2 10 18 26 38 45 52 57 75), Saint-Jean on the 24th, finale on Labour Day. A story-only player is never stuck (one sleep per wait). Easy and hard summers finish. Every free-roam line names a key.
- Before: the story reached « Le dernier soir » on day 19 (dim 11 juill) and enterLastNight jumped 57 days. After: day 75 to 76, a one-day step that spendDay already makes (enterLastNight is a no-op on normal).
- npm test 104/104.

### Step 2 and 3, browser
- boot.mjs (ports 8282/9482, at fc9f2d6 plus the legend): index.html ok, 0 console errors, W moved 142.4 m; prototype.html ok, 0 console errors, 142.4 m.
- Harness, bot, `--plan finale --only curfew,arcdernier --columns played` at 3fc23a8, pack references/review/rf-s4-summer/bot-3fc23a8/:
  - arcdernier: **done** in the Ranger, 6.03 min, 0 assists (no teleport, no abandon). Stage 1 356 s: four places seen in order Tyler's (282 s), the Canadian Tire, the Tim's, Mike's (« It stays up there. Hear me out: it’s a monument now. »), the objective counted 1/11 to 4/11, then home, phone, brochure. The three end cards played in order (LA FÊTE DU TRAVAIL, LE RANGER, L’ALTERNATEUR), then the summer-end screen « TON ÉTÉ » with the narrator line, then free roam (objective back on the next job). The date on the HUD: lun 6 sept all night. Before: hand-play in every pack, abandoned by the bot.
  - curfew: fail on its clock (« Trop tard », stage 1 at 160 s, from the marina). Not touched by this task; a bot or timer question for the lead (s1-timers owns story clocks).
  - The street line read 0 % after a short run (10 of 1,630 named streets): the screen now prints the street count and the share only once it is a whole percent (1e53da0).
- npm test (at 1e53da0, through qa-slot): 104/104 suites green (smoke_summer new, 167 checks).

## Browser checks still to run (for the lead, in the cloud)
Ports are mine only on Tom's Mac; in the cloud use the cloud defaults. `--rev` the head of rf/s4-summer.
1. The finale by script, with frames of every card: `node tools/review/harness.mjs --plan finale --only E-09 --rev <sha> --out <dir>/script-<sha>`. Read metrics.json: the E-09 beat `ok: true`; shots `e09-played-card-0..3` are the three end cards and the summer-end screen (`card-3`, title « TON ÉTÉ », stats lines); `e09-played-free-roam-after` shows free roam going on. About 8 minutes.
2. Both columns of the bot finale on the gate plan: `node tools/review/harness.mjs --plan full --only arcdernier --columns both --rev <sha>`: arcdernier done in both columns, 0 assists, ranger only.
3. Sleep, by hand or a one-line beat: a new game, play the alternateur, sayyad, arcbache, the five optional jobs, park at 299 Fraser: the sub line says « Z : dormir jusqu’au 2 juillet »; Z shows « Les jours passent. » with « mer 30 juin  →  ven 2 juill », Debout gives a morning sky and the date toast, and the couch pillar is on the map.
4. The seedless campaign plan (`--plan campaign`) once, to see the harness sleep with a real Z when a job waits for its date (new code path, unrun).
5. boot.mjs on the final head (my last boot was before 1e53da0, a text-only change in summer.js).

## Open issues
- Prototype.html keeps only the Saint-Jean's date (real 24-minute days, no sleep), so its finale still jumps the calendar to Labour Day. index.html no longer jumps (the nachos are on day 75, their day spent lands on 76).
- Medals do not exist yet (C-02a); the summer-end screen shows records only. It reads course bests from modes.js' localStorage.
- Hard mode starts on 24 July: missions 1 to 6 have passed their dates and run back to back, then the calendar spreads 7 to 10 as normal. Easy mode spends half days; smoke_summer covers both.
- Plans: the finale is now the last beat in full, ranger-rerun and full-rest (after it the summer is over and the later beats' cards would change). E-09's script beat lives in plans/finale.json; the lead decides whether the gate plan also gets `{ "do": "script", "id": "E-09" }` (the spec's contract).
- Sleep on Z: Z was free on the keyboard; it is in the key legend. Gamepad has no sleep button yet.
- Story text written by me (narrator, French, no real person): the sleep card (« Dodo. », « Les jours passent. » lines), the finale count lines, the summer-end screen. Tom may want to rewrite them.

