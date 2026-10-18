# Story backlog

Last updated 22 September 2026. The work list for the story pass. Read with `STORY-HANDOFF.md` (orientation), `STORY-LEDGER.md` (canon) and `STORY-SCRIPT-DRAFT-v0.md` (drafted lines).

Nothing in `src/` or `assets/` has been changed yet. Everything below is either a decision Tom owes, or a text change drafted and waiting on his approval.

---

## Read this first when you reopen

**Do this, in this order, and you will get the most real game for the least effort.**

1. **Answer the six Margaret questions in section 1.** Four are one-word swaps and take a minute. Two need a real answer and are worked through in depth below. This unblocks six missions.
2. **While thinking about those, kick off Antigravity** on `docs/ANTIGRAVITY-TOOL-PROMPT.md`. It runs unattended and you will want the tool before the next 19 missions.
3. **Then ask Claude for the father-and-mother pass.** This is the single highest-value code change in the backlog: it is pure text, it touches the most factually wrong content in the game, and it is testable in one drive. Scope is section 3a.
4. **Leave the language switch until after that.** It is the biggest job in the backlog (section 3b, several hundred lines) and it is mechanical. Do not let it eat the session where you could be fixing what is actually wrong.

Why this order: the father and mother are wrong in a way a player who knows you would notice immediately. The language switch is invisible until it is finished. Do the wrong thing first.

**One thing to be careful of.** Do not let anyone "improve" the lines marked KEEP in the script draft. `Essai samedi matin. Six heures. Six heures du matin.` and `Mike: OSTIE.` and `Lumière de la cuisine éteinte. Tu es correct.` are the best writing in the game and they were already there.

---

## 1. Blocking decisions: Margaret is not a passenger

She rides in six missions. Routes, rewards and objectives stay in all six; only who is in the seat changes.

### 1a. `gang` — Ramasser la gang (DECISION NEEDED, has a mechanical fork)

**What the code does now.** `src/game/missions.js`. Stage one is:

```js
const marc = {
  text: 'Ramasse Margaret — 299 Chemin Fraser',
  sub: 'Suis le GPS pis arrête-toi dans le pilier jaune — elle embarque toute seule',
  hint: 'Elle est chez vous, dans ta propre entrée. Le pilier est sur ton char.',
  at: 'home', radius: 13, toast: 'Margaret embarque', passengers: +1,
};
```

Then Sayyad at Denise-Friend, then Adam at the marina, then everyone to Parc des Cèdres. Three passengers total, which is what drives the bench-seat branch:

```js
if (ctx.seats < 3) {          // the Ranger: two trips
  return [marc, steph, beach(..., -2), dave, beach(..., -1, 30)];
}
return [marc, steph, dave, beach(..., -3, 30)];   // a bigger car: one trip
```

**Why it is wrong.** The stop is Tom's own driveway and Margaret is his mother. She is not being collected to go and hang out at the park with three teenagers.

**What is tied to it.** `src/game/garage.js` line 46 unlocks Margaret's Saturn on completing this mission, with the menu string `Finis « Ramasser la gang »`, and `missions.js` auto-appends `Ça te donne les clés du char à Margaret.` to the brief. That tie survives any option below: a mother lending her son the Saturn after he has been useful is fine, and she does not need to be in the truck for it.

**Options.**

| Option | What changes | Cost | Consequence |
|---|---|---|---|
| **A. Abraham is waiting in your driveway** | one name and three strings | text only, zero mechanical | Passenger count stays 3, bench-seat branch untouched. Abraham is "the one others want along" per PLAN.md, so him being at your house needing a lift is unremarkable. His house exists as a place key but is not used here, which is fine. |
| **B. The stop becomes a load** (cooler, towels, speakers) | stage one loses `passengers: +1` and gains `kind: 'load'` and a hold | mechanical, small | Passenger count drops to 2, so the `ctx.seats < 3` branch collapses to a single trip and the two-trip version of the mission disappears. You lose a nice bit of Ranger-specific texture. |
| **C. Zahra comes instead** | one name, plus the stop probably wants to move to Denise-Friend | text plus a route change | Rejected: it duplicates Sayyad's stop and you said no route changes. |

**Recommendation: A.** It costs nothing, keeps the three-passenger bench-seat gag which is one of the few places the truck's smallness is the joke, and it puts Abraham in the game, who currently has a house, an avatar and almost no lines. If Abraham is wrong, name anyone who would plausibly be at your house on a summer afternoon and it is the same edit.

**What I still need from you:** just the name, or "load instead".

### 1b. `dames` — La tournée des dames (DECISION NEEDED, premise-level)

**What the code does now.** `src/game/verbjobs.js`. The whole mission is Margaret:

```js
brief: 'Margaret a le bingo de l'église pis pas de char. Elle parle. Tu conduis.',
giver: 'margaret', timeOfDay: 'dusk',
build() { return lift({ who: 'Margaret', from: 'margaret', to: 'church', ... }); }
```

Note `margaret` and `home` are the same address, 299 Fraser. So the drive is your house to Église Saint-Paul on Principale at dusk, she talks for five lines, it pays $30. The five lines are currently about your uncle Denis selling a Duster, rims your father heard about, and "tu vas partir en septembre, tout le monde le sait".

**Why this one is different from the other five.** Everywhere else she is a teenager's passenger, which is wrong. Here she is a mother asking her son for a lift, which is the most ordinary true thing in the entire game. The title "La tournée des dames" and the church bingo are the invented part, not the ride.

**Options.**

| Option | What changes | Cost |
|---|---|---|
| **A. Keep the mission, change where she is going and why** | title, brief, five lines, toast | text only |
| **B. Keep the route, give the seat to someone else** | title, brief, speaker, five lines | text only, but you lose the only mother-and-son drive in the game |
| **C. Cut it** | remove a mission | rejected, out of scope, and it is a good mission |

**Recommendation: A.** This is the one place where the corrected canon makes the mission *better* rather than needing repair. A mother who is very nice and quietly convinced you are up to something, alone in a truck with you at dusk for four minutes, is the best character scene available and it already exists. Keep the destination if a church errand is plausible; otherwise groceries, a friend's place, the hospital, anywhere you actually drove her.

Her five lines get rewritten either way: no uncle Denis, no resident father, no "you're leaving in September and everyone knows".

**What I still need from you:** where was she actually going, and one thing she said in the car. Two sentences is plenty.

### 1c. The four cheap swaps (confirm and they are done)

| Mission | Now | Proposal | Cost |
|---|---|---|---|
| `tour` | Margaret has two lines, no pickup | give them to Mike or Sayyad | one word |
| `highwayhull` | Margaret has one line at the end | give it to Adam or Zahra | one word |
| `circuit` | "Margaret pis Adam embarquent" for three laps of a street race | swap to Sayyad | one word |
| `quatre` | dropped home at 299 Fraser after a night at Mike's | swap to Abraham; his place key `abraham` at 841 Wilfrid-Lavigne already exists | one name, one place key |

---

## 2. Open canon questions

Each blocks specific text. None blocks the work in section 3a.

| # | Question | What it blocks |
|---|---|---|
| 1 | What did your father say when he handed over the truck, if anything? | the opener card and his phone lines in `alternateur` |
| 2 | Adam: one real trait. He is the only cast member with nothing confirmed. | every Adam line; he is currently a generic tired sarcastic passenger |
| 3 | Summer school, or another reason for a 9 a.m. class in July? | the `school` mission premise |
| 4 | Norm's real name and location. The code has Garage Hugo Caumartin at 143 Principale and Norm Lafleur on chemin d'Aylmer. | `vitres`, and the garage in `arcsurchauffe` |
| 5 | Which arc events are real: Saint-Jean at the beach, the bridge breakdown, the five-car convoy, Mike's last boxes? | all five arc beats |
| 6 | Is Rudy named in the opener at all, or cut? | one line, already drafted both ways |
| 7 | Mike and Zahra: English, French or both? | their bubbles; currently drafted English by default |

---

## 3. Text changes drafted and awaiting approval

### 3a. The father-and-mother pass (recommended first code change)

The largest factual error in the game and the cheapest to fix. Pure text, no mechanics.

- Ten `Ton père` entries in `FRIEND_LINES` (`src/game/story.js`) across `alternateur`, `school`, `curfew`, plus `ARC_LINES` for `arckeys` and `arcdernier`. All are written as a householder lending out his truck. He did not live there and he gave Tom the truck.
- Twenty-four `Ton père` lines in `assets/text/dialogue.json` (twelve start, twelve end), same problem: "ramène le truck avant six heures", "tu pourras le reprendre samedi si t'es sage".
- Margaret's twenty-four lines in the same file, written as an elderly passenger: "mes vieux genoux", "mon oncle Arthur en Gaspésie", "mon grand", "mon garçon".
- `curfew` brief: `Ton père se couche jamais avant toi` becomes her.
- `arckeys` load toast: the father's "c'est ça, le deal" becomes her asking for a favour.
- `endingCards` in `story.js`: Waterloo becomes the last year at Heritage, and a new final card gives the truck its 2011 ending.

Replacement lines for all of the above are drafted in `STORY-SCRIPT-DRAFT-v0.md`.

### 3b. The language switch (big, mechanical, do it second)

