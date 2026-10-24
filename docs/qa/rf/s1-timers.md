# s1-timers: story clocks set from a pace drive (branch rf/s1-timers, base 7ed4dfb)

Status: done. npm test 98/98 (97 + smoke_timers). Boot ok on both entries, 0 console errors. Harness run below.

## Rule
clock = (pace + 3 s) x 1.35, rounded to 5 s. Road pace: race.js pace car (SKILL.pace, top 117 km/h)
in the Ranger, standing start, real road bake, `node tools/timers.mjs --pace` (36 s, writes
tools/timers_pace.json). The 3 s is reading the new objective. Cart pace: 29 km/h straight flag to flag
(the bot pinned at the 34 km/h governor did the four chase flags in 59 s for 476 m) + 4 s per stop-and-E.
Sayyad's getaway starts the pace car facing away from the route (after the doughnuts).

## Steps
1. tools/timers.mjs: guard now compares fileURLToPath(import.meta.url) with resolve(argv[1]); covers
   every clock (shared golf/royal chase clocks, the blitz with its bonus), splits routes by road class.
2. Every timed stage retimed (table below).
3. tools/smoke_timers.mjs (in npm test): fails a clock asking more than the per-class ceiling
   (trunk 100, primary 90, secondary 88, tertiary 75, residential 65, service 35, cart 26 km/h),
   asking less than the floor (50/45/42/38/32/18, cart 15), a blitz gate out of its clock share,
   or a clock more than 5 s off the pace rule. With the old clocks it fails 4 static checks
   (Hull 1 impossible; La Saint-Jean, arcsurchauffe, Hull 3 set dressing). After the merge of 387bbda
   (D31 cut arcsurchauffe) its clock is gone from the code, timers_pace.json and timers.md.

## The table (pace from tools/timers_pace.json; route m is the GPS route, or the straight line on the grass)

| stage | route m | old s | new s | asks km/h old | asks km/h new | pace s |
|---|---:|---:|---:|---:|---:|---:|
| sayyad 3/3 getaway (passes at 300 m straight line) | 382 | 25 | 30 | 55 | 46 | 18.3 |
| arcbache 2/5 La Saint-Jean haul | 2,131 | 320 | 115 | 24 | 67 | 80.8 |
| golfcart 7-11/12 owners' chase, 4 flags + bikes (cart) | 649 | 100 | 120 | 23 | 19 | 84.5 (cart) |
| school 1/1 to the Royal Ottawa | 5,748 | 420 | 260 | 49 | 80 | 189.8 |
| russellroyal 2-7/13 marshal chase, 6 flags (cart) | 1,178 | 150 | 200 | 28 | 21 | 146.2 (cart) |
| curfew 1/1 | 3,189 | 210 | 160 | 55 | 72 | 116.8 |
| dep 2/2 to the beach | 1,103 | 95 | 60 | 42 | 66 | 42.0 |
| margaretdental 2/2 | 2,392 | 190 | 115 | 45 | 75 | 83.3 |
| highwayhull 1/3 | 12,136 | 260 | 525 | 168 | 83 | 386.7 |
| highwayhull 2/3 | 8,091 | 300 | 355 | 97 | 82 | 259.8 |
| highwayhull 3/3 | 840 | 110 | 65 | 27 | 47 | 46.0 |
| chelsea 1/1 | 9,817 | 600 | 465 | 59 | 76 | 340.9 |
| blitz (story), 6 gates | 2,420 | 135 (60+15x5) | 205 (130+15x5) | 65 | 42 | 149.9 |

## Golf night
- The bikes target was already the tee (trace: distToTarget 177 m at flag 4 is the tee, the lot is 245 m).
  What sent the player to the lot side was the GPS line: Nav routed the cart out to rue du Golf and back
  (246 m by road for 172 m of grass). Chase and bikes stages are now `noRoute` (pillar, no line), and the
  sub/hint say « à côté du chalet, coupe par le gazon » instead of « au premier tertre » alone.
- page-agent.js: in a cart on a noRoute stage the bot steers straight at the pillar (like a player with no line).
- chaseTime 100 -> 120. smoke_sp_golfnuit's "brief" bound moved 110 -> 130 (the number now comes from the pace
  rule and smoke_timers holds it between the cart ceiling and floor).

## Other test edits (pinned numbers only, no check removed)
smoke_race (blitz clock = BLITZ_CLOCK), smoke_sp_royal (school 260), smoke_story (getaway text names its own time, 30).
smoke_ui: timers.md keeps an every-stage table so its per-job checks still hold.

## Harness: --plan full --only sayyad,golfcart --columns fresh, --rev 6cbffa6, ports 8256/9456
Pack: aylmer-madness/references/review/rf-s1-timers/harness-6cbffa6 (Ranger, 60 fps worst beat, 0 errors).
- sayyad: done, 3.7 min. Getaway 25.4 s against the new 30 s (it would have failed the old 25 s).
- golfcart: the owners' chase passed for the first time in a Ranger-valid pack: flags 10.2, 14.5, 15.3,
  16.1 s, bikes 22.2 s (was 44 to 46 s by road), 78.3 s of a 120 s clock. Then the bot sat 480 s at the
  fence with « Espace : sauter la clôture » up and never pressed Space: bot-abandon at stage 12/12.
  The page agent has no fence-hop verb; this stage was never reached in earlier packs.

## Open for the lead
1. page-agent.js needs a fence hop (Space near FENCE on the bike) before golfcart can show done in a pack.
2. Margaret (190 -> 115) and La Saint-Jean (320 -> 115) are fragile-cargo jobs; the rule is the pace
   car's, which never touches a curb. If Tom finds Margaret too hard, the lever is the 10-point tolerance
   or a careful-driver pace, not a loose clock. Same for curfew at night (210 -> 160).
3. The rule is now enforced: a new clock must be re-paced (node tools/timers.mjs --pace, 36 s) or
   smoke_timers fails it.
