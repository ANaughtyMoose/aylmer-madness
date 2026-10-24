# S4-SAUNA: mission 7 as Tom told it (E-01, D31)

Branch rf/s4-sauna from fix/look-on-qr at 2fb304c. Builder s4-sauna. Ports 8280/9480 (perf 9580).

## Status

Code done (commits f909ff8, 2e238a4; report ade0e7e and the next commit). npm test 103/103, boot of both entries ok. The harness run was not done: the lead stopped all browser jobs on the Mac (heat, 20 Oct) before it got a slot. It is listed below for the cloud.

## What changed

- `src/game/setpieces/sauna_heat.js`, rewritten: the old heat meter, jug and dépanneur refills are gone; the toy is a water balance on one key (F), pure functions tested in Node.
  - `w` (wetness of the cedar and the cab) 0..1, starts at 0.55 (Sayyad's first splash at the fence). Green band 0.40 to 0.70 = exactly two splashes.
  - It dries all the time: 0.020/s at 40 km/h and up (air through the windows), 0.040/s stopped (sun on the dash), +0.005/s per traffic car within 25 m (max 3). So the open road is calm (a splash every 6 to 8 s) and a red light downtown is a juggle (every 2.5 to 3.5 s).
  - One splash = 0.15 that soaks in over 0.5 s; the meter shows a ghost marker where it will land, so a panicked double press overshoots. 0.35 s between presses.
  - Too little: under 0.40 the screen shimmers, warms and blurs (the old canvas effect, kept); at 0 for 6 s the truck goes sluggish (55 km/h cap).
  - Too much: over 0.70 a white steam layer climbs from the dash and puffs come out of the cab; at 0.95 the dash shorts: sparks everywhere (14 into the fixed spark pool), two white flashes (off under reduced motion), crackles, the radio dies for 6 s (resumed only if the sauna turned it off), the Ranger coughs (25 km/h for 4 s); w drops back to 0.62 (Sayyad opens the windows) with 4 s of grace. The second short also honks the horn three times by itself.
  - A knock (impact 0.35+) sloshes the jug: +0.08.
  - Meter (`#saunaMeter`, same spot above the minimap): the zone in words and colour (« ÇA CUIT », « PARFAIT », « TROP DE VAPEUR », blinking deep in a zone), a bar painted red/orange, green, pale blue, red with a lightning glyph at the short, a white needle and its ghost, and « F : verser · vert 63 % · courts-circuits 1 ». DOM written only when the rounded state changes.
- `src/game/setpieces/sauna.js`, rewritten, six stages, giver now 'sayyad' (job offered at his fence: saves the 2.3 km from home):
  0. Chez Sayyad (no house number any more in the public text): stop, E, the cedar on the dash, Sayyad gets in.
  1. Leg 1 on Chemin d'Aylmer with the toy. At 9,900 m crow from the hospital (1,288 m of route from Sayyad's) a 0.5 s fade to black, unless police stars are on you (« Sème la police avant »).
  2. « Ottawa. Vingt minutes plus tard. » The truck comes back on Booth Street 900 m of route before the hospital (fresh route 886 m). The toy goes on downtown. On arrival the grade card and the sauna bonus (0 to 20 $, 5 $ off per short): « Bon sauna · 72 % dans le vert · 1 court-circuit · sauna +9 $ ».
  3. The lot, E to go in. Sayyad: « Go feed people. I'm walking to NASA. The store, not space. » Narrator: « Sayyad part à pied vers la rue Somerset, chez NASA. »
  4. The meal service (mealshift.js, unchanged, 40 $).
  5. The lot again: « Sayyad est revenu de chez NASA, sur Somerset. Un sac brun, déjà transparent de gras. » Sayyad: « The cedar's still dripping. Your truck smells like a cabin now. » E takes a samosa; end toast « Des samosas chauds, une planche de cèdre mouillée pis 40 $. Pas pire, comme journée. »
  - No clock. A slip never fails the job. Two joke fails, both with the free R retry of the leg (fast: the stage restarts where you are, the cedar back at 0.55): bone dry for 20 s after the sluggish warning (prompt counts down « F! Sayyad cuit! (12 s) ») gives « Coup de chaleur. Le cèdre est sec comme une toast, pis Sayyad aussi. »; the third short (after 1.2 s of sparks) gives « Troisième court-circuit. Le dash est noyé, le Ranger s'éteint dans un nuage de vapeur. » Both classify as 'heat' in retry.js, so the card carries the sauna gag from fails.json.
  - Sayyad speaks English through heckle.line (the story queue, group 'sauna', cancelled on cleanup), at most one zone line per 8 s; table `SAUNA_LINES` (plank, ok x3, cook x2, pinned, fog x2, short1, short2, spill, lot, samosa), each 12 words or fewer, as [who, text] pairs so smoke_lang classifies every one. His tic « OK OK OK » on the first short, his Macs (« If Apple made a truck, it would smell like this. »). The plank line no longer invents his dad.
