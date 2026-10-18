# Aylmer Madness story ledger

Living document. Started 21 September 2026 by Claude (story editor). Read after STORY-DIRECTION-AND-MISSION-CARDS.md (Codex) and STORY-MISSION-INVENTORY.json. Thomas's memories outrank everything below. Labels: USER CONFIRMED / CURRENT GAME / PROPOSAL / NEEDS CONFIRMATION.

Status columns for every text change: suggested → approved → implemented. Nothing below is implemented yet.

## 0. Tone and language rulings (USER CONFIRMED)

21 Sept 2026: "Make it a bit funny and cynical." Gas money for helping often comes in at less than the gas cost. Russell is English: write him in English. Most friends spoke mainly English but also French.

22 Sept 2026, settled:

- **Language layout: French narrator, English bubbles.** Briefs, stage directions, hints, toasts, HUD and signage stay Québécois French. Every character's spoken bubble is in English. This is now the rule for all 33 missions.
- **Margaret spoke English with Tom and called him Tom.** Not "mon grand", not "mon garçon". Every French Margaret line in dialogue.json and FRIEND_LINES is replaced.
- **Margaret did not ride along with the gang.** "no idea where that comes from". She is not a passenger on the park run, the sunset tour, the three-lap circuit, the Hull drive or the end of Mike's party. See section 5a for the six missions this touches.
- **The Dr Morin box is not Tom's teeth.** The bike crash happened later; drop it. Tom's replacement, an approved knowing fiction rather than a memory: the box holds **a dental crown for Alanis Morissette**. She is from Ottawa, which makes a crown passing through a small Aylmer lab exactly the kind of thing that would be true. Label it APPROVED FICTION in any card. Do not have Margaret confirm it out loud; the joke is better unconfirmed, and it keeps a real person's name attached to nothing more than a crown.

## 1. Canon: USER CONFIRMED

### From Thomas directly, 21 September 2026

- Parents divorced when Tom was 5. His father did not live at 299 Fraser. "He was a big part of my life but not a big part of my time in Aylmer."
- Margaret is Tom's mother. 299 Fraser is her house. Tom lived there, in the basement. "Very very nice but also suspicious that I was always doing something wrong." Suspicious of Abe (Abraham) and the other friends, but ended up liking them all.
- The truck was a gift from his father at 17. Dad bought it from his sister's boyfriend (late 40s). Dad took it to Rudy, the husband of Tom's old babysitter, to get it running, and spent more than planned. Bald tires, not that reliable, "pretty shaky". Tom kept it running until 2011 when he was working on Bay Street. It carried him around Aylmer, Ottawa, Montreal, Boston, Toronto, and to most of his Waterloo internships, packing up his whole place every semester (nanotech).
- Summer 2004 is one year before Tom finished CEGEP at Heritage College and went to Waterloo. So fall 2004 is his last Heritage year, not university.
- Sayyad: always slept in, hard to wake, then really animated and fast-talking once going. Talks about Mac computers, loves tech. Very polite with everyone and patient with older people.
- Zahra: loved cats, "would attack people with her nails". Very smart and fun.
- Mike's tree was real. It was Tom and Sayyad, and they stood on the truck to get the couch in.
- The box from Dr Morin: Tom's own teeth, after a bike crash.
- Russell: English-speaking.

### Sensitive, keep OUT of game text unless Thomas says otherwise

- The aunt and her boyfriend "pretty wacked due to past substance abuse". Rudy "I think sold stolen cars but I only realized it then". Real people. Default: the game hints at the truck's murky provenance in Tom's own voice only, names nobody's condition, and never states a crime as fact.

### From earlier sessions (code comments and PLAN.md quoting Thomas)

- First job is the alternator at Canadian Tire, no clock.
- "reality is I never went to the poutine place so it just doesn't feel right."
- Adam lives in Mayo, Québec, off-map, and drives in.
- Russell (16, 1 rue Arial, skateboarder) is a friend, not a vendor. Labour costs pizza and beer.
- Cast: Sayyad (Civic, 75 Denise-Friend), Zahra (15, Symmes), Margaret (Saturn, 299 Fraser), Adam Actell (Sunfire), Mike McDonald (129 Frank-Robinson), Russell, Norm, Abraham (841 Wilfrid-Lavigne, guitar), Tyler Yank, Rob French. Never invent surnames.
- Only Mike gets to make a speech.
- Tom's birthday is 23 July.

## 2. CURRENT GAME facts now known to be WRONG or unconfirmed

