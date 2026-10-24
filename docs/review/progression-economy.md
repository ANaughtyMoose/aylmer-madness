# Progression and economy review - 29 Sep 2026

Scope: missions, progression gates, the calendar, the ending, and the money loop, for `index.html` and `prototype.html`.
Branch `claude/quality-review-2026-09-29` at `46e6eca`. This was a read-only pass. No game file was changed.
Probes live in `/private/tmp/claude-501/am-probe/p1.mjs` to `p7.mjs`, and each one runs with `node <file>`. The smoke suites below were run unchanged and all of them passed: `smoke_prototype_calendar`, `smoke_arc` (1576), `smoke_story` (3156), `smoke_repair` (53), `smoke_tow` (38), `smoke_campaign_spare`, `smoke_firstjob` (31), `smoke_save` (358), `smoke_modes` (116) and `smoke_jumps` (74).

## Summary

| # | Finding | Kind | Severity | Confidence |
|---|---|---|---|---|
| P1 | Prototype ignores every mission's `timeOfDay`, so night and midnight jobs run at whatever hour it is | proven bug | major | high |
| P2 | The strict campaign queue plays the epilogue "Le dernier voyage" (Fin août) as job 15 of 33, around 5 July in the prototype | proven bug (known in STORY-BACKLOG) | major | high |
| P3 | Farming is unbounded in the prototype: replays pay in full plus style, with no day cost | design | major | high |
| P4 | Jumps pay $84 to $108 a flight, and the repeat penalty resets after 60 s | design | major | medium (depends on player rate) |
| P5 | The M modes pay $435 for a sweep, with no gate and no limit, from the first minute | design | major | high |
| P6 | Fuel and repairs barely cost anything: $31-45 of gas for a whole pass against the ~$250 fuel.js intends | design | minor | high |
| P7 | index.html: the ending only comes after 72 day-spends, but only 33 unique jobs exist, and "Recommencer la job" dodges the day cost | design / bug | major (index only) | high |
| P8 | Losing an ambush says "Tu lui dois 20 $" but charges nothing | proven bug | minor | high |
| P9 | Races get PAY_LIFT although the code comment says races take difficulty only | proven bug | minor | high |
| P10 | After the ending, the prototype loops Labour Day forever and repeats the "Fête du Travail" toast and an autosave every 24 min | proven bug | minor | high |
| P11 | The prototype panel's hour slider silently freezes the calendar and can move time backwards; its teleport buttons work mid-job | proven bug | minor | high |
| P12 | Prototype new game ignores hard mode's start day (24 July) but keeps hard pay and fines | proven bug | minor | high |
| P13 | UI counters: the "x/N jobs faites" denominator grows 28 to 33, and pause says "Été terminé" before the summer ends | proven bug | minor | high |
| P14 | La surchauffe sends the GPS to the Canadian Tire marker for "Garage Lafleur", while the only paid shop is 143 Principale | proven inconsistency | minor | high |

Checks that came out as expected (all verified):

- Completing or failing a job in the prototype does not advance the day or reset the hour.
- The prototype starts on 26 June 2004 at 06:00.
- Weather follows the daily records.
- A broke player cannot get stuck.
- A single clean pass of the missions gets to about the $1,200 target, which is the right balance for missions alone.

## Verified facts

