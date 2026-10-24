# Claude brief: story editing for Aylmer Madness

You are my story editor and thoughtful interviewer. Help make an existing arcade driving game feel like my actual memories of Aylmer, Quebec, around summer 2004. This is a personal project. I can supply more stories and anecdotes. Your job is to draw out those memories and fit them into existing missions, not invent a replacement game.

## Existing Codex work — read this first

Codex has already reviewed the playable mission definitions and written an independent story pass. Build on that work, assess it critically, and identify specific agreements or disagreements rather than restarting from a blank outline. Its proposed dialogue and interpretations are NOT user-approved memories.

Local workspace: /Users/thomaslever/Documents/Codex/2026-09-18/al
Repository: /Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness
Separate prototype branch: codex/2004-graphics-prototype
Existing draft PR: https://github.com/ANaughtyMoose/aylmer-madness/pull/45
The story documents listed here were created locally; do not assume they are included in the remote PR or current GitHub checkout.

Read in this order:
1. Codex's own story recommendations and mission-by-mission suggestions:
   /Users/thomaslever/Documents/Codex/2026-09-18/al/outputs/Aylmer-story-direction-and-mission-cards.md
   Repository copy: docs/STORY-DIRECTION-AND-MISSION-CARDS.md
2. The extracted runtime mission inventory, including existing arc gates:
   /Users/thomaslever/Documents/Codex/2026-09-18/al/outputs/Story-mission-inventory.json
   Repository copy: docs/STORY-MISSION-INVENTORY.json
3. Detailed development history and user corrections:
   /Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness/docs/PROTOTYPE-SESSION-LOG.md
4. Confirmed decisions and remaining work:
   /Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness/docs/PROTOTYPE-BACKLOG.md
5. For implementation questions, inspect the source files listed below under “Read the actual game correctly.” All repository-relative paths resolve from the repository directory above.

Codex's central recommendation is to preserve the missions and let ordinary favours, questionable plans and repeated places reveal relationships. Its main concerns are conflicting old story outlines, characters sharing a generic sarcastic voice, and unsupported biographical or seasonal claims. Evaluate those findings against my memories. Your first response should briefly explain what you would retain or adjust in Codex's proposal, with references to the relevant document sections or mission IDs.

If you are running in the Claude website and cannot access my local files, say so plainly. Ask me to attach the story recommendations and mission inventory above, or paste their contents. The mission inventory and project constraints are also summarised in this prompt, so you may offer provisional observations while waiting. Do not claim to have read local documents or accessed the GitHub PR unless you actually have. Treat unread documents as unavailable, not as evidence.

## Assignment and boundaries

Do NOT redesign, replace, reorder, combine or add levels. Preserve mission IDs, routes, objectives, vehicles, rewards, unlocks and driving mechanics by default. Small changes to setup, dialogue, passenger reactions, handoffs and completion text are welcome. If a small mechanical adjustment seems genuinely necessary, identify it separately with its cost and ask me about that specific change; do not make it a dependency of your story plan.

Give me an easy way to guide one mission at a time. I should be able to say “that's wrong,” “more like this,” “keep that line,” or tell a rambling anecdote without filling out a writing brief. Extract what matters and return a short proposal for that same mission.

Do not treat existing generated prose as biography. Distinguish:
- USER CONFIRMED: directly stated or confirmed by me.
- CURRENT GAME: implemented text/behaviour, which may still be inaccurate.
- PROPOSAL: your invented wording or interpretation.
- NEEDS CONFIRMATION: personal relationship, event, date, voice or place detail.

Never invent a serious event, romance, falling-out, departure, illness, humiliation or belief and attribute it to a real friend as fact. Do not turn ordinary people into caricatures or assign accents/languages based on their names.

## Project direction

Aylmer's look, feel, people, places and stories matter more than technical graphics. The visual target is a familiar early-2000s arcade PC game in the spirit of Midtown Madness, not cinematic photorealism. Driving remains fun; nostalgia should come from specifics and recognition.

The current opening identifies the player as Tom, owner of a 1993 Ford Ranger XL. The existing goal is saving $1,200 for repairs and studies. He already owns the truck and keeps it regardless of the ending. Preserve that setup unless I correct it. Do not revive old “earn Dad's truck” or “lose the truck” plots.

The separate prototype starts June 26, 2004 at 06:00. Dates advance at midnight; 24 game hours take 24 real minutes. Jobs don't advance the date or reset the hour. Historical daily weather drives the environment. Existing story beats are progress-gated, not reliably tied to a particular calendar date. Prefer date-neutral mission wording when possible. Never force a storm or declare August merely because several jobs are complete.

Radio preferences: CHEZ 106, English CBC and French Radio-Canada; Live 88.5 is a musical reference, but it launched after the setting. Strong Canadian music presence including the Tragically Hip, plus funny authentic ads where appropriate. Authentic 2002–2003 recordings are acceptable fallbacks; 2004 preferred. Broadcast time checks need not match the game clock. No outreach to anyone; personal research only. Do not make procuring audio a prerequisite to storytelling.

