# S1-ENGLISH: the main cast speaks English (20 Oct 2026)

Branch rf/s1-english from 7ed4dfb. Builder s1-english. Tom's decision (20 Oct): rewrite about 80 main-path lines English-first; one trait and one verbal tic per friend from canon only; real English controls for the English setting; shrink the smoke_lang allowlist for every line fixed.

## Status

Done. Commits b19332d, 9361e3f, 72c8188, efb6cb6, 4a547ee, plus this one. All checks green (below). Steps, each committed when done:

1. Report skeleton (this file).
2. story.js: FRIEND_LINES for the ten main missions (plus gang, where Abraham lives), GREETINGS, the DIALOGUE fallbacks.
3. arc.js: the finale callbacks; arcbache Zahra tic.
4. nuittim.js and sauna.js and golfnuit.js and royal.js: the set-piece lines, the tic ledger (Trust me, Science).
5. shots.js and missions.js: the three card slips (curls, speeches, Sayyad's sister).
6. dialogue.json (Sayyad) and zahra.json: the get-in and get-out pools, heard every time they board.
7. i18n.js: real English controls; main.js no longer puts the photocopy filter on the English copy.
8. Allowlist shrink, ALLOW_MAX lowered, tests re-specced to the 6 Oct rule.
9. Checks: npm test, boot of both entries, harness `--only alternateur,sayyad`.

## Before (7ed4dfb)

- smoke_lang: 416 main-cast lines, allowlist 297 entries, 296 still breach (E-01 22, E-06 176, E-07 98), 1 stale.
- smoke_canon mix: 339 spoken cast lines, English 71 (21%), franglais 119 (35%), French 149 (44%).
- npm test: 97/97.

## After (72c8188, checks run 20 Oct 02:10 to 03:19 through qa-slot, one slot)

- smoke_lang: 418 main-cast lines; allowlist 193 entries (was 297), 192 still breach (E-01 16, E-06 78, E-07 98), 0 fresh breaches; 39 passed. New group « one tic each, never shared »: every tic has one owner.
- smoke_canon mix: 340 spoken cast lines, English 162 (48%, was 21%), franglais 69 (20%, was 35%), French 109 (32%, was 44%). The 32% + 20% left is the porch (hangout.json, 98 rows), Adam's pool and the optional jobs.
- npm test: 97/97 suites (same count as 7ed4dfb).
- Boot gate (`tools/qa/boot.mjs --entries=index,prototype`, CMP_SRV_PORT 8264 / CMP_CDP_PORT 9464): index.html menu and drive ok, 0 console errors, moved 144.6 m; prototype.html the same (126 s under load), 0 console errors.
- Harness: `--plan full --only alternateur,sayyad --columns fresh --rev 72c8188 --port 8264 --cdp-port 9464`, pack at references/review/rf-s1-english/full-alternateur-sayyad/. alternateur done by the bot alone in 4.02 min, sayyad done in 1.62 min, console errors 0, exceptions 0, worst mean fps 60, no wrong-vehicle beat. transcript.txt shows the new lines as played, on the heckles channel: 286.8 s MIKE « He’s not answering. Go wake him. Honk. Make noise. », 290.4 s ZAHRA « He won’t wake up. Ever. Good luck. », 331.2 s and 356.4 s ZAHRA « My brother thinks he’s a mechanical genius. He forgot half the bolts. » (her pool, from the driveway), 378.48 s SAYYAD « THAT WAS YOU?! »; Margaret's alternateur lines unchanged at 32.8 s, 42 s, 278 s. The two Sayyad end lines after « THAT WAS YOU?! » fall after the end card closes the beat, as before.

## Merges with fix/look-on-qr (lead's request, 20 Oct)

- bc24fb1: `git merge 387bbda` (s1-d31, s1-hotel, s1-b03/b12b, aud-02, s1-harness). Conflicts in story.js, sauna.js, i18n.js, smoke_lang.mjs and the allowlist, resolved keeping both: their cuts stay cut (arcsurchauffe gone; Sayyad's « I'll be asleep » gone), my English Sayyad line stands in stvincent and the sauna (their narrator fallback « Sayyad part à pied chercher des samosas » replaced by his own English line, as Tom's 20 Oct decision asks); their new `opt.radioAuto` key gets real English (« Radio on at the start »). Allowlist taken from their side (293) and recomputed on the merged tree: 191 entries (E-01 14, E-06 78, E-07 98, B-06 1), ALLOW_MAX 191, 0 fresh breaches, no exemption added. npm test 101/101; boot both entries ok, 0 console errors.
- 9ff5fd9: `git merge 9baf8ae` (s1-timers), clean, no conflicts. npm test 102/102; boot both entries ok, 0 console errors (checks-merged2.log in references/review/rf-s1-english/).

## For the lead

- Merge order: this branch touches story.js, arc.js (FINALE_CALLBACKS and ARC_LINES.arcbache only), nuittim.js, sauna.js, golfnuit.js, royal.js, shots.js, missions.js (one hint), i18n.js, main.js (setPhotocopy), ui.js (one string), dialogue.json, zahra.json, lang-allowlist.json and seven smokes. s1-d31 cuts arcsurchauffe in campaign.js and arc.js GATES/RETIRED; I did not touch those, so the overlap is arc.js only, in different blocks. Its 16 E-01 allowlist entries become stale when the beat goes; the smoke tolerates stale entries.
- Decision: the mix test in smoke_canon and the « accented French » test in smoke_avatars encoded the 28 Sept 15/35/50 rule that Tom superseded on 6 Oct; I re-specced them to the current rule rather than leave them red. If the lead prefers the old assertions kept and skipped, say so.
- The photocopy gag is off, not deleted (question 7 to Tom).


## What changed

- The ten main missions' FRIEND_LINES (story.js), plus `gang` (where Abraham lives), the three driveway greeting pools (Sayyad, Mike, Zahra), the DIALOGUE fallbacks, the nine French finale callbacks (arc.js), the Tim night's friend lines (nuittim.js), the sauna's Sayyad (sauna.js, now D31-true: he walks to NASA for samosas), two tic fixes in golfnuit.js and royal.js, the three card slips in shots.js (curls, speeches, Sayyad's sister) and the gang hint in missions.js. 88 lines, table below.
- The get-in and get-out pools a player hears every time Sayyad or Zahra boards or stands in a driveway on the main path: Sayyad's 24 rows in assets/text/dialogue.json and Zahra's 32 rows in assets/text/zahra.json rewritten English-first (56 rows, not in the table: read the two files). Pool sizes kept (12 / 12 / 8) because smoke_avatars asserts them. The 1998 « pagette » is gone (« call the house »). Zahra's about-her-brother rows no longer invent car facts (chrome muffler, police on the Portage bridge); they tease what canon says: sleeps in, Mac talk, theories, polite with grown-ups.
- Not touched, for the second sitting: the porch (hangout.json, 98 entries, owner E-07), Adam's 24 get-in/out rows in dialogue.json (optional path only; they invent facts about him: Tang and Télétoon, chips, a sore back), the optional jobs (racedave, racecivic, circuit, blitz, highwayhull, chelsea, dep, solerrand: 17 lines), the retired jobs' lines (unreachable; smoke_canon asserts their text still exists), arcsurchauffe (s1-d31 is cutting it) and Tom's two French answers to French strangers in the Tim night (the Centre antipoison, the doughnut guy): that is Aylmer, not a breach, and I kept them on the allowlist rather than translate them. Question 5 below.
- Trait and tic ledger (story.js header, checked by a new smoke_lang group « one tic each, never shared »): Sayyad sleeps then runs on about Macs, tic « OK OK OK » (mission 2, finale, the golf night's « Okay okay okay »); Mike gives the speech, tic « Hear me out » (divan, driveway, finale, intro card); Zahra corrects you then the nails, tic « Wrong. » (Saint-Jean, nachos, finale, her pool); Adam « frolicking in mayo » (nachos kitchen) and Mayo the town (gang, finale); Abraham short and warm, the bike that never leaves the driveway (gang start, gang end, finale); Russell never at fault, « the hill » and « SCIENCE! » (card, Royal Ottawa, finale). « Trust me » was Sayyad's, Russell's and Mike's at once; it now belongs to nobody. Sayyad's « Science! » went to Russell. The deadpan three-word triple is now Sayyad's once (« On. The. Truck. »).
- Real English controls (i18n.js): every EN key rewritten as plain English, no em dash (« Brake of hand » is « Handbrake », « Part charged » is « Game loaded », « EMBARK ▸ new part » is « GO ▸ NEW GAME », the tutorial teaches in English). The language picker says « English ». main.js no longer puts the `.photocopy` filter (blur, toner, rotated panels) on the English copy, so the real labels are readable; the CSS and the gag strings stay in git history (i18n.js before 72c8188) if Tom wants the photocopy back as an opt-in of its own. The erratum under the menu is hidden with the filter off. ui.js's English legend head lost its em dash.
- Allowlist: 297 to 193 entries (104 fixed lines removed; the pinned stale story.js:350 entry stays because smoke_lang asserts on it). ALLOW_MAX 297 to 193. No new exemption.
- Tests re-specced to Tom's 6 Oct and 20 Oct rulings, none loosened to pass a bug: smoke_canon's mix group asserted the superseded 28 Sept 15/35/50 target (it now asserts the cast is mostly English, 45%+, and French in the cast's mouths only shrinks); smoke_avatars asserted the driveway pools « speak accented French » (now: every line English by smoke_lang's classifier); smoke_sp_nuittim, smoke_sp_sauna, smoke_story matched the old French wording; smoke_lang's section A asserted the gag (« translated, badly », EMBARK, the erratum) and now asserts real English labels, no dashes, and « English » in the picker; smoke_ui and smoke_save matched « ROLL » and « Send all the chars at their house ». The « 5 identical strings » bound in smoke_lang is Options (twice), Pause (twice), Menu.

## Before / after table

Every spoken line changed, old to new (inner text, without the « »). The 56 pool rows in dialogue.json and zahra.json are in the files, not here.

| file:line | who | old | new |
|---|---|---|---|
| src/game/story.js:367 | Sayyad | J’attends dans le truck. I’ll be asleep. C’est correct. | I’ll walk to NASA for samosas. You work. I eat. Fair. |
| src/game/story.js:371 | Sayyad | Deux heures. J’ai lu le manuel du Ranger. Twice. | Got you two samosas. There were four. Long shift, Tom. |
| src/game/story.js:433 | Abraham | Salut, man. Ta mère m’a donné du jus. Deux fois. | Hey man. Your mom gave me juice. Twice. |
| src/game/story.js:436 | Adam | La prochaine fois, tu pars de chez nous. | Next time we leave from my place. Mayo. Bring a map. |
| src/game/story.js:437 | Abraham | Same time tomorrow. Mon bike reste chez vous. | Same time tomorrow. My bike lives here now. |
| src/game/story.js:476 | Tyler | Nachos for breakfast. C’est le repas le plus important. | Nachos for breakfast. Most important meal of the day. |
| src/game/story.js:477 | Zahra | Little Big Man finit à cinq heures. Les nachos sont pas faits. | Wrong. Little Big Man ends at five. Drive. |
| src/game/story.js:484 | Adam | (new line, nachos kitchen) | Mine frolicking in mayo. Yes, nachos. Frolicking. |
| src/game/story.js:486 | Zahra | Chut. C’est la bonne partie. | Shh. This is the good part. |
| src/game/story.js:497 | Sayyad | T’as acheté un canot. For forty-five bucks. | A canoe. Forty-five bucks. Does the Ranger know? |
| src/game/story.js:500 | Sayyad | T’as traversé le lac Deschênes dans un canot patché au Bondo. | You crossed Lac Deschênes in a canoe patched with Bondo. |
| src/game/story.js:501 | Sayyad | J’suis fier pis inquiet en même temps. Mostly inquiet. | I’m proud and worried. Mostly worried. No, proud. Worried. |
| src/game/story.js:508 | Mike | Y répond pas. Va le réveiller. Klaxonne, fais du bruit. | He’s not answering. Go wake him. Honk. Make noise. |
| src/game/story.js:509 | Zahra | Il se réveillera pas. Jamais. Good luck. | He won’t wake up. Ever. Good luck. |
| src/game/story.js:512 | Sayyad | C’ÉTAIT TOÉ?! | THAT WAS YOU?! |
| src/game/story.js:513 | Sayyad | OK I’m up. Did you know Panther has Exposé? It’s like magic. | OK OK OK I’m up. Did you know Panther has Exposé? Magic. |
| src/game/story.js:515 | Sayyad | Pis un jour, si tu scratches la Civic en conduisant de même, tu la répares. Tiens, 20 piasses pareil. | Scratch the Civic driving like that, you fix it. Here. Twenty bucks. |
| src/game/story.js:522 | Mike | Ma mère veut le divan dehors. Moi je le veux dans l’arbre. | My mom wants the couch outside. I want it in the tree. |
| src/game/story.js:523 | Mike | C’est pas la même affaire, mais c’est dehors pareil. | Hear me out. Outside, in the tree. Same thing. Better thing. |
| src/game/story.js:526 | Mike | OSTIE. | IT’S UP. Nobody touch anything. IT’S UP. |
| src/game/story.js:527 | Sayyad | On était debout sur le truck. On. The. Truck. | We were standing on the truck. On. The. Truck. |
| src/game/story.js:534 | Mike | Tom. C’est Sam. Il répond presque plus. Viens-t’en. | Tom. It’s Sam. He’s barely answering. Come now. |
| src/game/story.js:535 | Sayyad | J’suis chez Mike. Personne a bu, juste lui. | I’m at Mike’s. Nobody drank. Just him. Come. |
| src/game/story.js:538 | Sayyad | Je passe demain. Avec des muffins. | I’ll come by tomorrow. With muffins. Go sleep. |
| src/game/story.js:544 | Sayyad | Any small key fits a golf cart. Trust me, bro. | Any small key fits a golf cart. Any. I’m serious. |
| src/game/story.js:586 | Sayyad (driveway) | Heille. Tu passes devant chez nous pis tu klaxonnes même pas? | Hey. You drive past my house and don’t even honk? |
| src/game/story.js:587 | Sayyad (driveway) | Deux minutes. Faut que je trouve mes gougounes. | Two minutes. I can’t find my shoes. Or my keys. |
| src/game/story.js:588 | Sayyad (driveway) | Touche pas à la Civic. Regarde-la, c’est tout. | Don’t touch the Civic. Look at it. That’s all. |
| src/game/story.js:589 | Sayyad (driveway) | Did you know Macs don’t get the Windows viruses? None. Zéro. | Did you know Macs don’t get the Windows viruses? None. Zero. |
| src/game/story.js:600 | Mike (driveway) | O.K. mais écoute. ÉCOUTE. J’ai deux cents tounes sur mon iPod. | OK but listen. LISTEN. Two hundred songs on my iPod. |
| src/game/story.js:601 | Mike (driveway) | J’ai trois points à te faire pis le premier en a deux. | I have three points. The first one has two. Hear me out. |
| src/game/story.js:602 | Mike (driveway) | Ma mère a dit non. Ma mère a pas vu le plan. | My mom said no. My mom hasn’t seen the plan. |
| src/game/story.js:603 | Mike (driveway) | Non non non, attends, tu comprends pas encore. Ça va être court. | No no no, wait, you don’t get it yet. It’s short. |
| src/game/story.js:608 | Zahra (driveway) | Il est pas là. Pis non, j’sais pas où. | He’s not here. And no, I don’t know where. |
| src/game/story.js:609 | Zahra (driveway) | Si tu le vois, dis-y que c’est mon tour pour le Discman. | If you see him, it’s my turn for the Discman. |
| src/game/story.js:610 | Zahra (driveway) | Le chat du voisin m’aime plus que le monde. Fair. | The neighbour’s cat likes me more than people. Fair. |
| src/game/story.js:611 | Zahra (driveway) | Approche pas. J’ai fait mes ongles. Ils sont pointus. | Don’t come closer. I did my nails. They’re sharp. |
| src/game/story.js:638 | Sayyad (fallback pool) | Embarque. Non, attends, c’est moi qui embarque. Go. | Get in. No wait, I’m the one getting in. Go. |
| src/game/story.js:640 | Sayyad (fallback pool) | Bon. Ça, c’était une ride. | Okay. That was a ride. |
| src/game/story.js:649 | Adam (fallback pool) | J’embarque en arrière, j’ai les jambes courtes pareil. | I’ll sit in the back. My legs are short anyway. |
| src/game/story.js:650 | Adam (fallback pool) | Bon. À la prochaine. | Okay. See you. |
| src/game/story.js:655 | Zahra (fallback pool) | Embarque pas trop vite, j’ai un café. | Don’t pull out too fast, I have a coffee. |
| src/game/story.js:656 | Zahra (fallback pool) | Sept sur dix. Pour la conduite. | Seven out of ten. For the driving. |
| src/game/story.js:657 | Zahra (fallback pool) | Mon frère pense qu’il est un génie de la mécanique. | My brother thinks he’s a mechanical genius. |
| src/game/arc.js:471 | Sayyad (finale) | Je suis réveillé. Volontairement. Note-le quelque part. | I’m awake. On purpose. OK OK OK. Note it somewhere. |
| src/game/arc.js:471 | Zahra (finale) | Il a pas dormi. Il parle du nouveau iMac. | Wrong. He didn’t sleep. He’s talking about the new iMac. |
| src/game/arc.js:473 | Adam (finale) | Mayo, c’est loin, à soir. Je reste un peu. | Mayo’s far tonight. The town, not the sauce. I’m staying. |
| src/game/arc.js:473 | Alex (finale) | Hey. T’arrives juste à temps. | Hey. You’re right on time. |
| src/game/arc.js:473 | Robin (finale) | Assis-toi. Y reste des chips. | Sit down. There’s chips left. |
| src/game/arc.js:475 | Mike (finale) | Y reste là. C’est un monument, astheure. | It stays up there. Hear me out: it’s a monument now. |
| src/game/arc.js:483 | Abraham (finale) | Encore un tour? Juste un. | One more lap? Just one. |
| src/game/arc.js:485 | Tyler (finale) | Nachos next week? Same time, même film. | Nachos next week? Same time, same movie. |
| src/game/arc.js:685 | Zahra (Saint-Jean, before the fire) | They’re not his dad’s. They’re the school’s. | Wrong. They’re the school’s. Don’t break those either. |
| src/game/setpieces/nuittim.js:84 | Mike | Ok. On his side. On le lâche pas. | Okay. On his side. We don’t leave him. |
| src/game/setpieces/nuittim.js:89 | Sayyad | J’prends ses pieds. On the side, comme elle a dit. | I’ve got his feet. On his side, like she said. |
| src/game/setpieces/nuittim.js:91 | Sayyad | Personne dort cette nuit, hein. | Nobody sleeps tonight, eh. |
| src/game/setpieces/nuittim.js:92 | Tom | Toujours sur le côté. Il respire correct. | Still on his side. He’s breathing fine. |
| src/game/setpieces/nuittim.js:93 | Mike | I got him. Allez manger quelque chose. | I got him. Go eat something. |
| src/game/setpieces/nuittim.js:106 | Sayyad | Man. Tom. You okay? Regarde-moé. | Man. Tom. You okay? Look at me. |
| src/game/setpieces/nuittim.js:107 | Sayyad | Le gars nous suit encore. Là, en arrière. | That guy’s still following us. Right there, behind. |
| src/game/setpieces/nuittim.js:108 | Sayyad | Check ça. Une pancarte de vente de garage. | Check it. A garage sale sign. |
| src/game/setpieces/nuittim.js:109 | Sayyad | Le piquet est en bois. Pointu, même. | The stake is wood. Pointy, even. |
| src/game/setpieces/nuittim.js:110 | Sayyad | Je dis juste. Toé, le piquet, lui. Fini. | I’m just saying. You, the stake, him. Done. |
| src/game/setpieces/nuittim.js:111 | Tom | Non, Sayyad. | No, Sayyad. |
| src/game/setpieces/nuittim.js:112 | Sayyad | Ok ok. Mais c’est un bon piquet. | Fine. But it’s a good stake. |
| src/game/setpieces/nuittim.js:339 | Sayyad | J’ai faim, man. Le Tim? | I’m starving, man. The Tim? |
| src/game/setpieces/nuittim.js:460 | Sayyad | Ça va aller? | You gonna be okay? |
| src/game/setpieces/sauna.js:39 | Sayyad | C’est rendu un sauna icitte. Verse de l’eau, man. | It’s a sauna in here. Pour the water, man. |
| src/game/setpieces/sauna.js:40 | Sayyad | J’vois pu la route. C’est toi ou c’est la chaleur? | I can’t see the road. Is that you or the heat? |
| src/game/setpieces/sauna.js:41 | Sayyad | OK, je fonds. Officiellement. F, man. F! | OK, I’m melting. Officially. F, man. F! |
| src/game/setpieces/sauna.js:44 | Sayyad | Ahhh. Ça, c’est du cèdre. Smell that. | Ahhh. That’s cedar. Smell that. |
| src/game/setpieces/sauna.js:45 | Sayyad | Sauna finlandais, version Ranger. Genius. | Finnish sauna, Ranger edition. Genius. |
| src/game/setpieces/sauna.js:46 | Sayyad | Ma clôture sent bon, avoue. | My fence smells good, admit it. |
| src/game/setpieces/sauna.js:47 | Sayyad | Encore! No wait, garde-z-en pour tantôt. | Again! No wait, save some for later. |
| src/game/setpieces/sauna.js:100 | Sayyad | On est des génies. | We’re geniuses. |
| src/game/setpieces/sauna.js:152 | Sayyad | Mon père va jamais le remarquer. Probably. | My dad will never notice. It’s a big fence. |
| src/game/setpieces/sauna.js:172 | narrator (hold text) | E - entrer. Sayyad garde le truck. | E - entrer. Sayyad part chercher des samosas. |
| src/game/setpieces/sauna.js:180 | Sayyad | J’attends dans le truck. I’ll be asleep. | NASA. Samosas. I’ll be back before you are. |
| src/game/setpieces/golfnuit.js:194 | Sayyad | Any small key starts a golf cart. Any. Trust me. | Any small key starts a golf cart. Any. I’m serious. |
| src/game/setpieces/golfnuit.js:170 | Sayyad | HA! Told you! Any small key! Science! | HA! Told you! Any small key! Get in! |
| src/game/setpieces/royal.js:311 | Russell | The big hill. Handbrake the whole way. Trust me. | The big hill. Handbrake the whole way. What could go wrong? |
| src/game/setpieces/royal.js:393 | Russell | Okay. Golf ball. Exhaust. Just trust me on this one. | Okay. Golf ball. Exhaust. Don’t ask. Just watch. |
| src/game/intro/shots.js:93 | Mike (intro card) | Trust me. That tree is missing a couch. | Hear me out. That tree is missing a couch. |
| src/game/intro/shots.js:81 | card kicker (Zahra) | LA PETITE SŒUR / THE LITTLE SISTER | LA SŒUR DE SAYYAD / SAYYAD’S SISTER |
| src/game/intro/shots.js:89 | card kicker (Mike) | LA CONFIANCE TOTALE / TOTAL CONFIDENCE | LE DISCOURS / THE SPEECH |
| src/game/intro/shots.js:92 | card line (Mike) | Un iPod, des théories sur tout, pis un érable vide. Pour l’instant. | Un iPod, un discours pour chaque occasion, pis un érable vide. Pour l’instant. |
| src/game/intro/shots.js:101 | card line (Abraham) | Des dreads, un t-shirt de Led Zep. Sa bike va finir couchée dans ton entrée. | Des grandes boucles, un t-shirt de Led Zep. Sa bike va finir couchée dans ton entrée. |
| src/game/missions.js:232 | narrator (gang hint) | Les dreads pis le chandail de Led Zeppelin | Les grandes boucles pis le chandail de Led Zeppelin |

## Questions for Tom

Nothing below blocks the merge; every line ships with a fact it does not need. The lines the answers would improve are named.

1. **How you called each other.** The lines use « man » and first names. One true habit per person (did anyone call Abraham « Abe »? Did Sayyad call you Tom, Tommy, something else?) would fix the last of the AI sound. Touches most lines, cheaply.
2. **Mike's speech.** The ledger says only Mike gets to make a speech. About what, one example? His tic « Hear me out » carries it for now (divan, driveway, finale); one true subject would make it his.
3. **Adam.** The Subway order is in the nachos kitchen (« Mine frolicking in mayo. Yes, nachos. Frolicking. ») and Mayo the town gets a joke at the beach on the last night (« The town, not the sauce »). Fine? And one more thing about him (what he drove in on, how late he was, what he did with his hands) would give his optional-job lines a trait too; today they are not written.
4. **Abraham's Yamaha.** The guitar (14 Oct) is not in any main-path line yet; the only guitar line is in an optional job. Is the guitar in the truck bed on the gang run true enough to say, or leave it?
5. **Tom speaking French to French strangers.** In the Tim night Tom talks to the Centre antipoison and to the doughnut guy in French (« Mon ami a trop bu », « Ben oui. Tiens. »). I kept them: an Aylmer kid answers a francophone in French. Agree, or should Tom's own lines be English everywhere?
6. **The end cards.** « L'été d'après, on est tous partis » and the solenoid line are the narrator (French by the 6 Oct rule) in your voice. Left as they are. If you want the last three cards in your own English, say so and it is a five-minute change.
7. **The photocopy gag.** The English setting is plain, readable English now and the paper filter is off. The gag (strings and CSS) is in git history. Do you want it back somewhere as an opt-in (a third language entry, « English (photocopie) »), or is it gone?
8. **Sayyad's « call the house ».** Replaced the 1998 pager (« biper ma pagette ») with « call the house » (landline era, ledger 29 Sept). OK?