- **Mission counts.** `CAMPAIGN` has 28 jobs and `ARC` has 5 beats, for 33 in `ALL_MISSIONS`. Probe `p1.mjs` prints `CAMPAIGN 28 ALL 33 ARC 5`. The arc gates are in `src/game/arc.js:391-400` and need 1, 3, 6, 10 and 14 finished jobs, each after the previous beat.
- **Goal.** `TARGET = 1200` (`calendar.js:17`) and `DEFAULT_TARGET = 1200` (`save.js:84`). The player starts with `START_MONEY = 80` (`save.js:87`).
- **Prototype start.** `main.js:1041` sets `G.day=0; G.dayClock=6/24*DAY_NIGHT_CYCLE`, and day 0 is Sat 26 June 2004 (`calendar.js:14`). `boot.js:11-14` defaults to 24 minutes a day, and the options are 12, 24 and 48 minutes. The panel also offers `clockRate` 0 and 24x (`panel.js:9-10`).
- **Dates change at midnight only.** `calendar-clock.js:2-10` adds whole midnights, and `smoke_prototype_calendar` asserts "18 minutes from 06:00 to midnight".
- **Jobs do not consume time in the prototype.** `endOfJob()` returns early in the prototype (`main.js:1462-1465`), and `setEnv()` returns early too (`main.js:1283-1286`), so the job's `timeOfDay` no longer moves the clock. A grep for every writer of `G.dayClock` or `G.day` finds only these: load/new game (`main.js:1004,1020,1041,1093`), `updateDayNight` (`1347/1354`), the debug hooks `visualClock`/`env` (`3005`, `3032`) and `calendar.spendDay` (`1466`, unreachable in the prototype). Nothing in the completion path (`main.js:1616-1661`) or `failMission` (`1487-1507`) touches the clock.
- **Historical weather.** `applyRecordedWeather` is called on every tick with the day's record (`main.js:1348`). The V key cannot reroll the weather in the prototype (`main.js:1851`). The smoke test checks all 73 dated records.
- **Access paths all go through one gate: `missionAvailable`** (`missions.js:452-457`).
  - The nearby prompt (`main.js:1525`), the map markers (`main.js:1732, 2553, 2579`) and the free-roam line and waypoint (`story.js:121-149`) all use it.
  - The pause list (`main.js:2592-2620`) shows locked jobs as "🔒 … Finis d'abord : <next>", and it cannot be clicked while a job is running.
  - `startMission` refuses with the same "Finis d'abord" toast (`main.js:1373-1376`).
  - Replays of finished jobs are always allowed.
  - Generated modes and ambushes are not in `ALL_MISSIONS`, so they skip the gate by design (`missions.js:455`).
  - `smoke_campaign_spare` asserts that exactly one new job is offered at a time.
- **Car unlocks.** In `garage.js:40-99`, the Saturn comes from `gang`, the Civic from `poutine` and the Sunfire from `curfew`, and all three are in the campaign. The unlock is granted when the job completes (`main.js:1620-1631`). The bus needs 10 jobs plus $1,500. The brief line "Ça te donne les clés…" is added at import (`missions.js:468-482`).

## Economy measurement (normal difficulty, Ranger)

Probe `p4.mjs` builds every job in campaign order. It routes each stage over the real road graph with the GPS's own `Nav` (the same method as `tools/timers.mjs`), plus the approach drive from the previous job's end. Pay goes through `scaledPay` (PAY_LIFT 1.05, rounded per stage), and costs are subtracted.

```
Ranger fuel $/km: cruise(half throttle) 0.106  full throttle 0.154  tank 62L = $52.64  range cruise 496 km
ONE PASS (33 jobs, normal, PAY_LIFT 1.05): pay $1151  job km 177.7  approach km 114.1  fuel@full-throttle $45  fuel@cruise $31
Start $80 + pass $1151 + clean-style $5x33=165 => $1396 gross before fuel; max style cap 15x33=495
Wallet crosses $1,200 after job #29 (golfcart), wallet $1218 (style +5/job, fuel at full throttle)
No style bonus at all: end-of-pass wallet $1186
```

The race, find, follow and drop-off stages cannot be routed, so the km figure is a lower bound. Fuel stays under $100 even if it is doubled.

Pay per job, including net costs: `canot` 45+21 against 90, and `arcsurchauffe` 60 of parts against 90 of deliveries. The full table is in the `p4.mjs` output. The biggest single payers are `chelsea` $79, `highwayhull` $63 and `arcbache` $58. The smallest are `dep` and `solerrand` at $16 each.

Costs:

- **Fuel:** $0.849/L (`fuel.js:11`). The Ranger burns 12.5 L/100 km, times a 0.55-1.45 load factor (`fuel.js:29-33, 75-80`).
- **Shop repair:** 20 % of damage, never under $5, plus a 10 % extra. The most it can cost is **$22** at 100 damage (`damage.js:53-61, 110-114`).
- **Home repair:** free, and takes 10 s (`damage.js:63-65`).
- **Tow:** $60 plus the repair (`tow.js:39-41`).
- **Tickets:** 40, 75 or 120 by difficulty (`calendar.js:31-35`).

Other income:

- **Style bonus:** up to $15 a job, and $5 just for bringing the truck back clean (`missionkit.js:223-236`, capped at `main.js:1636`).
- **Modes:** $435 for a clean sweep of the 9 courses (`modes.js:99-204`).
- **Jumps:** per flight, see P4.
- **Ambush bets:** $20.