- WRONG: "Ton père" as a lender who lives in the house ("Ramène le truck avant six heures", "tu pourras le reprendre samedi si t'es sage", "Tu fais le transport, tu mets ton gaz, c'est ça le deal"). Dad is not at 299 Fraser. All "Ton père" lines in dialogue.json, arc.js, story.js FRIEND_LINES (school, alternateur, curfew, arckeys, arcdernier) need rewriting or reassigning to Margaret.
- WRONG: "curfew" brief "Ton père se couche jamais avant toi". It is Margaret's kitchen light.
- WRONG: ending card "Réparer le Ranger pour les études à Ottawa, ou préparer le loyer à Waterloo". Waterloo is 2005. Fall 2004 is Heritage.
- WRONG: Margaret as a bingo-going elder with "mes vieux genoux" and "mon oncle Arthur en Gaspésie". She is Tom's mother. Age unstated; write her as a mother, not a grandmother.
- WRONG: Margaret's "Ton père a dit que t'avais acheté des jantes" and "Ton père conduisait moins bien à ton âge" imply a household father.
- UNCONFIRMED: Margaret as a dental technician for Dr Morin. Thomas confirmed the box held his teeth after a bike crash, which implies she does dental lab work. Ask whether "technicienne dentaire chez le Dr Morin" is exactly right.
- UNCONFIRMED: Saint-Jean at the beach, couch on the Champlain bridge, acceptance letters, five-car convoy, Mike leaving on a bus.
- UNCONFIRMED: Russell fired from Royal Ottawa over golf carts.
- UNCONFIRMED: Norm Lafleur vs Garage Hugo Caumartin (two names, two addresses in code).
- UNCONFIRMED: "Première période" at Heritage at 9:00 in summer.
- UNCONFIRMED: "Sayyad, c'est un bon gars. Sa mère s'inquiète" (dames). Keep only if true.

## 3. Do not reintroduce

- Adam in Deschênes or at 20 chemin Vanier.
- Poutine as Tom's own craving or as the opening job.
- Russell as a discount mechanic, or Russell in French.
- Dad living at 299 Fraser, Dad lending the truck, Dad's curfew, losing the truck at the end.
- Margaret as elderly, "vieux genoux", Gaspésie uncle, bingo as her identity.
- Waterloo as the fall-2004 destination.
- A surname for anyone not in the PLAN cast list.
- Invented departures, romances, illnesses or fallings-out attributed to a real person.
- Naming the aunt's or her boyfriend's substance history, or stating Rudy sold stolen cars, in game text.

## 4. Character voice notes (USER CONFIRMED traits, PROPOSAL on how to write them)

| Who | Confirmed | How to write (proposal) | Language |
|---|---|---|---|
| Margaret (mother) | very very nice; suspicious Tom is always doing something wrong; suspicious of his friends, ends up liking them all | Kindness and suspicion in the same breath. Never a lecture. She asks a question that is really an accusation, then feeds everyone. Arc across missions: friends go from "that boy" to first names. | NEEDS CONFIRMATION: French, English, or both with Tom? |
| Sayyad | sleeps in, hard to wake; then animated, fast-talking; Macs and tech; polite, patient with older people | Two gears: silence, then a run-on sentence. Tech tangents. Deferential to Margaret and anyone older, which makes the doughnut mission funnier. Drop Hawaiian shirt / cassettes / MAX 104.7 unless confirmed. | English mainly, some French |
| Zahra | loves cats; attacks people with her nails; very smart and fun | Quick, precise, physical. Corrects people and enjoys it. Cats appear where they should not. Not a sarcastic clone of Adam. | English mainly, some French |
| Mike | couch in the tree; speeches | Theories delivered with total confidence. Keep. | NEEDS CONFIRMATION |
| Russell | English; fixes cars for pizza and beer; golf club story | Explains himself at length, never once at fault in his own telling. | English |
| Adam | drives in from Mayo | Dry, low energy. Needs a real trait; nothing confirmed yet. | NEEDS CONFIRMATION |
| Tom (narration and toasts) | pays for everything; truck is shaky | Cynical accounting voice: what it cost, what he got. Never self-pity. | French HUD stays; see open question 1 |

## 5. Open questions (ask, don't pick)

Answered 22 Sept 2026: language layout (French narrator, English bubbles), Margaret's language and name for Tom (English, "Tom"), the Dr Morin job title (correct) and the box contents (a crown, not teeth), and whether Margaret rode along (she did not).

Still open:

1. What did your father say when he handed over the truck, if anything?
2. Adam: one real trait. He is the only cast member with nothing confirmed.
3. Summer school or another reason for "Première période" at 9 a.m.?
4. Norm's real name and location. The code has Garage Hugo Caumartin at 143 Principale and Norm Lafleur on chemin d'Aylmer.
5. Which arc events are real: Saint-Jean at the beach, the bridge breakdown, the five-car convoy, Mike's boxes?
6. Is Rudy named in the opener at all, or cut?
7. The six Margaret questions in 5a below.