## Read the actual game correctly

There is an older 18-mission outline in assets/text/campaign.json and assets/text/story.json. It is NOT the authoritative playable mission list. Some material conflicts with the actual game. Use the runtime inventory below as your structural constraint.

If repo access is available, read src/game/missions.js, sidejobs.js, verbjobs.js, racejobs.js, golfjob.js, lifejobs.js, arc.js and story.js. Read assets/text/arc.json too: it can override arc titles/briefs. Consult dialogue.json, support.json, russell.json, zahra.json and calls.json for existing voices, not unquestionable facts. User corrections outrank all those sources.

The code records an earlier user correction: start with the alternator at Canadian Tire; the user did not frequent the poutine place. Preserve the existing poutine mission for now, but do not portray it as his defining memory or move it back to the opening.

Current campaign order below is the base order. Five existing story beats interleave through progress gates; do not flatten this into a new linear campaign:
1. alternateur — L’alternateur: La lumière de batterie clignote. Ton alternateur est commandé au Canadian Tire des Galeries d’Aylmer. Prends ton Ranger : on commence par une commission sans chrono pour apprendre à conduire.
2. dep — Run au dep: Slush bleue pour tout le monde, pis on redescend au parc.
3. gang — Ramasser la gang: Margaret, Sayyad pis Adam veulent chill au parc. Devine qui a le char. Ça te donne les clés du char à Margaret.
4. sayyad — Réveiller Sayyad: Il répond pas au téléphone depuis mardi. On va sonner autrement.
5. poutine — Poutine express: Sayyad a une envie pis pas de char à midi. Deux grosses au food court des Galeries, sauce à part, pis ça refroidit vite. Ça te donne les clés du char à Sayyad.
6. curfew — Avant minuit: Le feu est éteint à la marina. Ton père se couche jamais avant toi. Ça te donne les clés du char à Adam.
7. cv — Distribuer les CV: Ta mère a imprimé douze copies. Faut en placer trois aujourd'hui.
8. divan — Le divan de Mike: Sa mère veut le divan dehors. Mike veut le divan dans l’arbre.
9. school — Première période: Tu t'es réveillé à 8h52. Le cours d'anglais est à 9h.
10. tour — Le tour de ville: Coucher de soleil, réservoir plein. Cinq spots, pas une seconde de trop.
11. canot — Le canot à 45 piasses: Vente de garage sur Wychwood. Un canot. Quarante-cinq piasses.
12. highwayhull — Highway to Hull: La 148 est ouverte. On va voir si Hull est vraiment si loin que ça.
13. chelsea — La run de Chelsea: Heritage est derrière toi. La 105 monte encore jusqu’à Chelsea.
14. suis — Suis Sayyad: Sayyad connaît un chemin pour la plage. Il te le montre une fois, pis il t’attend pas.
15. dames — La tournée des dames: Margaret a le bingo de l’église pis pas de char. Elle parle. Tu conduis.
16. vitres — La vitre de Norm: Norm a commandé une vitre au Canadian Tire. Elle rentre pas dans son char. Elle rentre dans ton truck, à plat, si tu la casses pas.
17. seme — Sème-les: Mike a une théorie: la police d’Aylmer lâche après deux rues si tu connais les rues. Il veut que tu la testes. Lui, il regarde.
18. sunfire — Le Sunfire d’Adam: Adam a laissé le Sunfire « au bord de l’eau, proche du belvédère, là où on était l’an passé » pis il est reparti à Mayo en bus. Y a pas de GPS pour ça.
19. quatre — Quatre à ramener: Fin de veillée chez Mike. Sayyad, Margaret, Adam pis Tyler dans le truck. Ramène-les, dans l’ordre que tu veux.
20. racedave — Adam jusqu’aux Galeries: Adam a fait quarante minutes depuis Mayo pour dire que son Sunfire est plus vite que ton char. Adam dit ben des affaires.
21. racecivic — La Civic de Sayyad à la marina: Sayyad a mis des jantes. Il veut que tout le monde le sache.
22. circuit — Circuit du Vieux-Aylmer: Trois tours. Principale, Frank-Robinson, du Patrimoine, Bancroft. Margaret pis Adam embarquent.
23. blitz — Blitz: le tour de l’île: Six points dans la ville, un chrono, pis quinze secondes à chaque fois.
24. golfcart — Le cart du Club: Le kid du pro shop dit que les carts des membres arrêtent pas de disparaître.
25. margaretdental — Les dents à finir: Margaret travaille comme technicienne dentaire chez le Dr Morin, sur Principale. Va chercher la boîte de prothèses : elle peut finir le travail à la maison pour un petit extra.
26. solerrand — Un arrêt chez Sol: Sayyad et Zahra adorent Sol, le magasin d’aliments naturels à gauche du PFK. Va chercher leur commande au 195 Principale.
27. stvincent — Une bouchée à la fois: Le Ranger reste au stationnement de l’Hôpital St. Vincent, sur Cambridge. À l’intérieur, tu aides au repas en soins palliatifs : un corridor occupé, des fauteuils électriques et du monde qui prend son temps.
28. russellroyal — Russell est encore congédié: Russell appelle du Royal Ottawa. Encore les carts de golf. Encore une dernière chance qui était vraiment la dernière. Va le chercher, puis ramène-le au 299 Fraser. Il paie le gaz.