Farming rate for replays (probe `p5.mjs`, only jobs where every stage can be routed, 45 km/h average, 45 s of cards, clean bonus included):

```
vitres  $47  loop 0.92 km  ~2.1 min  $22.6/min
quatre  $47  loop 1.6 km   ~2.9 min  $16.3/min
suis    $42  loop 2.5 km   ~4.1 min  $10.3/min
Best routable replay: vitres $47/2.1 min -> $1,120 (target-start) in 24 runs ~ 0.8 h real time = 2.1 prototype days @24min/day
```

How long the calendar lasts (`p7.mjs`):

```
12 min/day: ending fires after 14.55 h real time
24 min/day: ending fires after 29.10 h real time
48 min/day: ending fires after 58.20 h real time
```

A straight one-pass run of all 33 jobs takes about 7 h of real time, which is about 13 July at 24 min a day. A real player is probably 1.5-2x slower, which puts the end of the pass in late July or early August.

**Verdict on balance.** With missions only, a clean pass crosses $1,200 at job 29 of 33. That is the right shape. What breaks it in the prototype is everything around the missions:

- Unlimited full-pay replays (P3), which reach the target in about 50 min.
- Jumps (P4), which reach it in about 14-20 min.
- Modes (P5), which pay $435 a sweep.

On top of that, costs are too small to matter (P6). The calendar used to cap farming, because each job cost a day (`calendar.js:1-9`). Now that jobs no longer cost days, nothing replaces that cap.

**Broke recovery (no softlock found).**