## 5a. Taking Margaret out of the truck (needs six small decisions)

She appears as a passenger in six missions. Routes and rewards stay; only who is in the seat changes. Four are one-word swaps. Two need a real answer.

| Mission | What she does now | Cost to change | Proposal |
|---|---|---|---|
| tour | two lines, no pickup | one word | give the lines to Mike or Sayyad |
| highwayhull | one end line | one word | give it to Adam or Zahra |
| circuit | rides in a three-lap street race with Adam | one word | swap to Sayyad; a mother in a street race is the wrong image |
| quatre | dropped home at 299 Fraser after a night at Mike's | one name plus one place key | swap to Abraham, whose house exists as a place key at 841 Wilfrid-Lavigne |
| gang | picked up in Tom's own driveway to go to the park; this mission unlocks her Saturn | one name, route unchanged, because the stop is Tom's own house | **needs Tom**: is somebody waiting at his house (Abraham fits), or is the stop a load instead of a passenger? A load changes the bench-seat branch, so it is mechanical |
| dames | the whole mission is driving her to church bingo while she talks | premise-level | **needs Tom**: a mother asking her son for a lift is the one place a Margaret ride-along is natural. Keep the mission and change the destination and the reason, or cut her and rebuild it around someone else? |

## 6. Proposals log

| Date | Mission | Change | Status | Notes |
|---|---|---|---|---|
| 2026-09-21 | (premise) | The only truck; every favour costs Tom more than it pays | suggested | tone: funny, cynical |
| 2026-09-21 | alternateur | Rewrite father lines: Dad is off-scene, bought the truck, Rudy got it running; mother at the counter of the kitchen | suggested | see Claude response 2 |
| 2026-09-21 | sayyad | Sleeper then fast-talker; end line rewritten | suggested | |
| 2026-09-21 | divan | Tom and Sayyad standing on the truck; Sayyad as passenger | suggested | text plus a possible small mechanical note (Sayyad on board) |
| 2026-09-21 | margaretdental | The box is Tom's teeth; Margaret's suspicion; mother voice | suggested | needs Q4 |
| 2026-09-21 | curfew | Father to mother | suggested | |
| 2026-09-21 | russellroyal | English; his own account carries the joke; gas money under gas cost | suggested | |
| 2026-09-21 | arckeys | Remove father's "deal"; the Ranger is already Tom's | suggested | |
| 2026-09-21 | ending cards | Drop Waterloo; add the truck's future (2011) as the last line | suggested | |
| 2026-09-21 | stvincent | Neutral staff handoff; drop "Bonus de défi" | suggested | unchanged from response 1 |
| 2026-09-21 | arcbache / arcsurchauffe / arcdernier | Date-neutral briefs | suggested | |

## 7. Rejected details

- Father at 299 Fraser (21 Sept 2026).
- Waterloo in fall 2004 (21 Sept 2026).

## 8. Exact phrases from Thomas

Kept verbatim, separate from any paraphrase.

- "reality is I never went to the poutine place so it just doesn't feel right." (first playtest)
- "Adam doesn't live in Deschênes — that was imagined and it's not true. He lives in Mayo, Québec, off-map." (2026-09-01)
- "My parents have been divorced since I was 5 and my father didn't live at 299 Fraser. he was a big part of my life but not a big part of my time in Aylmer."
- "Russell is english - say it in english and find other words that work"
- "mak eit a bit funny and cynical. Gas money for helping often comes in at less than the gas cost."
- "Sayyad always slept in and would be hard to wake up but then he was really animated and fast speaking when he finally got going."
- "Mike's tree was real - was Tom (me) and Sayyad and we stood on the truck to get it in there."
- "In the box for Dr. Morin - Tom's teeth after bike crash"
- "Margaret is my mother - 299 Fraser is her house and I lived there, in the basement. She was very very nice but also suspicious that I was always doing something wrong. suspicious of abe and my other friends but ended up liking them all"
- "Most of my friends spoke english mainly but also spoke french. Zahra loved cats, and would attack people with her nails. She was very smart and fun. Sayyad would talk about Mac computers, loved tech, but was very polite with everyone and patient with older people."
- "My dad bought me the truck. It was pretty shaky - he bought it from his sister's boyfriend in his late 40s. [...] He brought the truck to my old baby-sitter's husband, Rudy [...] it was a gift when I was 17 and he spent more money on it than he planned to just to get it running but it had bald tires and it wasn't that reliable... but I kept it running until I was working on bay street in 2011 and it carried me all over aylmer, ottawa, montreal, boston, toronto, and to most of my internships at waterloo where I packed up my whole place every semester and moved (nanotech)."
- "This was the summer 1 year before I finished CEGEP Heritage College and went to waterloo"
