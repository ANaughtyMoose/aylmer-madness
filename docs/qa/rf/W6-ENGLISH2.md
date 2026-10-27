# W6-ENGLISH2: the porch and the optional jobs speak English (20 and 27 Oct 2026)

Branch rf/w6-english2 from fix/look-on-qr 813b1a7, merged with fix/look-on-qr 786acf4 on 27 Oct (2f14332, clean). Builder w6-english2 (wave 6), finished by the wave 7 builder. Scope: the main-cast lines still in French on the porch (assets/text/hangout.json, fallback copy in src/game/hangout.js) and in the optional jobs. Rules: docs/qa/rf/S1-ENGLISH.md and the trait/tic ledger in the src/game/story.js header (Sayyad « OK OK OK » and Macs, Mike « Hear me out » and the speech, Zahra « Wrong. » and the nails, Adam « frolicking in mayo » and Mayo, Abraham short and warm and the bike, Russell « the hill »). Nothing invented about real people: every new line is a translation of what already shipped, plus a tic where it fits. No browser jobs on the Mac (Wave 6 rule); npm test through qa-slot only.

## Status

DONE (27 Oct, wave 7). Head: see the last commit on rf/w6-english2 (a6f19f2 is the last code commit; the report commits follow). Every test ran on the Colab VM through ct.py, nothing on the Mac (27 Oct 00:55 rule). Steps, each committed when done:

1. Report skeleton (this file) and the 10 porch `greet` lines. DONE (dab084a).
2. The porch `catch` section, 64 rows: Mike 16, Sayyad 13, Abraham 11, Adam 9, Zahra 14, plus row 6 already English. DONE (2c6755a, 40723a0, 4514e32, b3b03df, 8f917dd).
3. The porch `job`, `leave` and `slalom` (pitch, win, lose, bin) rows. DONE (ad6e4df, 0ef1d39, and the last commit).
4. Optional jobs (racedave, racecivic, circuit, blitz, highwayhull, chelsea, dep, solerrand). DONE 27 Oct (a6f19f2): the 21 cast lines in story.js FRIEND_LINES (S1-ENGLISH counted 17; the blitz « Soixante secondes » line was French but never on the allowlist, and solerrand's three were in the job list) plus the 7 cast rows in racejobs.js for the same jobs (3 gridToast on the allowlist, 2 intro, 2 lose quotes). The three narrator `day` lines in hangout.json are the narrator, not the cast, and stay French. Narration inside the race cards (brief, gridSub, win, lose outside the « ») stays French.
5. Allowlist shrink and ALLOW_MAX after every step. DONE: 191 to 83 (steps 1 to 3), 83 to 62 (step 4). ALLOW_MAX 62. The allowlist header's count and byOwner, stale since wave 6, are recomputed (62: E-06 47, E-01 14, B-06 1).
6. Tests on steps 1 to 3 (never run in wave 6): three smokes were red after the merge and are fixed in 483f714, none loosened. (a) smoke_hangout expected the French Sunfire row « C'est mon char, ça. »: now expects « That's my car. ». (b) smoke_lang pinned a sentinel « hangout.json:66 is on the allowlist, owner E-07 »: with the porch done the entry is gone, so the check now asserts the opposite, no hangout.json row on the allowlist (E-07 done). (c) smoke_lang's « one tic each » group caught two Mike porch rows from steps 2 and 3 on other people's tics: « I was wrong » (Zahra's « Wrong. » regex) is now « I had it backwards », and « the wrong spot. My fault. » (Zahra's and Russell's) is now « a dumb spot. That's on me. ».
7. Checks on the Colab VM, see Checks.

## Before (813b1a7)

- smoke_lang allowlist 191 entries, ALLOW_MAX 191. hangout.json: 98 rows on the allowlist (owner E-07).

## After step 1

- allowlist 182 entries after step 1 (9 porch greet rows removed; « Ouais. » was never listed), ALLOW_MAX 182.

## After step 3 (d02a691)

- allowlist 83 entries (98 hangout.json rows and 10 src/game/hangout.js fallback rows removed), ALLOW_MAX 83. hangout.json: the five friends speak English in every greet, catch, job, leave and slalom row; the `day` narrator lines stay French.
- Tics used on the porch: Mike « Hear me out » (greet, Norm Lafleur row, job row), Zahra « Wrong. » (the five-races row) and the nails (bag row), Sayyad Macs (PowerBook row). No « Trust me ». No em dash or en dash (the one in the Mike damage row and the slalom win row are gone).

## After step 4 (a6f19f2, branch head for code)

- smoke_lang on the VM: 1934 lines (main 431); allowlist 62 entries, 61 still breach (E-01 14, E-06 47), 1 fixed or gone (the pinned story.js:350 B-06 entry), 0 fresh breaches; 39 passed. ALLOW_MAX 62.
- smoke_canon mix on the VM: 336 spoken cast lines, English 277 (82%, was 77% after step 3 and 48% after S1-ENGLISH), joual/franglais 31 (9%), Quebec French 28 (8%); 139 passed.
- What is left on the allowlist (61 live): E-01 14 (arc.js: the Saint-Jean exchange where the gang speaks French on purpose, Tom's accent gag, and the finale ponts lines at 580 to 604), E-06 47: the retired jobs' lines in story.js (suis, seme, sunfire, quatre, poutine, tour: 15 rows; unreachable, smoke_canon's KEEP set still names some of them), Adam's 24 get-in/out rows in dialogue.json (optional path, they invent facts about him: Tang and Télétoon, chips, a sore back; S1-ENGLISH question 3 to Tom), 6 Vendeur rows in calls.json (English classifieds callers flagged by the classifier, not cast), and Tom's two French answers to French strangers in nuittim.js (kept on purpose, S1-ENGLISH question 5).
- Tics used in the optional jobs: Sayyad « OK OK OK » once (racecivic end, after losing to the rims). No « Wrong. », « my fault », « the hill », « Hear me out », « frolicking » or « Trust me » in anyone else's new line. Every new bubble is under 12 words and 70 characters (the longest: blitz start, 68 characters) so smoke_canon's two KEEP exemptions for the old chelsea and circuit lines are removed, not kept.
- The blitz: story.js said « Soixante secondes » and the porch row (step 2) said « sixty seconds », but BLITZ_CLOCK is 130 s plus 15 per checkpoint (racejobs.js, gridSub says « cent trente »). The new Sayyad line says a hundred and thirty, the porch row says « one clock » and no number.

## Cloud checks for the lead

No browser job was run on the Mac (wave 6 rule, then the 27 Oct rule). Needed on the cloud box:

- Boot of both entries, 0 console errors: `node tools/qa/boot.mjs --entries=index,prototype`.
- Porch: a hangout visit shows the English greet lines on the porch, no French from the five friends; one slalom lose shows Mike's « It's fine. It's FINE. The bin was in a dumb spot. That's on me. ».
- Harness `--only racedave,racecivic` (or any race job): the grid toast reads « Adam: « Loser pays for gas. The winner's gas. » » and the intro « Adam: « Three. Two. ONE... » »; the lose card quotes « Want me to show you the shortcut? ». These race-card strings are not covered by a node smoke beyond smoke_race's « racedave: ... » start-line check.
- The lead reruns smoke_audio, smoke_harness_gate and smoke_models on the Mac at merge (VM-only failures per ct.py).

## Before / after table

Inner text without the « ». hangout.js keeps a trimmed fallback copy; the same rows were changed there (6 of the 10 exist in it).

| file | who | old | new |
|---|---|---|---|
| hangout.json greet | Mike | Heille! Coupe le moteur, ma mère dort à dix heures. | Kill the engine. My mom's asleep at ten. |
| hangout.json greet | Mike | T'arrives juste à temps, j'étais en train d'expliquer quelque chose d'important. | Perfect timing. I was explaining something important. Hear me out. |
| hangout.json greet | Sayyad | ENFIN. Ça fait vingt minutes qu'on parle de rien. | FINALLY. Twenty minutes of talking about nothing. |
| hangout.json greet | Sayyad | Le nouveau PowerBook, le clavier s'allume. It LIGHTS UP. | New PowerBook. The keyboard lights up. It LIGHTS UP, Tom. |
| hangout.json greet | Abraham | Assis-toi. Y a de la place sur les marches. | Sit. There's room on the steps. |
| hangout.json greet | Abraham | Salut, man. J'ai amené ma guitare. Personne a demandé. | Hey man. I brought my guitar. Nobody asked. |
| hangout.json greet | Adam | ...t'es en retard. | ...you're late. |
| hangout.json greet | Adam | Ouais. | Yeah. |
| hangout.json greet | Zahra | Sayyad a dit que t'avais pas ton permis pour vrai. Je le crois pas, mais il l'a dit. | Sayyad says your licence isn't real. I don't believe him. But he said it. |
| hangout.json greet | Zahra | Je rentre à dix heures. Pas parce que je veux. | I'm in by ten. Not by choice. |

## Checks

- Wave 6 (20 Oct): npm test never ran on this branch; the queued qa-slot run timed out waiting for RAM behind the other builders.
- Wave 7 (27 Oct, after the merge with 786acf4): before the fixes, three smokes were red on the Mac at 2f14332 (run before the 00:55 no-node rule; the only local node runs of this session): smoke_lang 36/39 (the hangout.json:66 sentinel and the two Mike rows on Zahra's and Russell's tics), smoke_hangout 369/370 (the French Sunfire row), smoke_canon, smoke_story, smoke_story_rules, smoke_chatter, smoke_privacy green. All three fixed in 483f714 (step 6 above).
- Colab VM, ct.py on a6f19f2: named run smoke_lang, smoke_canon, smoke_hangout, smoke_story, smoke_story_rules, smoke_race, smoke_racestarts, smoke_avatars: EXIT 0, RESULT GREEN (log a6f19f2-1027-012528.log). Named run smoke_lang + smoke_canon: 39/39 and 139/139, RESULT GREEN (log a6f19f2-1027-012916.log), numbers under After step 4.
- Colab VM, full suite on ad02c58 (same code as a6f19f2, report commit on top): 101/104 suites, the three misses are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models), ct.py counts it GREEN; 523 s on the VM, log ad02c58-1027-013216.log. smoke_terrain, smoke_react and smoke_feel report their wall-clock budgets as SKIP (quiet-window checks).
- No browser job was run on the Mac.
| hangout.json catch | Mike | ...faque le gars me dit que le moteur est correct. Correct! Écoute. Écoute-moi deux secondes. | ...so the guy tells me the engine's fine. FINE. Listen. Listen to me for two seconds. |
| hangout.json catch | Mike | Y a une manière de reculer dans l'entrée sans toucher au bac. Une seule. Je vais te la montrer avec mes mains. | There's one way to back into the driveway without hitting the bin. One. I'll show you with my hands. |
| hangout.json catch | Mike | Regarde-le. REGARDE-LE. Trois semaines qu'y est là-haut. Ça, c'est de l'ingénierie. | Look at it. LOOK AT IT. Three weeks up there. That's engineering. |
| hangout.json catch | Mike | Ma mère l'a vu hier. A l'a rien dit. Rien! C'est ça le plus beau de l'affaire. | My mom saw it yesterday. Said nothing. NOTHING. That's the best part. |
| hangout.json catch | Mike | Le monde ralentit devant chez nous pour le voir. Le monde. Ralentit. Pour NOUS. | People slow down in front of the house to see it. People. Slow down. For US. |
| hangout.json catch | Mike | J'ai un plan pour le divan. Un vrai plan. Faut juste que t'amènes ton truck. | I have a plan for the couch. A real plan. I just need your truck. |
| hangout.json catch | Mike | T'as battu sa Civic?! Attends. Attends attends attends. Recommence par le début. | You beat his Civic?! Wait. Wait wait wait. Start from the beginning. |
| hangout.json catch | Mike | Un canot. Au Bondo. Jusqu'à l'île. Je l'ai conté à trois personnes pis y a personne qui me croit. | A canoe. Bondo. To the island. I told three people and nobody believes me. |
| hangout.json catch | Mike | T'es venu en BUS. Un bus d'école. Dans MON entrée. Non mais. | You came in a BUS. A school bus. In MY driveway. Honestly. |
| hangout.json catch | Mike | C'est... c'est un cart de golf. Ok. OK! Non mais ok. Explique. | That's... that's a golf cart. Ok. OK! Fine, ok. Explain. |
| hangout.json catch | Mike | Qu'est-ce qui est arrivé au char?! Non — dis-moi pas. Dis-moi. Dis-moi tout. | What happened to the car?! No. Don't tell me. Tell me. Tell me everything. |
| hangout.json catch | Mike | T'as faite plus d'affaires cet été que moi dans toute ma vie, pis j'ai un an de plus que toi. | You did more this summer than I've done in my whole life, and I'm a year older than you. |
| hangout.json catch | Mike | Non non non, écoute. Écoute-moi. Norm Lafleur va te charger le double si t'attends. Le DOUBLE. Regarde ma main. | No no no, listen. Hear me out. Norm Lafleur charges double if you wait. DOUBLE. Watch my hand. |
| hangout.json catch | Mike (3) / Sayyad (12) | ...pis c'est là que Zahra m'a dit que j'avais tort. Elle avait raison. Mais écoute pareil. | ...and that's when Zahra said I was wrong. She was right. Listen anyway. |
| hangout.json catch | Mike (3) / Sayyad (12) | Attends attends attends. Les deux, là. Écoutez-moi les deux en même temps. C'est important. | Wait wait wait. Both of you. Listen to me at the same time. This is important. |
| hangout.json catch | Mike (3) / Sayyad (12) | Le Tour des Maringouins, c'est pas une course, c'est un test de nerfs. Je te le dis avec mes mains: c'est ÇA le virage. | The Tour des Maringouins isn't a race, it's a nerve test. Watch my hands: THIS is the turn. |
| hangout.json catch | Mike (3) / Sayyad (12) | C'est quoi ça? Non. Non non non. Ôte-moi ça pis mets mon CD. | What is that? No. No no no. Take that off and put my CD in. |
| hangout.json catch | Mike (3) / Sayyad (12) | Y a pas de musique. Why is there no music? Pars le radio, man. | There's no music. Why is there no music? Turn on the radio, man. |
| hangout.json catch | Mike (3) / Sayyad (12) | J'ai gravé une compile hier soir. Blink, 50 Cent, pis une toune de Jean Leloup pour ma mère. | I burned a mix last night. Blink, 50 Cent, and one Jean Leloup song for my mom. |
| hangout.json catch | Mike (3) / Sayyad (12) | Ma Civic te mangerait tout rond. On se le dit une fois pis on l'oublie. | My Civic would eat you alive. We say it once and we move on. |
| hangout.json catch | Mike (3) / Sayyad (12) | J'ai laissé faire, c'te soir-là. C'tait pour te faire plaisir. Demande à Adam. | I let you win that night. To be nice. Ask Adam. |
| hangout.json catch | Mike (3) / Sayyad (12) | Trois doughnuts devant chez nous pis j'ai rien entendu. Ma mère, elle, en parle encore. | Three doughnuts in front of my house and I heard nothing. My mom still talks about it. |
| hangout.json catch | Mike (3) / Sayyad (12) | Le divan, c'tait mon idée. Mike va dire que c'tait la sienne. C'tait mon idée. | The couch was my idea. Mike will say it was his. It was my idea. |
| hangout.json catch | Mike (3) / Sayyad (12) | T'es venu avec MA Civic. ...continue. Ça me dérange pas. Continue de parler. | You came in MY Civic. ...go on. I'm fine. Keep talking. |
| hangout.json catch | Mike (3) / Sayyad (12) | T'es cassé, hein? Ça paraît dans ta face, mon homme. | You're broke, eh? It's all over your face, my man. |
| hangout.json catch | Mike (3) / Sayyad (12) | Où t'as pris c't'argent-là? Non. Laisse faire. J'veux pas le savoir. | Where did you get that money? No. Forget it. I don't want to know. |
| hangout.json catch | Mike (3) / Sayyad (12) | Six checkpoints en soixante secondes. La ville t'appartient. Officiellement. | Six checkpoints in sixty seconds. The town is yours. Officially. |
| hangout.json catch | Mike (3) / Sayyad (12) | Trois courses. Y a plus personne dans Aylmer qui veut se mesurer à toi. Ça inclut moi. | Three races. Nobody in Aylmer wants to race you anymore. That includes me. |
| hangout.json catch | Abraham | Assis-toi deux minutes. Ça changera rien que tu partes à dix heures ou à dix heures et quart. | Sit for two minutes. Leaving at ten or ten fifteen changes nothing. |
| hangout.json catch | Abraham | Y font le même party à Deschênes chaque vendredi pis y pensent qu'on le sait pas. | Same party in Deschênes every Friday and they think we don't know. |
| hangout.json catch | Abraham | Ton truck, man. What happened to ton truck? | Your truck, man. What happened to your truck? |
| hangout.json catch | Abraham | Des nachos à cinq heures du matin. J'en reprendrais. | Nachos at five in the morning. I'd go again. |
| hangout.json catch | Abraham | Tu travailles pas mal pour un été. Y en aura pas d'autre comme celui-là, tu sais. | You work a lot for a summer. There won't be another one like this, you know. |
| hangout.json catch | Abraham | Y a un divan dans l'arbre. Je vais faire comme si je l'avais pas vu. | There's a couch in the tree. I'm going to pretend I didn't see it. |
| hangout.json catch | Abraham | Vous courez sur des rues où le monde reste. Un jour vous allez comprendre ça. | You race on streets where people live. One day you'll get that. |
| hangout.json catch | Abraham | T'es rendu que tu viens tous les soirs. C'est correct. C'est ça, un été. | You come every night now. That's fine. That's a summer. |
| hangout.json catch | Abraham | Ta mère m'a donné du jus. Deux fois. Je pense qu'a m'aime. Ou a me surveille. | Your mom gave me juice. Twice. I think she likes me. Or she's watching me. |
| hangout.json catch | Abraham | Tiens. Ten bucks. Non, prends-les. Tu me les redonneras en septembre. | Here. Ten bucks. No, take it. Pay me back in September. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | ...ouais. | ...yeah. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | J'ai marché depuis Mayo. ...non. J'ai le Sunfire. J'voulais juste voir si t'écoutais. | I walked from Mayo. ...no. I have the Sunfire. Just checking if you listen. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Mon Sunfire est plus vite que ton char. C'est mathématique. | My Sunfire is faster than your car. That's math. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Tu m'as battu. Une fois. Sur une rue. Un mardi. En juillet. | You beat me. Once. On one street. On a Tuesday. In July. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | C'est mon char, ça. | That's my car. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Y a un divan dans l'arbre. | There's a couch in the tree. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | T'es monté jusqu'à Chelsea. Pour rien. ...respect. | You drove up to Chelsea. For nothing. ...respect. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Ton char a l'air de ma vie. | Your car looks like my life. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Hull. T'es allé à Hull. Y ont un musée, paraît. J'irai pas. | Hull. You went to Hull. They have a museum, apparently. I'm not going. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Zahra, ton frère dit qu'y est l'heure. ...Je fais juste passer le message. | Zahra, your brother says it's time. ...I'm just passing it on. |
| hangout.json catch | Adam (9) / Abraham / Sayyad | Écoute-la pas. A pense qu'a l'a raison. ...a l'a souvent raison. | Don't listen to her. She thinks she's right. ...she's usually right. |
| hangout.json catch | Zahra | Vous dites les mêmes affaires chaque soir. Je les ai comptées. Y en a onze. | You all say the same things every night. I counted. There are eleven. |
| hangout.json catch | Zahra | Le divan va tomber. Pas à soir. Mais y va tomber, pis y va y avoir quelqu'un en dessous. | The couch will fall. Not tonight. But it will fall, and someone will be under it. |
| hangout.json catch | Zahra | T'as gagné combien de courses? Deux? Sayyad en a raconté cinq à ma mère. | How many races did you win? Two? Sayyad told my mom five. Wrong. |
| hangout.json catch | Zahra | T'as de l'argent pis tu conduis encore le Ranger. Explique-moi ça. | You have money and you still drive the Ranger. Explain that to me. |
| hangout.json catch | Zahra | L'aile droite. Tu l'as frappée en reculant. J'ai vu la peinture sur le poteau. | Right fender. You hit it backing up. I saw the paint on the post. |
| hangout.json catch | Zahra | T'as volé un cart de golf. Je le dis à personne. Ça va te coûter cher, par exemple. | You stole a golf cart. I'm telling nobody. It's going to cost you, though. |
| hangout.json catch | Zahra | Trente-et-une secondes. Je t'ai chronométrée. Sayyad a dit quarante pis y ment. | Thirty-one seconds. I timed you. Sayyad said forty and he's lying. |
| hangout.json catch | Zahra | T'es icitte plus souvent que moi, pis moi je reste à trois rues. | You're here more than I am, and I live three streets over. |
| hangout.json catch | Zahra | T'as faite toutes les jobs de la ville. Y te reste quoi, à part nous autres? | You've done every job in town. What's left, besides us? |
| hangout.json catch | Zahra | L'île, c'est à 1,2 km. J'ai mesuré sur la carte de géo. Vous êtes tous fous. | The island is 1.2 km out. I measured it on the geography map. You're all insane. |
| hangout.json catch | Zahra | Mike explique la même affaire depuis mardi. Personne lui a dit qu'on avait compris. | Mike has been explaining the same thing since Tuesday. Nobody told him we got it. |
| hangout.json catch | Zahra | Amène-le à Norm Lafleur avant que ta mère le voie. Norm dira rien. Il dit jamais rien. | Take it to Norm Lafleur before your mom sees it. Norm won't say anything. He never does. |
| hangout.json catch | Zahra | Le chat du voisin m'a suivie jusqu'icitte. Il reste. C'est mon chat, astheure. | The neighbour's cat followed me here. It's staying. It's my cat now. |
| hangout.json catch | Zahra | Touche à mon sac pis tu vas connaître mes ongles. | Touch my bag and you'll meet my nails. |
| hangout.json job/leave | job + leave rows | J'ai de quoi pour toi. Embarque, je t'explique en chemin. | I've got something for you. Get in, I'll explain on the way. |
| hangout.json job/leave | job + leave rows | Y a une affaire à faire à soir. Ça te ferait de l'argent propre. | There's a thing to do tonight. Clean money. |
| hangout.json job/leave | job + leave rows | Y a une job. J'irais bien mais j'irai pas. | There's a job. I'd go, but I won't. |
| hangout.json job/leave | job + leave rows | AH! J'oubliais. J'oubliais! Attends. Écoute-moi. | AH! I forgot. I FORGOT. Wait. Hear me out. |
| hangout.json job/leave | job + leave rows | J'ai lu l'annonce. Personne d'autre l'a lue. Vas-y avant eux autres. | I read the ad. Nobody else did. Go before they do. |
| hangout.json job/leave | job + leave rows | Reviens demain! J'aurai fini mon explication. | Come back tomorrow! I'll have finished explaining. |
| hangout.json job/leave | job + leave rows | Klaxonne en passant. Tout le temps. | Honk when you drive by. Every time. |
| hangout.json job/leave | job + leave rows | Roule doucement dans rue. Y a des kids. | Drive slow on the street. There are kids. |
| hangout.json job/leave | job + leave rows | Salut. Fais pas de niaiseries avant demain. | Bye. No stupid stuff before tomorrow. |
| hangout.json slalom | slalom pitch + win | Les bacs de ma mère sont déjà dans rue. Jusqu'à Smiley pis tu revires. Chrono. | My mom's bins are already on the street. Down to Smiley and back. Timed. |
| hangout.json slalom | slalom pitch + win | J'ai sorti les bacs. Slalom jusqu'à Smiley, pis tu reviens dans l'entrée. Dix piasses. | I put the bins out. Slalom to Smiley, back into the driveway. Ten bucks. |
| hangout.json slalom | slalom pitch + win | J'ai la montre de mon père. Je pars le chrono quand tu bouges. Triche pas. | I have my dad's watch. The clock starts when you move. Don't cheat. |
| hangout.json slalom | slalom pitch + win | Les bacs sont dehors. Va jusqu'à Smiley. Reviens. C'est tout. | Bins are out. Go to Smiley. Come back. That's it. |
| hangout.json slalom | slalom pitch + win | OUAIS! T'AS VU ÇA? Quelqu'un a-tu vu ça? | YEAH! DID YOU SEE THAT? Did anyone see that? |
| hangout.json slalom | slalom pitch + win | Le troisième bac — comment t'as faite pour le troisième bac? Montre-moi avec tes mains. | The third bin. How did you do the third bin? Show me with your hands. |
| hangout.json slalom | slalom pitch + win | C'est un bon temps. Je le dirai pas trop fort, y vont vouloir recommencer. | That's a good time. I won't say it too loud, they'll want to go again. |
| hangout.json slalom | slalom pitch + win | ...pas pire. | ...not bad. |
| hangout.json slalom | slalom pitch + win | Beau travail. Astheure ramasse les bacs, c'est la collecte demain. | Nice work. Now pick up the bins, it's garbage day tomorrow. |
| hangout.json slalom | slalom lose + bin | Non. | No. |
| hangout.json slalom | slalom lose + bin | Laisse-moi essayer. LAISSE-MOI ESSAYER. | Let me try. LET ME TRY. |
| hangout.json slalom | slalom lose + bin | T'as manqué deux barrières pis t'as pété un bac. J'ai tout écrit. | You missed two gates and broke a bin. I wrote it all down. |
| hangout.json slalom | slalom lose + bin | C'est correct. C'est correct! Le bac était mal placé. C'est de ma faute. | It's fine. It's FINE. The bin was in the wrong spot. My fault. |
| hangout.json slalom | slalom lose + bin | Recommence donc. Y a personne qui s'en va nulle part. | Go again. Nobody's going anywhere. |
| hangout.json slalom | slalom lose + bin | LE BAC! | THE BIN! |
| hangout.json slalom | slalom lose + bin | Ayoye. | Ouch. |
| hangout.json slalom | slalom lose + bin | Un. | One. |
| hangout.json slalom | slalom lose + bin | C'est le bac du voisin, ça. | That's the neighbour's bin. |
| hangout.js fallback | Mike | ...faque le gars me dit que le moteur est correct. Écoute-moi deux secondes. | ...so the guy tells me the engine's fine. Listen to me for two seconds. |
| hangout.js fallback | Mike | Regarde-le. REGARDE-LE. Y est encore là-haut. Ça, c'est de l'ingénierie. | Look at it. LOOK AT IT. Still up there. That's engineering. |
| hangout.js fallback | Abraham | Assis-toi deux minutes. Ça changera rien. | Sit for two minutes. It changes nothing. |
| hangout.js fallback | Zahra | Vous dites les mêmes affaires chaque soir. Je les ai comptées. | You all say the same things every night. I counted. |

Wave 7 rows (27 Oct). Porch fixes first, then the optional jobs.

| file | who | old | new |
|---|---|---|---|
| hangout.json catch | Mike | ...and that's when Zahra said I was wrong. She was right. Listen anyway. | ...and that's when Zahra said I had it backwards. She was right. Listen anyway. |
| hangout.json slalom lose | Mike | It's fine. It's FINE. The bin was in the wrong spot. My fault. | It's fine. It's FINE. The bin was in a dumb spot. That's on me. |
| hangout.json catch | Sayyad | Six checkpoints in sixty seconds. The town is yours. Officially. | Six checkpoints, one clock. The town is yours. Officially. |
| story.js solerrand start | Zahra | The blackberry one. Pas la framboise. Je suis pas un bébé. | The blackberry one. Not raspberry. I'm not a baby. |
| story.js solerrand end | Zahra | Parfait. Les chats aimeraient ça, s'ils buvaient de la liqueur. | Perfect. Cats would like this, if cats drank pop. |
| story.js solerrand end | Sayyad | Merci d'avoir amené ma sœur. Elle t'a-tu griffé? | Thanks for driving my sister. Did she scratch you? |
| story.js highwayhull start | Sayyad | Vertical Reality. Je me suis entraîné. Mentally. | Vertical Reality. I've been training. Mentally. |
| story.js highwayhull end | Adam | Bon. Astheure faut retrouver le chemin pour revenir. | Okay. Now we just have to find the way back. |
| story.js chelsea start | Adam | Continue sur la 105. Quand ça devient juste des arbres, t'es presque rendu. | Stay on the 105. When it's all trees, you're almost there. |
| story.js chelsea end | Sayyad | Chelsea aller-retour pour aucune raison. That's a real ride. | Chelsea and back for no reason. That's a real ride. |
| story.js dep start | Sayyad | Liberty, le 750 grammes. Au Super C, c'est 1,99 $. Just saying. | Liberty, the 750 gram. Super C has it for $1.99. Just saying. |
| story.js dep end | Adam | On est venus au parc pour manger du yogourt. OK. | We drove to the park to eat yogurt. Okay. |
| story.js racedave start | Adam | Mon Sunfire est plus vite que ton char. C'est mathématique. | My Sunfire is faster than your car. That's math. |
| story.js racedave start | Adam | Le perdant paye le gaz. Du gagnant. | Loser pays for gas. The winner's gas. |
| story.js racedave end | Adam | ...bon. C'était la mathématique de l'autre sens. | ...okay. The math went the other way. |
| story.js racecivic start | Sayyad | J'ai mis des jantes. Faut que le monde le sache. | I put rims on. People need to know. |
| story.js racecivic start | Sayyad | Par le Vieux. Pas par le boulevard, c'est plate. | Through the Vieux. Not the boulevard. The boulevard's boring. |
| story.js racecivic end | Sayyad | Les jantes, c'est peut-être pas dans les jantes. | OK OK OK. Maybe the speed isn't in the rims. |
| story.js circuit start | Sayyad | Trois tours. I've calculated the racing line. Twice. | Three laps. I've calculated the racing line. Twice. |
| story.js circuit start | Adam | Y a personne le dimanche matin. Personne. | Nobody's out Sunday morning. Nobody. |
| story.js circuit end | Adam | Ma suspension est finie. Elle l'était avant, mais quand même. | My suspension's done. It was done before, but still. |
| story.js blitz start | Sayyad | Soixante secondes. Chaque checkpoint t'en redonne quinze. | Hundred and thirty seconds. Every checkpoint gives you fifteen back. |
| story.js blitz start | Sayyad | Le chrono arrête jamais. Moi non plus. | The clock never stops. Neither do I. |
| story.js blitz end | Sayyad | Six sur six. T'as battu la ville. | Six for six. You beat the town. |
| racejobs.js racedave gridToast | Adam | Le perdant paye le gaz. Du gagnant. | Loser pays for gas. The winner's gas. |
| racejobs.js racedave intro | Adam | Trois. Deux. UN (cut off by a dash) | Three. Two. ONE... |
| racejobs.js racedave lose | Adam | Tu veux-tu que je te montre le raccourci? | Want me to show you the shortcut? |
| racejobs.js racecivic gridToast | Sayyad | Par le Vieux. Pas par le boulevard, c'est plate. | Through the Vieux. Not the boulevard. The boulevard's boring. |
| racejobs.js racecivic intro | Sayyad | Compte, toi. | You count. |
| racejobs.js racecivic lose | Sayyad | Les jantes, mon chum. Les jantes. | The rims, buddy. The rims. |
| racejobs.js circuit gridToast | Sayyad | Trois tours. I've calculated the racing line. | Three laps. I've calculated the racing line. |

## Open issues and notes for the lead

- Outside my task, not fixed: tools/story-editor/seed.json still carries the old French versions of these lines (and older ones again, Margaret's Saturn line); it is the editor's seed, not game text.
- smoke_canon's KEEP set still names six retired-job lines and other French rows that are not mine; left as is.
- Questions only Tom can answer, safe default taken: none new. S1-ENGLISH questions 3 (Adam's 24 pool rows) and 5 (Tom's French answers to French strangers) still stand; both stay on the allowlist.