- The wallet never goes below 0 (`money.js:33-39`).
- With a dry tank, **T** sells a 5 L jerrycan for $10. If the player cannot pay, it gives **2 L free**, and this can be repeated (`fuel.js:141-153`, `main.js:1829-1831`). 2 L is about 16 km in the Ranger.
- A dead car is towed home and repaired even at $0 (`main.js:1899-1916`).
- Home repair is free.
- Cost stages (`canot` 45/21, `arcsurchauffe` 60) block with a "Il te manque" prompt. The player can abandon (which refunds that job's pay, `missionkit.js:179-185`) and replay finished jobs, or earn from jumps and modes.
- The worst case is this: the player gets to Norm's pay stage with under $60 after spending the delivery money at the pump. With no timer on the stage, they are stuck inside the job until jumps earn the difference or they abandon it. That is recoverable but not signposted (minor UX).

---

## Proven bugs

### P1 - Prototype runs night and midnight jobs at any hour (major, high)

- **Observed.**
  - In the prototype, `setEnv(def.timeOfDay)` returns right away (`main.js:1283-1286`), so a job's `timeOfDay` only exists as data.
  - Nothing else checks the hour when a job is offered (`main.js:1525-1582`), so every job can be started at any time.
  - Probe `p3.mjs` lists the text that depends on the time of day. Jobs tagged `night`: `curfew` "Avant minuit / avant minuit / Lumière de la cuisine éteinte", `sayyad` "Il dort comme une roche", `seme`, `quatre` "Fin de veillée".
  - Other time-bound text: `arcbache` stage 4 "Le sprint de minuit" (tagged `day`), `tour` "Coucher de soleil… le soleil tombe", `school` "Tu t'es réveillé à 8h52", `poutine` "pas de char à midi", `sunfire` failWhy "Le soleil est couché", `circuit` "le dimanche matin".
  - Timers are in real seconds, and at 24 min a day, 210 s is 3.5 game hours (`p7.mjs`). So "Avant minuit" started at 22:30 finishes after 01:00 and still says "Tu es correct".
- **Expected.** Either the job is only offered in its time window, or its text does not claim a time.
- **Reproduce.** Open prototype.html, start a new game, and with the panel set the hour to 13. Use `AYLMER.G.done=new Set(['alternateur','arckeys','dep','arcbache','gang'])`, then drive to Principale. "Réveiller Sayyad" (night) is offered at 13:00 in full daylight. (This is code-level reasoning. No browser was launched.)
- **Proposed fix.**
  - Give each def an optional `hours: [from, to]`, for example curfew and quatre `[20, 3]`, sayyad and seme `[21, 4]`, tour `[18, 21]`, school `[7, 10]`.
  - In the prototype, show a locked giver as "Reviens à soir (20 h)" instead of the ⏎ prompt, and keep the pause list's reason in step.
  - Add a visible "attendre à ce soir" action at 299 Fraser that moves the clock forward honestly. It passes midnight properly and shows a toast, so time is never taken secretly.
  - Where a window would feel like a chore (poutine, circuit), rewrite the text so it does not name a time. `index.html` keeps working as it does now.
- **Validate.** Write a node probe that loops over `ALL_MISSIONS` × 24 hours and asserts that `offered(def, hour)` matches `hours`. `smoke_campaign_spare` also needs to allow a job to be the next one but not offered right now.

### P2 - Epilogue plays at job 15 of 33, the week of 5 July (major, high; already listed in `docs/STORY-BACKLOG.md:158`)

- **Observed.**
  - `nextMission` always puts an open arc beat before the campaign (`missions.js:447-451`). With the gates 1/3/6/10/14, the order is: `alternateur > arckeys > dep > arcbache > gang > sayyad > arcsurchauffe > poutine > curfew > cv > arcveillee > divan > school > tour > arcdernier > canot > … > russellroyal` (`p1.mjs`).
  - "Le dernier voyage" ("Fin août… Tes clés… t'es plus le même gars qu'en juin") is job 15, and 18 jobs follow it.
  - `p4.mjs` estimates when each beat lands at 24 min a day (a lower bound): arcsurchauffe "Canicule de juillet" around 30 June, arcveillee ("acceptance letters, Montréal in three weeks") around 2 July, arcdernier around 5 July.
  - `arcbache` says "La Saint-Jean s'installe" (`arc.js:111`), but the game starts two days after the Saint-Jean.
- **Expected.** The final beat comes last, and dated beats fall on or after their dates.
- **Proposed fix (two numbers to choose).**
  - Gate by count: `arcdernier.jobs: 32` (after every campaign job), `arcveillee: 22`, `arcsurchauffe: 12`, `arcbache: 5`.
  - In the prototype, also gate by date with `fromDay`: arcsurchauffe at 14 or later (10 July), arcveillee at 50 or later (15 Aug), arcdernier at 62 or later (27 Aug).
  - When a beat is waiting on its date, `nextMission` should fall through to `CAMPAIGN`, so the queue never stalls.
  - The ending then lines up with Labour Day.
- **Validate.** In `p1.mjs`, `order.indexOf('arcdernier') === order.length-1`. Add a probe that gates by date, and check `nextMission` is never `null` while undone campaign jobs remain.

### P8 - Losing an ambush says you owe $20 but charges nothing (minor, high)

- **Observed.** `ambush.js:91` has failWhy "Tu lui dois 20 $". `raceTo` (`verbs.js:338-361`) only pays when you win, and `failMission` only refunds what the job paid (`missionkit.js:179-185`).
- **Fix.** Either charge `min(bet, wallet)` in the ambush's fail path, or change the text to "Il va s'en vanter" or similar.
- **Validate.** Unit-test that the ambush def's `cleanup(G, m, failed)` changes the wallet.

### P9 - Races are scaled by PAY_LIFT (minor, high)

- **Observed.** `scaledPay` treats a def as a race only when it has `mode` (`missionkit.js:158-163`). `raceMission` sets `race: true` and no `mode` (`racejobs.js:326-336`), so `racedave` pays 26 instead of 25, `racecivic` 32 instead of 30, `circuit` 42 instead of 40 and `blitz` 37 instead of 35 (`p4.mjs` table).
- **Fix.** Use `(m.def.mode || m.def.race)`.
- **Validate.** `missionPayout`-style probe: races equal `money × racePayScale`.

### P10 - After the ending, Labour Day repeats forever (minor, high)

- **Observed.** Once `summerOver` is set, `advanceSummerClock` keeps counting midnights but caps the day at 72 (`calendar-clock.js:7-8`). `updateDayNight` then shows "Lun 6 sept · Fête du Travail." and autosaves at every midnight (`main.js:1349`). `p7.mjs` shows 3 midnights in 72 real minutes, with the day stuck at 72. The envelope meanwhile reads "L'été est fini." (`calendar.js:110`).
- **Fix.** After the ending, skip the midnight toast, or show a post-summer label ("Septembre" and similar).
- **Validate.** `p7.mjs`: with `summerOver`, the midnight branch produces no toast.

### P11 - The prototype panel can freeze or rewind the calendar and teleport mid-job (minor, high)

- **Observed.**
  - The hour slider silently sets `clockRate=0` (`panel.js:21`), and the date stops advancing (`p7.mjs`: 10 real hours at rate 0 leaves the day at 10).
  - The Matin/Midi/Soir/Nuit buttons set the hour directly, so 23:50 can be moved to 06:30 without passing midnight. That lets a player dodge the final midnight.
  - The Fraser/Principale/Marina buttons teleport even while a job is running (`panel.js:24-28`), which cuts a farming loop like `vitres` to seconds.
- **Fix.** Put these tools behind `?dev` or `?audioReview`, or turn them off while `G.mission` is set, and have the hour controls only move forward (through a midnight when needed).
- **Validate.** A manual panel test, plus a node test of an `advanceTo(hour)` helper that always moves forward.

### P12 - Prototype new game ignores hard mode's start date (minor, high)

- **Observed.** `restoreSummer` sets `G.day = DIFF.hard.firstDay` (28, which is 24 July; `calendar.js:31-35`). `main.js:1041` then forces `G.day=0` for a new prototype game, while hard pay (×0.8) and the $120 ticket still apply.
- **Fix.** Use `G.day = calendar.diff(G).firstDay` there.
- **Validate.** A node probe of `enterDrive`'s summer block, or a manual check of the envelope date.

### P13 - Progress counters (minor, high)

- The completion toast uses `G.done.size + '/' + MISSIONS.length` (`main.js:1639`), and `MISSIONS` grows from 28 to 33 as beats unlock. Use `ALL_MISSIONS.length` (33).
- The pause header shows "Été terminé" once `nextMission` is null (`main.js:2595`), even with 50 days left in the prototype. Use "Toutes les jobs faites" when `!G.summerOver`.

### P14 - La surchauffe's garage points at Canadian Tire (minor, high)

- **Observed.** The flatbed drops the truck at `PLACES.ctire` (`arc.js:205`), and the lecture and pay stages target `ctire` with the text "Garage Lafleur, chemin d'Aylmer" (`arc.js:215-253`). The only paid repair shop is `norm`, Garage Hugo Caumartin at 143 Principale (`damage.js:66`, `economy.js`). `vitres` calls the same place "Garage Norm Lafleur & Fils" (`verbjobs.js:69`).
- **Fix.** Hand this to the story owner to pick one garage. The code change is just the `at` key.

---

## Design judgements (recommendations with numbers, nothing rebalanced)

### P3 - Replay farming has no limit in the prototype (major)

- **Observed.** A finished job can be replayed for full pay plus a style bonus of up to $15. Only `index.html` charges a day for it (`main.js:1462-1467`), which is the brake `calendar.js:1-9` was designed around. The fastest loop measured is `vitres` at $47 per 2.1 min, about $22 a minute, which reaches the target in about 24 runs, about 50 min of real time, about 2 game days.
- **Recommendation.**
  - Pay in full the first time. Pay 25 % on a replay, with no style bonus, and at most one paid replay per job per game day. That gives `vitres` about $12, and farming the target then takes about 8 game days of doing nothing else. Farming stays possible, but it becomes a choice with a cost.
  - Show the replay price in the prompt: "(déjà fait · 12 $)".
- **Validate.** Rerun `p5.mjs` with the replay multiplier and keep the best farming rate under about $6 a minute.

### P4 - Jumps out-earn the campaign (major, medium)

- **Observed.** `smoke_jumps` drives the real physics off each ramp and measures a clean `chantier` at **$84** and `hull` at **$108**. All 11 ramps come to $520. The repeat decay (1, 0.6, 0.4, 0.25) forgets a ramp after **60 s** (`jumps.js:322-323`), and the money goes straight into the wallet (`jumps.js:595`).
  - One `chantier` jump a minute is about $84 a minute, so the target takes about 14 jumps.
  - Mixing ramps gets there faster.
  - How quickly a real player can loop a ramp is untested, which is why confidence is medium.
- **Recommendation.** Make `repeatForget` one game day, not 60 s, so each ramp pays in full once a day. Also scale `airBase` from 2.44 down to about 0.5, which puts `chantier` near $17 and all 11 ramps near $105, the most a day could pay out.
- **Validate.** `smoke_jumps` pay assertions, plus a probe that sums the most jumps can pay per game day.

### P5 - Modes are an ungated money tap (major)

- **Observed.** The 4 blitz and 4 checkpoint courses (`modes.js:99-204`) pay $435 for a clean sweep, and `bz_hull` or `cp_hull` alone pay $80-90 each.
  - They open with M from the first minute and skip `missionAvailable`.
  - They can be repeated with no limit, and in the prototype they cost no day.
- **Recommendation.**
  - Pay the full purse on the first win.
  - After that, pay $10 only for beating your own best time (the bests are already stored in `aylmer.modes`).
  - Optionally, lock the Hull courses until `highwayhull` is done.
- **Validate.** A `smoke_modes` case: the second win of the same course pays at most $10 unless it sets a new best.

### P6 - Costs do not bite (minor)

- **Observed.**
  - The whole pass burns $31-45 of fuel, about 3 % of income. The fuel.js header promises "about $250 … a quarter of what the jobs bring in" (`fuel.js:1-5`), and it is off by about 6x.
  - Repairs cost at most $22, and fixing at home is free, so the $60 hose in `arcsurchauffe` is the only repair bill that counts.
  - Money sinks exist (cars at $250-1,500, upgrades, the $800 restoration), but they are all optional.
- **Recommendation.**
  - Keep the 2004 pump price.
  - Add one time-based cost that matches the story: the Ranger's share of insurance and upkeep, **$25 every Sunday midnight**. That is 10 Sundays, $250 over the summer, which is the fuel.js target.
  - Charge it at midnight in the prototype, where days now pass on the clock. Never let the wallet go below 0, and show it in the date toast.
  - With P3-P5 in place, one pass nets about $1,350 - 250 = **$1,100**, so the last $100 has to be earned in August. That is the "felt in August, not failed in July" shape `calendar.js:5-8` asks for, without changing the target.
- **Validate.** A new `p4.mjs` line: one pass minus weekly costs is between $1,050 and $1,200, and a pass plus 8 capped replays is at least $1,200.

### P7 - index.html: the ending needs grinding, and Restart dodges it (major, index only)

- **Observed.**
  - In index.html the date only moves when a job completes, or when one fails after 45 s (`main.js:1487-1494`).
  - The ending needs 72 day-spends (`p7.mjs`: "jobs/fails until Labour Day ending = 72"), but there are only 33 unique jobs. A player who finishes everything never sees Labour Day unless they replay 39 more times.
  - "Recommencer la job" refunds the job but never calls `endOfJob` (`main.js:2929-2934`), so restarting avoids the day cost that failing charges.
- **Recommendation.** Either retire the per-job day cost in index.html the same way it was retired in the prototype, or add a "passer à la fête du Travail" action once the campaign is done. Restart should cost the same as a failure.

### Ending and free roam (as intended, two notes)

- The prototype ending fires at the midnight that ends Labour Day (`calendar-clock.js:7`, and the smoke test says "finish after a full Labour Day").
- The cards read `LA FÊTE DU TRAVAIL / LA SUITE or ENCORE UN BOUT DE CHEMIN / SEPTEMBRE` (`story.js:37-46`).
- Afterwards, jobs, modes and replays stay open, and ambushes stop (`ambush.js:53`).
- Note 1: after the ending, `checkReached` is disabled (`calendar.js:121`). A player who reaches $1,200 after the "ENCORE UN BOUT DE CHEMIN" card never gets a closing line, although the card invites them to keep working. Consider a one-off late "objectif atteint" toast.
- Note 2: if the final midnight comes during a job, the cards interrupt it and the job continues afterwards. The verdict uses the wallet at that moment, so pay from the job still running does not count. That is acceptable, but worth knowing.

## Hypotheses (not proven, worth a playtest)

- **H1.** The Norm pay stage could leave a player stuck if they fill the tank with the delivery money. Recoverable, but it needs a hint such as "Abandonne (⌫) ou saute pour gagner le reste".
- **H2.** Characters without a licence (Zahra on the Diamondback) meet `gang` early in the queue. The stage refuses on a bike ("Reviens en char") and the garage still lends the Ranger, so there is no hard lock. But the strict queue forces a character who "never will" drive the truck into it. Needs a playtest.
- **H3.** In the prototype the timers are real seconds, but the story clock is game hours (`chelsea` 600 s is 10 game hours). If P1 adds time windows, a long job can cross the end of its window. Only check the window when the job starts.

## index.html vs prototype.html, for progression

| | index.html | prototype.html |
|---|---|---|
| Date moves | +1 day per completed job, or a failed job over 45 s (easy +0.5) | on the real clock: 12/24/48 min per day, whole midnights only |
| Start | day 0 (hard: day 28), 10-min sky loop, not dated | day 0 at 06:00; hard mode start ignored (P12) |
| Job `timeOfDay` | pins the sky for the job | ignored (P1) |
| Ending | when day 72 is reached through jobs | at the midnight after Labour Day |
| Weather | random, V rerolls it | 2004 daily record, V shows it only |
| Farming brake | the day cost | none (P3-P5) |
| Storage | `aylmer.*` | prefixed `aylmer2004.prototype.*` (`boot.js:1-10`), so saves never cross between the two |
| Dev panel | none | hour, rate, teleport, all exposed to the player (P11) |

---

## Fixes applied - branch `qr/econ`, 29 Sep 2026

Run `node tools/smoke_econ.mjs` (52 checks) and `node tools/smoke_jumps.mjs` (the new "bumpy road" and "real ramp through the hook" groups) to see every rule below hold.

### Before and after (normal difficulty, Ranger)

| | before | after |
|---|---|---|
| Bumpy road, 2 min of 0.8-1.4 s hops through `updateJumps` | $2,060 (min $1 a hop, grid-cell decay never fired, chains x3) | $6 (nothing under 1.0 s off a ramp, rolling cap $3 per 60 s) |
| One clean `chantier` jump | $84, full again after 60 s | $34 first of the game day, then 25 %, 10 %, 5 % |
| All eleven ramps, one lap | $520, repeatable every minute | $225, the most a game day can pay in full |
| Looping one ramp for a 24-min day | ~$84/min | ~$3.7/min |
| One clean pass of the 33 jobs (probe `p4`) | $1,151 | $1,144 (races lose the 1.05 lift: 25/30/40/35) |
| Wallet crosses $1,200 (pass + clean style) | after job 29 of 33 | after job 29 of 33 ($1,227); arcdernier is now job 33 |
| Best replay loop (`vitres`) | $47 per 2.1 min, ~$22/min, forever | $11 once per game day, then $0 |
| Best farming day, every routable replay at 25 % | unbounded | 5 replays, $46 in 24 min, ~$1.9/min |
| $1,200 by farming alone | ~50 min real, ~2 game days | ~24 game days, ~9.7 h real |
| M-menu courses | $435 a sweep, every sweep | $435 once per save, then at most $10 for a new best |
| Ambush lost | "Tu lui dois 20 $", $0 charged | $20 charged (never below zero) |

In the prototype, the arc dates mean `arcveillee` (15 Aug) and `arcdernier` (25 Aug) come last. The campaign jobs are not held up while those two wait, so the $1,200 crossing still happens around job 29, in late July or early August for a typical player.

### What changed, by finding

- **P1**: `src/game/jobwindows.js` holds `MISSION_WINDOWS`, keyed by mission id and kept apart from the job text. The windows are:
  - curfew (or its breakfast-nachos retheme), sayyad and quatre: 21-4 h
  - seme: 20-4 h
  - arcbache: 17-23 h
  - school (first period, or the 5:45 shift): 4-8 h
  - tour: 17-22 h

  The window is checked at start, and only in the prototype. `missionLockReason(G, def)` returns the French line ("Reviens après 21 h (jusqu'à 4 h).", "Reviens demain matin, entre 4 h et 8 h."). `nextMission` falls through to the next job that can start. The clock is never moved for the player. When you park at a giver whose job is waiting, `unlockArc` toasts the wait once. `advanceTo(G, hour)` in `calendar-clock.js` is a forward-only "attendre à ce soir" helper, but nothing binds it yet.
- **P2**: `arc.js` `GATES` counts changed from 1/3/6/10/14 to 1/5/12/22/32, plus `fromDay` dates for the prototype: 1 juillet, 10 juillet, 15 août, 25 août. The "NOUVELLE JOB" toast now waits for the date as well.
- **P3/P5/P9**: `missionkit.js` `runPay` and `scaledPay`. The course win line (`modes.js` `purseLine`) says which kind of payout it was.
- **P4**: `jumps.js` `airBase` goes from 2.44 to 0.5, `repeatDecay` from [1, .6, .4, .25] over 60 s to [1, .25, .1, .05] per game day, and there is a new off-ramp budget. The ramp or site is latched at take-off.
- **P7**: once `arcdernier` is done, `calendar.spendDay` moves to Labour Day, so the ending runs. `restartCostsDay(m)` is added for the restart (see the patches).
- **P8**: `ambush.js` cleanup charges the bet on a loss.
- **P10**: `advanceSummerClock` reports no midnights after `summerOver`.
- **P14**: arcsurchauffe's flatbed and both garage stages now point at `PLACES.norm`.
- **Shops** (`economy.js`):
  - Escape and the other close keys are consumed, so pause no longer pops up on the next frame.
  - While the garage, Volkov or Kijiji is open, `G.mode` is `'shop'`, so the sim and the mission timers wait.
  - `repaint()` frees the old body mesh and keeps `buildBody`.
- **Dad's call**: `src/game/dadcall.js`, triggered from `fuel.tickFuel`. The hook is documented at the top of that file. Story's export is `DAD_CALLS` in `story.js`.

### P6: fuel (recommendation only, nothing rebalanced)

- One pass drives about 289 km and burns $31-44, which is about 3 % of income. The `fuel.js` header says about $250.
- Now that farming is capped, the income side is honest again. But fuel would have to cost about 6x more to reach $250, which means $5/L or 75 L/100 km, and neither is 2004.
- Recommendation: keep the pump price, and correct the header's $250 to "about $40-90 a summer". Let the cost pressure come from:
  - the $60 hose;
  - tows ($60 plus the repair);
  - tickets.
- The weekly Sunday cost stays out, as the owner ruled.
- If more pressure is wanted later, the smallest honest lever is the shop repair: raise its $5 floor and 20 % rate to 35 %, which makes the worst case about $38 instead of $22.

### Patches needed in files this branch does not own

`src/main.js` (systems agent):

```js
// P12 (hard mode start ignored), ~l.1041:
if (!save) { G.day=calendar.diff(G).firstDay; G.dayClock=6/24*DAY_NIGHT_CYCLE; }
// P13, ~l.1639: the denominator grew 28 -> 33 as beats unlocked
+ '\n' + G.done.size + '/' + ALL_MISSIONS.length + ' jobs faites', 4600);
// P13, fillJobs: 'Été terminé' only when it is
$('pausemission').textContent=current?.title || (G.summerOver ? (en?'Summer complete':'Été terminé') : (en?'All jobs done':'Toutes les jobs faites'));
// P1/P2 lock reasons, fillJobs `note.textContent=` for a locked row:
note.textContent=allowed ? PLACES[d.giver]?.label || '' : missionLockReason(G,d);
// ...and startMission's refusal toast:
hud.toast(missionLockReason(G,def) || 'Job indisponible',2500);
// (import missionLockReason from './game/missions.js'; restartCostsDay from './game/missionkit.js')
// P7, « Recommencer la job » must cost the day a failure costs (endOfJob is a no-op in the prototype):
const def=G.mission?.def;if(!def)return;
const costsDay=restartCostsDay(G.mission);
refundJob(G,G.mission);missionCleanup(G,G.mission,true);
G.mission=null;G.veh.passengers=0;G.wantStart=false;G.offer=null;
if (costsDay) endOfJob();
pause(false);if(!G.summerOver)startMission(def);
// Optional: the replay price in the prompt, ~l.1579:
const again = G.done.has(G.offer.id) ? ' (déjà fait · 25 %)' : '';
```

- `src/game/save.js` (save agent): persist `G.replayPaid` (job id -> day index) and `G.dadCalls` (`{ n, week, log }`). Without them, a reload allows one extra 25 % replay per job and resets Dad's count.
- `src/game/story.js` and job text (story agent):
  - Export `DAD_CALLS`, using the schema in `dadcall.js`.
  - arcsurchauffe's text still says "Garage Lafleur, chemin d'Aylmer", "deux minutes du garage" and "Un alternateur pour le gars du Canadian Tire". The GPS now goes to 143 Principale.
  - arcbache says "La Saint-Jean s'installe", but it now opens on 1 July at the earliest.
  - The windows above assume curfew becomes the nachos before 5 a.m. and school becomes the 5:45 shift. If the retheme lands differently, edit `MISSION_WINDOWS`, not the job.
- `src/prototype/panel.js` (visual agent), P11: the hour slider and time buttons still move time silently (and backwards), and the teleports still work mid-job. `advanceTo()` is the forward-only replacement.