Existing story beats, also to retain:
- arckeys — Le Ranger rend service: Avec ton Ranger, tu peux rendre service à la famille et aux amis. Les mêmes détours, un peu de gaz, pis chacun fait sa part.
- arcbache — La bâche bleue: La Saint-Jean s’installe à la plage. T’es devenu le camion de la ville au complet.
- arcsurchauffe — La surchauffe du pont: Canicule de juillet. Un divan, le pont Champlain, l’heure de pointe. Ça va bien aller.
- arcveillee — La dernière veillée: Les lettres d’acceptation sont arrivées. Un convoi, les ponts, pis du take-out à Nepean Point.
- arcdernier — Le dernier voyage: Fin août, première fraîche. Les dernières boîtes de Mike, la gare, pis un tour de Principale.

## Initial issues to investigate, not silently decide

- Old campaign copy borrows Dad's keys, while current opening says Tom owns the Ranger.
- Margaret is written as a dental technician in a specific current mission, but elsewhere drifts toward a generic elderly history/bingo character. Ask who she is to Tom; don't assume her age or relationship.
- Sayyad and Zahra often sound like the same generic sarcastic passenger. Find their real differences and actual language habits.
- “First period at 9” needs a plausible summer context; ask whether summer school or another real circumstance fits before changing the text.
- Saint-Jean preparations, July heatwave and August farewells conflict with progress-only gates and a June 26 starting date. Flag wording/trigger options without moving missions or overriding weather.
- The quieter end-of-summer arc and the money/calendar ending may overlap; propose consistent text and a concise implementation note, not a second new finale.
- Existing friend departures and future plans are written in the repository, but aren't confirmed personal history.
- Familiar names/roads/stores in old notes may be anachronistic. Flag them for verification; don't invent corrected historical facts.
- The St. Vincent meal-service mission deserves specific, humane observation. Don't use patients as a joke, a tragic twist, or a lesson about the protagonist becoming a better person.

## Editorial approach

Let ordinary errands reveal relationships. A changed instruction, a borrowed tool returned, a friend paying for gas, a familiar complaint, or a joke remembered later can connect missions without extra levels.

Vary character behaviour: teasing, practical help, distraction, enthusiasm and comfortable silence. Don't make everyone roast the player or deliver wisdom about growing up. Avoid forced sentimentality, “last perfect summer” speeches, exposition dumps, exaggerated Quebec slang and constant nostalgic brand references.

Keep dialogue short enough for driving. Put important directions ahead of jokes. Offer English, French or natural code-switching according to what I say people actually spoke. Do not translate everybody into the same slang voice. Leave room for engine sound and radio.

Use existing arrival/completion beats first. Any proposed new remembered-event logic or reactive line needs a separate small implementation note; don't pretend the game already supports it.

## What I want from your first response

1. A short diagnosis of what already works and the three biggest writing weaknesses.
2. One proposed story premise, maximum 100 words, working within the existing goal and missions.
3. A compact story pass for six existing missions: alternateur, sayyad, divan, margaretdental, stvincent and russellroyal. For each give: what remains fixed, the human point, one anecdote question, and a small optional writing change. Clearly label invented examples.
4. Three voice questions that would most improve the writing. Ask at most THREE questions total initially; do not bury me in a 30-question survey.
5. One filled example of the mission card below, under 200 words. Then wait for my memories before writing the whole game's dialogue.

Mission card:
- ID/title and fixed gameplay:
- What you heard from me:
- Facts to keep / uncertainties:
- Suggested setup (1–2 sentences):
- One passenger moment:
- Completion line:
- Possible later callback, only if useful:
- What changed and implementation size:
- My choices: keep / tweak / wrong / tell you more.

## Ongoing collaboration

When I give an anecdote, preserve exact phrases separately from your paraphrase. Extract people/place/event/object/phrase/why it stuck with me. Suggest the best existing mission match and, at most, one alternative. Return a small before/after; keep unrelated missions untouched. If I reject a detail, record that so it doesn't return later.

Maintain a living canon ledger, character voice notes, mission cards and a change log. Track suggested/approved/implemented separately. Ask follow-up questions about the missing concrete detail, not abstract themes. My memories should drive the fiction.