- `src/game/story.js` FRIEND_LINES.stvincent: the start lines play at the fence, so the narrator's « Tom stationne le Ranger pis rentre... » (wrong moment) is gone; start « OK OK OK. I have the jug. You have the truck. » and « You work, I walk to NASA for samosas. Fair. »; end « Walked to NASA and back. Samosas, still warm. How was the shift? » (replaces « Got you two samosas. There were four. », which invented counts). `assets/text/story.proposed.json` notes updated to match.
- `src/game/retry.js`: one regex, `heat` also matches « nuage de vapeur » (the drowned-dash fail).
- `tools/review/page-agent.js`: `heatTick` replaced: tap F when `w + pend < 0.48` and the cooldown is clear, never during the cut; no refill detours (T.refill gone). The task-end event carries `sauna: { inBand, shorts, spills, pours, w }`.
- `tools/smoke_sp_sauna.mjs`, rewritten, 92 checks (below).

NASA is not placed at a coordinate: the block of 802 Somerset St W is not confirmed from a text source here, so per the design (7.3) it is a direction only (Sayyad walks toward Somerset); nothing is placed on the map.

## Checks

| Check | Result |
|---|---|
| smoke_sp_sauna | 92 passed, 0 failed |
| npm test (RAM guard, 1 slot, at 2e238a4, the final code) | 103/103 |
| smoke_lang, smoke_story, smoke_canon, smoke_campaign, smoke_retry, smoke_missionclose, smoke_vehicle_life, smoke_jobready, smoke_cinematic, smoke_bot | all green (smoke_lang 39/39, 0 fresh breaches, allowlist 191, no sauna entries) |
| boot.mjs `--entries=index,prototype`, ports 8280/9480 | index ok (36.9 s), prototype ok (149.9 s), 0 console errors each, W moved 142.4 m |
| harness `--only stvincent --columns fresh` | NOT RUN (lead's stop order); for the cloud, below |

### The balance, measured (smoke_sp_sauna, 60 Hz)

- Just right: the bot rule (one splash when needle + ghost < 0.48) over a 200 s profile (60 s at 50 km/h, 30 s stopped in 3-car traffic, 110 s at 35 km/h with 1 car): >= 85 % in the green, 0 shorts. Two minutes at 30 km/h in the mission: 100 % green, no fail.
- Too little: no water at cruise: « ÇA CUIT » at 7.5 s, bone dry at 27.5 s, sluggish at 33.5 s, « Coup de chaleur » fail at 47.5 s. A splash every 8 s whatever the meter says: 20 to 65 % green. No water at all: 4 %.
- Too much: four splashes in a row short it at 1.55 s stopped; mashing gives no second short inside 4 s; mashing F the whole drive: 5+ shorts; in the mission, mashing at 40 km/h: 3 shorts and the drowned-dash fail in 10.7 s.
- Mission: leg 1 1,288 m of route to the cut; the cut takes 0.5 s; the truck lands on Booth Street; leg 2 886 m; one short downtown kills the radio and it comes back by itself; grade card and bonus paid on arrival; abort from each of the six stages leaves no toy, no meal overlay, no radio left off.

## Browser checks still needed (for the lead, in the cloud)

1. The bot's run, Tom's ask:
   `node tools/review/harness.mjs --plan full --only stvincent --columns fresh --rev <head of rf/s4-sauna> --out <abs>/rf-s4-sauna/full-stvincent`
   Read SUMMARY.md, metrics.json and transcript.txt. Bars: outcome done; minutes 3.0 to 5.0 (it was 6.56 on effb8ca with the whole 13 km); assists (bot teleports) <= 1 (the scene cut is the game's own `v.reset`, not a bot assist, so it is not counted); vehicle ranger only; console errors 0; worst beat fps >= 55. The task-end event now carries `sauna: { inBand, shorts, spills, pours, w }`: bars inBand >= 0.75 and shorts 0.
   Transcript lines to look for, in order: « La planche de cèdre est sur le dash du Ranger. Sayyad a une cruche d'eau entre les genoux. », SAYYAD « It's one plank. The fence has like a hundred. Nobody counts. », the meter « PARFAIT » / « F : verser · vert NN % · courts-circuits 0 », « Ottawa. Vingt minutes plus tard. », « Le stationnement de St. Vincent. De l'ombre, enfin. » with the grade card « ... % dans le vert · 0 court-circuit · sauna +NN $ », SAYYAD « Go feed people. I'm walking to NASA. The store, not space. », « Sayyad part à pied vers la rue Somerset, chez NASA. », the meal, « Sayyad est revenu de chez NASA, sur Somerset... », SAYYAD « The cedar's still dripping... », « Des samosas chauds... », end line SAYYAD « Walked to NASA and back. Samosas, still warm. How was the shift? ». No « asleep », no « dans le truck ».
2. Too much water in the real page (no bot change needed; any CDP evaluate): during stage 1 or 2, dispatch KeyF keydowns every 0.36 s for 3 s with the radio on. Expect a short within 2.5 s (`G.sauna.s.shorts >= 1`), live sparks (`G.reactive.debris.sparkPool.p.some(q => q.life > 0)`) within 0.5 s, `G.radio.suspended` true then false by 6.5 s, the mission still running. Keep mashing: the third short ends the job with « Troisième court-circuit... nuage de vapeur. » and the fail card offers R (free); R puts the truck back in the same leg with the meter at « PARFAIT ».
3. Too little in the real page: set `G.sauna.s.w = 0` and never press F at full throttle: « La cabine est un four. Le Ranger se traîne. » at 6 s, speed held near 55 km/h, prompt « F! Sayyad cuit! (N s) » counting down, fail « Coup de chaleur... » at 26 s with R.
4. The cut: right after the fade, `nav.streetName` at the truck is Booth Street and `G.sceneCut.id === 'stvincent'`; traffic within 150 m of the truck 3 s later >= 3 (if not, leg 2 is too easy: a contract for the traffic owner, not a sauna change). The chase camera after `v.reset`: if it swoops, E-04 exposes `G.camSnap()` (sauna.js already calls `G.camSnap?.()`).
5. `node tools/qa/hud-overlap.mjs --jobs=stvincent`: 0 overlaps for `#saunaMeter` (now 240 px wide, same spot above the minimap).
6. Frame cost in the mission vs before (B-13b beat or perf.mjs on a downtown pose, GPU+CPU p95): the toy adds one gradient layer (opacity only), at most 4 steam puffs/s into the existing pool and 14 sparks per short into the fixed spark pool; it should be within noise of the old heat effect.

## For the lead

- Ledger entry for the 13 Oct facts (MISSION7-SAUNA.md section 2) is the lead's, private; not touched.
- Questions for Tom's line sitting (unchanged from the design): « Canicule » in the brief is game framing with no ledger source; the finale still prints two friends' house numbers (arc.js, not touched here).
- NASA has no map coordinate (block of 802 Somerset St W not confirmed from a text source here); it is a direction in the narration only. A storefront sign can follow once the block is confirmed.
- retry.js: one regex word ('nuage de vapeur' joins 'chaleur' for the heat gag). page-agent.js: only the sauna block and one field on the job's task-end event.
- The giver moved from 'home' to 'sayyad' (the design's choice): the job is offered at his fence. The harness plans need no change (they start the mission by id).
- Not done from the design, out of this task's files: arc.proposed.json finale rows, the walking Sayyad prop, the medal registry hook (`STVINCENT_MISSION.metrics` exists for it), seed.json re-extract.
