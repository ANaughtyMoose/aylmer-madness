# The opening

Claude, 6 Oct 2026. Built for Tom's brief: "think through the sequence. Feels like a complicated starting screen and then just a few sequences but no narrative; no context. It should feel expansive and great, like the start of Star Wars." This replaces the photo slideshow in `INTRO-SEQUENCE.md` (29 Sept). Code: `src/game/intro/` (`shots.js` the data, `opening.js` the director, `score.js` the sound), `opening.css`, and a few hooks in `src/main.js` tagged `[opening]`. Checks: `tools/smoke_opening.mjs`.

## 1. What was there, honestly

**The start, as a player met it (6 Oct):**

1. A title page that read like a web page: a small logo, a picture in a box, a column of six buttons, a grid of eleven car cards with spinning 3D turntables, a joke erratum and a key chart. Nothing on it says what the game is about. The car grid did nothing for a new game (enterDrive always puts you in your own character's car), and the turntables ran a second WebGL context on Tom's MacBook Air while he read the menu.
2. « EMBARQUE » did not start the game. It opened « Où tu pars? », a full-screen map with 22 pins, a character picker (Tom, Sayyad, Zahra, Mike, Abraham) and a padlock on most pins. A first-time player is asked where to start a story they have not been told yet.
3. GO, a loading screen.
4. One text card ("Été 2004 … T'es Tom. Le Ranger est à toi …"), a paragraph of exposition in a box beside a painting.
5. A second card for the alternator job. Then driving.

So: two menus and a map before the first word of story, then the whole premise in one paragraph. No place, no people, no feeling. Tom's "complicated starting screen and then just a few sequences" is exact.

**ChatGPT's photo opening (`INTRO-SEQUENCE.md`), assessed:**

- Good: the instinct for real specifics (the Ranger's rust, the basement window, 299 Fraser), the GTA IV "same angle into live 3D" hand-off, the engine cranking twice as the bridge into play, skippable from frame one, the privacy rules.
- Flat: it is a slideshow of fifteen captions that are mostly just names ("Sayyad.", "Mike.", "Abe."). A name over a face tells you nothing about the person or why you should care. There is no stake, no question, no time pressure, and no sense of the town's size. The *Cheers* model is warm but small, the opposite of "expansive".
- Unbuildable as the default: it depends on photos of real people, most of which are years off (2005 to 2009), several of which include people who must never be in the game, and none of which can ship in a public repo. Without them it has nothing to show. The batch reviews (`references/story/intro/REVIEW-*.md`, private) graded 0 of 27 generated images PASS.
- Its title card came late and small. Star Wars puts the title first and makes it huge.

## 2. The design

The Star Wars structure, done as Aylmer: a cold-open line, a title that hits and flies away, a crawl that gives the situation and the stakes, then the camera tilts down from the stars to the world. Here the "planet" is Lac Deschênes at 5:30 in the morning on Tuesday 22 June 2004, and the world is the game's own real map. The flight crosses the town (the marina, the old stone strip on Principale) and drops into each friend's street for a freeze-frame name card in the early-2000s style (Guy Ritchie, *Snatch*, the Tony Hawk and GTA loading cards): a slam of colour, a big italic name, the address, one cynical narrator line in French, and the person's own English line in a bubble. Then Fraser, the truck, Margaret at the door, the landline ringing, and the camera settles exactly where the chase camera will be. The starter grinds twice and catches. You are in the Ranger, nose-in, and the first instruction is to back out.

Everything is in-engine or drawn in code, so it works on any machine with no private files. Tom's private portraits, if present locally, slide in beside the cards (section 6).

**The language rule (Tom, 6 Oct):** the narrator, crawl, captions and name cards are Quebec French; every line a main character says is English (Tom, Margaret, the friends, Russell, Dad). The English build (`settings.lang = 'en'`) has English narrator copy.

## 3. The beats, one line each

1. **Cold open.** Black, FM static: « Il y a pas si longtemps, dans une banlieue pas si loin d'Ottawa… »
2. **Title.** A brass hit and AYLMER MADNESS fills the screen in chrome and sunset gold, then flies away into a 5 a.m. sky.
3. **Crawl.** ÉPISODE XVII, LE DERNIER ÉTÉ TRANQUILLE: Tom is seventeen, one year left at Heritage, a '93 Ranger on bald tires from his father; he pays for the gas and his friends pay in thank-yous; $1,200 by Labour Day; "the last summer when nobody has to decide anything. There are seventy-six days left…"
4. **The lake.** The Star Wars tilt: from the stars down to Lac Deschênes, the lighthouse and the marina lights.
5. **The marina,** then **Rue Principale,** low over the old strip toward the British Hotel. The sun is coming.
6. **Sayyad.** His house, nobody on the lawn: he is asleep. A muffled bubble from upstairs about the liquid-cooled G5.
7. **Zahra,** on the same lawn, arms folded: "He's asleep. He's always asleep. Honk, I dare you."
8. **Mike,** under an empty maple: "Trust me. That tree is missing a couch." (The couch goes up in mission 4; the maple is empty here on purpose.)
9. **Abraham,** on Wilfrid-Lavigne: "Your mom still thinks I'm up to something. I'm not. Mostly."
10. **Russell,** 1 rue Arial: "Whatever you heard, it wasn't my fault. The hill did that."
11. **Chemin Fraser,** the long glide north, the sun up on the right; a moving card for the rest of the gang (Adam drives in from Mayo; Tyler, Robin, Alex you pick up on the way).
12. **Le Ranger.** The truck nose-in in the driveway: "0 à 100 km/h : éventuellement."
13. **Margaret** at the door, waving: "Tom. Where are you going this early?" then "Who else is going? …Take a muffin."
14. **The phone.** The landline rings twice. "Tom! Phone! It's your father." Dad's card, a drawn black desk phone: the battery light, the alternator he ordered at the Canadian Tire, "It's paid. Tell your mother I called." This IS the first job's brief, so the job starts without a card.
15. **Tom.** The last card, "Soixante-seize jours. Un truck. Toute la ville.", the camera eases into the chase pose, two grinds and a catch, the radio comes up with the engine. Play: « S pour reculer ».

Unskipped running time: 2:20 (139.6 s; the 2D part is 42 s and plays over the world bake, so on a slow machine it costs nothing).

## 4. Storyboard

World coordinates: x east, z south, metres; heights above the ground at that point (the director adds the terrain). Keys are `[t, x, y, z, lookX, lookY, lookZ, fov]` in `src/game/intro/shots.js`; every move is a Catmull-Rom spline through its keys with a cosine ease, so it starts and lands soft. `sx`/`sy` put the subject off-centre (right of frame) so the card on the left never covers the person it names. The 3D clock runs 5:30 to 6:30 across the shots and stops during a card.

| # | Shot | Seconds | Camera (from → to) | On screen | Sound | Assets |
|---|---|---|---|---|---|---|
| 1 | Cold open | 0-6.5 | none | « Il y a pas si longtemps… » in Star Wars blue | static, tuning whine | CSS |
| 2 | Title | 6.5-14 | none | AYLMER / MADNESS, ÉTÉ 2004, recedes to 13 % | reverse swell, brass chord on D, sub drop, crash, four-note fanfare | CSS, `score.sting` |
| 3 | Crawl | 14-42 | none | ÉPISODE XVII, title, three paragraphs on a 29° plane | pad: D, Bm, G, A with an arpeggio | CSS, `score.pad` |
| 4 | Lake | 9 | (-2160, 46, 270) looking up at the stars → (-2090, 38, 215) looking at the lighthouse (-1690, -106) | letterbox in, caption LAC DESCHÊNES · MARDI 22 JUIN 2004 | dawn theme starts, water and birds | in-engine |
| 5 | Marina | 6.5 | (-1905, 26, 10) → (-1700, 17, -55), past the basin to the Symmes Inn (-1517, -61) | MARINA D'AYLMER | | in-engine, marina.js |
| 6 | Principale | 7 | (-1110, 14, -62) → (-962, 4.2, -80), onto the British Hotel (-916, -112) | VIEUX-AYLMER · RUE PRINCIPALE | | landmarks.js |
| 7 | Sayyad | 3.2 + 4 card | (-726, 15, -420) → (-731, 3.4, -441), at 75 Denise-Friend | card SAYYAD, muffled bubble | whoosh, shutter, thump | his avatar hidden (asleep) |
| 8 | Zahra | 2.2 + 3.6 | continues to (-706, 1.7, -450) on her (-714.6, -456.8) | card ZAHRA, bubble on her head | freeze hit | avatars.js Zahra |
| 9 | Mike | 3.2 + 3.8 | (-382, 11, 84) → (-404, 1.9, 66), looking up into the maple | card MIKE | freeze hit | Mike avatar, maple, couch hidden |
| 10 | Abraham | 3.2 + 3.8 | (-222, 14, -965) → (-198, 4, -985), 841 Wilfrid-Lavigne | card ABRAHAM, voice bubble | freeze hit | street only (no avatar yet) |
| 11 | Russell | 3.2 + 3.8 | (1022, 12, 800) → (1000, 3.5, 776), 1 rue Arial | card RUSSELL, voice bubble | freeze hit | street only |
| 12 | Fraser | 8 | (985, 30, 700) → (903, 9, 196), north up Chemin Fraser | CHEMIN FRASER, moving card PIS LA GANG | birds | in-engine |
| 13 | Ranger | 3.2 + 3.8 | continues to (905.5, 2.2, 149) on the truck (915, 142.6) | card LE RANGER | freeze hit | the player's Ranger |
| 14 | Margaret | 2.4 + 5 | (912, 2.6, 151) → (920, 1.6, 144.5) on her at the front step | card MARGARET, two bubbles | freeze hit | Margaret avatar moved to the door |
| 15 | Phone | 3 + 7.6 | → (913, 3.4, 151) wide on the house | Margaret's call, card TON PÈRE with the drawn phone, three bubbles | the landline rings twice (440 + 480 Hz) | SVG phone |
| 16 | Hand-off | 2.2 + 2.6 + 3.3 | (907, 5.5, 162) → the chase camera's own pose behind the truck | card TOM, then the HUD | starter grinds twice and catches, radio fades in over 4 s | none |

## 5. Start flow

- **Title screen:** one picture (the existing Fraser painting full-bleed), one big logo, one column. First run: **GO · NOUVELLE PARTIE** and Options, English, Le garage. Once a save exists, **Continuer** is the big button and New Game steps back. Once the opening has been seen (or any save exists), two more: **Balade libre : pars d'où tu veux…** (the old start picker, unchanged: character, pin, GO) and **Revoir l'intro**. The car grid and its turntables are off the title screen (`MENU_CARS = false` in main.js); the garage viewer is still a click away.
- **New Game** plays the opening and starts Tom's summer from 299 Fraser. It is played once per new game; a load or Continue never plays it.
- **Skips:** Enter / Space / click / pad A = next beat (a card drops, a move cuts to the next shot, the title jumps to the crawl, the crawl to the flight). Esc / pad B / Start = the whole opening. Esc during the world bake shows the bake's own progress and hands over the moment it is done. Skipped, the first job shows its brief card (you did not hear Dad); watched, it does not.
- **Revoir l'intro** plays the same film and comes back to the menu. With a game in memory the Ranger is put back in the driveway for the film and returned exactly where it was. No save is written.
- **The legacy card** (`playStory`) stays for the Balade libre path, where no opening plays.

## 6. Art

Works with none. Optional private portraits slide in beside each card as a tilted print, only when served locally:

- Put files named `card_<who>.png` (or `.jpg`) in `~/Desktop/Coding Projects/aylmer-madness/references/story/intro/opening/` (gitignored with the rest of `references/story/`), and run `node tools/serve.mjs 8184 --opening-dir "<that folder>"`, or put them under the checkout's own `references/story/intro/opening/`.
- `serve.mjs` lists them on the radio library route (so a server without them answers the same as before) and serves only plain `card_*.png|jpg|webp` names on loopback. Nothing is fetched from anywhere else. A static host has no such route, so the public build is in-engine only.
- Who: `card_sayyad`, `card_zahra`, `card_mike`, `card_abraham`, `card_russell`, `card_margaret`, `card_tom`, `card_ranger`. The brief for generating them is private: `references/story/intro/CHATGPT-BRIEF-v2.md`.

Needed later, in the game itself (not portraits): avatars for Abraham and Russell. Their cards play on their street with nobody on the lawn, which reads fine at 5:45 a.m. but would be better with them there. Sayyad's avatar still wears the Hawaiian shirt the ledger says to drop; in the opening he is asleep indoors, so it is never seen.

## 7. Robustness

- The 2D part animates `transform` and `opacity` only (asserted in the smoke test), so the compositor keeps it moving while `buildSectors` holds the main thread; its sound is scheduled ahead on the audio clock for the same reason.
- The flight's draw distance is capped by the quality preset (low 900 m, med 1250 m, high 1600 m) and restored after. A frozen card is not redrawn at all.
- The first lake frame is drawn behind the crawl, so its upload hitch is not seen.
- The game does not tick under the opening (no fuel, clock, traffic, autosave, Dad's call). G.cineCam is a camera only; unlike the dev camera it still draws the truck.
- Measured headless on Metal (1440 x 900): no console errors on index.html or prototype.html; the full film, skip-all during the bake, and Enter through every beat all land in drive mode on the alternateur with « S pour reculer ».

## 8. Open for Tom

- The cards' lines are proposals in each person's confirmed voice. Abraham and Russell's lines are new; Adam has no trait beyond Mayo, so he only gets the gang card. Tyler has no pronoun anywhere.
- Dad's three lines set up the alternator (he ordered and paid for it), which fits the ledger ("Dad bought the truck and paid to get it running") but the exact call is invented.
- The song: the public build uses the synthesised theme. For Tom's private build, a local file of "Ahead by a Century" could replace the crawl pad the same way the private radio works.