Settled: French narrator, English bubbles. Affects every spoken line in `FRIEND_LINES`, `GREETINGS`, `DIALOGUE`, `ARC_LINES`, `assets/text/dialogue.json`, `assets/text/zahra.json`, `assets/text/russell.json` and `assets/text/heckles.json`. Several hundred lines. Briefs, hints, toasts and HUD stay French and must not be touched.

Do it per character, not per file, so voices stay consistent.

### 3c. Voice replacement

- Sayyad's twelve generic openers in `dialogue.json` go. Nothing in them is him: Hawaiian shirt, cassettes, MAX 104.7, "ma blonde", Oakleys. Keep "Deux minutes. Faut que je trouve mes gougounes." Replace with the two gears, the Mac tangents, and deference to older people.
- Zahra keeps her precise mechanical observations. She gains cats and nails.
- Adam blocked on question 2.
- Research says six to ten variants for any line that can fire more than twice a session.

### 3d. Small fixes

| Where | Change |
|---|---|
| `sayyad` brief | "depuis mardi" to "depuis trois jours"; the prototype has real weekdays now |
| `stvincent` end | the patient thanking Tom becomes a staff handoff; a patient should not be a lesson |
| `stvincent` toast | drop "Bonus de défi" |
| `russellroyal` | all of Russell's lines to English; trim the triple "encore" in the brief |
| `margaretdental` | the crown, per the ledger; never confirmed out loud |
| `arcbache`, `arcsurchauffe`, `arcdernier` briefs | remove Saint-Jean, "canicule de juillet", "fin août"; they can fire in the first week |
| `arcdernier` | brief says "la gare" but the drive goes to the Galeries bus stop |
| `divan` | load toast names Sayyad holding the rope; completion toast adds the two of you standing in the truck bed |

### 3e. The gas gag

Seven beats mapped in `STORY-SCRIPT-DRAFT-v0.md`, all in completion toasts. Planted straight in `alternateur` with no joke, escalating, never two beats in consecutive missions after the third, with one reversal where someone overpays and Tom is suspicious. The reversal wants to be a Margaret job.

---

## 4. Mechanical changes, each needing its own yes or no

Deliberately separated from the text work. None is required by anything above.

| # | Change | Cost | Why |
|---|---|---|---|
| 1 | Sayyad on the passenger counter in `divan` | one field | He was really there, standing on the truck with you |
| 2 | Sayyad as a passenger in `margaretdental` | one field | Only to enable one joke; skip unless you want it |
| 3 | `gang` stage one as a load rather than a passenger | small, changes the bench-seat branch | Only if you pick option B in 1a |
| 4 | A date floor on the last two arc gates | about ten lines in `arc.js` plus a test | Today the epilogue can open in June because jobs no longer spend days. Text-neutral briefs are the cheap fix; this is the real one |

---

## 5. Art and picture-in-picture

Sourced precedents and risks are in `STORY-RESEARCH-NOTES.md` section E. Pipeline and prompts are in `ART-PHOTO-BRIEF.md`.

1. **Photos first.** Shot list is in the art brief. `references/story/` exists and is gitignored.
2. **Six-image proof batch** before any bulk generation: your reference sheet, Margaret's, one mission card, one place card, one chapter card, one posterised-photo fallback. Judge on one question: does someone who was there recognise the person and the corner?
3. **Then/now dissolve on the final lap of Principale.** Highest payoff, cheapest build, a 2D overlay keyed to waypoints. Build this one first.
4. **Sayyad's window lighting up on the third doughnut**, as an illustrated panel.
5. **Couch freeze-frame** on hitting the maple, via a framebuffer grab, not a second camera.
6. **Photo-finish snapshot** on races, filed into an album.
7. **Consent.** Every friend signs off on their own cards before anything ships. Quebec has a strong image-privacy regime and the repo is public.

Cut the convoy roster strip: no precedent and low payoff.

---

## 6. Infrastructure

| Item | State |
|---|---|
| PR #46, the story docs | open, ready to merge |
| The story editor tool | specified in `ANTIGRAVITY-TOOL-PROMPT.md`, not built |
| 38 merged remote branches | deletion blocked by the safety classifier; command is in `STORY-HANDOFF.md`, run it yourself |
| Nine unmerged branches | six are agent branches cut off by the September session limit; decide resume or close |
| `feat/tasteful-retro-upgrade` | pushed and backed up, unmerged, unverified |
| Kernel demo-video material | moved out of `gemini-inbox/` on 22 September to `../kernel-demo-video/gemini-pipeline-2026-09-10/` |

---

## 7. Out of scope, on purpose

Do not reopen these without a reason.

- Redesigning, reordering, combining or adding missions.
- Reviving the earn-Dad's-truck or lose-the-truck plots.
- The eighteen-mission outline in `assets/text/campaign.json` and `story.json`.
- Anything on the do-not-reintroduce list in `STORY-LEDGER.md` section 3.
