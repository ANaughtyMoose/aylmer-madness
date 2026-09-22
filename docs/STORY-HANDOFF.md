# Aylmer Madness story work: session handoff

Written 22 September 2026. Read this first in a new session, then STORY-LEDGER.md. Nothing in the game has been edited. All story work so far is documents.

## Where everything is

**Story work now lives in the main repository**, `~/Desktop/Coding Projects/aylmer-madness`, on branch `docs/story-editing` off `main` (moved there 22 September 2026). Earlier copies still sitting in the Codex prototype checkout at `~/Documents/Codex/2026-09-18/al/work/aylmer-madness` are superseded; do not edit those.

The Codex checkout remains the home of the 2004 visual prototype only, branch `codex/2004-graphics-prototype`, draft PR #45.

| File | What it is | Author |
|---|---|---|
| `docs/STORY-MISSION-INVENTORY.json` | The structural constraint: 28 campaign missions, 5 arc beats, the gates | Codex |
| `docs/STORY-DIRECTION-AND-MISSION-CARDS.md` | Codex's story pass, assessed and partly superseded | Codex |
| `docs/STORY-LEDGER.md` | The living canon: confirmed facts, wrong facts, do-not-reintroduce, open questions, Tom's exact phrases | Claude |
| `docs/STORY-RESEARCH-NOTES.md` | Three Opus research passes with sources: dialogue rules, storytelling techniques, static art and inserts | Claude |
| `docs/STORY-SCRIPT-DRAFT-v0.md` | Draft script: opener, missions 1 to 9, the three anchors, prologue, endings, gas gag | Claude |
| `docs/ART-PHOTO-BRIEF.md` | Photo shot list, style block, five ChatGPT prompt templates | Claude |
| `docs/ANTIGRAVITY-TOOL-PROMPT.md` | Prompt to build the HTML story-editing tool, targeting this repo | Claude |

Also updated: `~/Desktop/Coding Projects/aylmer-madness/PROJECT.md` status and next step.

## The five facts that changed everything (USER CONFIRMED, 21 Sept 2026)

1. **Margaret is Tom's mother.** 299 Fraser is her house and Tom lived in the basement. Very nice, and suspicious he was always doing something wrong. Suspicious of Abe and the other friends, ended up liking them all. The game had written her as an elderly passenger with bingo and bad knees. Wrong.
2. **Tom's parents divorced when he was 5. His father did not live at 299 Fraser.** A big part of his life, not a big part of his time in Aylmer. Every "Ton père" line spoken from inside the house is wrong. Dad belongs on the phone.
3. **Dad bought the truck** from his sister's boyfriend and paid Rudy, the husband of Tom's old babysitter, to get it running, spending more than planned. Bald tires, not reliable. Tom kept it running until 2011 on Bay Street. It carried him to Waterloo, Boston, Montreal, Toronto, and every internship move.
4. **Summer 2004 is one year before Tom finished CEGEP at Heritage** and went to Waterloo. The ending card saying Waterloo is a year early.
5. **The anchors are real.** Mike's tree was Tom and Sayyad standing on the truck. The Dr Morin box held Tom's own teeth after a bike crash. Sayyad slept in and was impossible to wake, then talked fast about Macs. Zahra loved cats and attacked people with her nails. Russell is English.

Tone ruling: funny and cynical. Gas money for helping usually comes in under the gas cost.

Sensitive and kept out of game text: the aunt and her boyfriend's substance history, and any claim that Rudy sold stolen cars. Rudy's name appears once in the opener with no claim attached, and can be cut.

## What the game currently gets wrong

Listed in full in STORY-LEDGER.md section 2. The big ones: ten father lines that read as a truck lender, Margaret as a grandmother, Waterloo in 2004, and a generic sarcastic voice shared by Sayyad, Zahra and Adam. Around 60 percent of existing text survives with a speaker swap or one word changed.

## The rules the writing follows

- Bubbles of 12 words or fewer, about 3 seconds, at least 6 seconds apart. Only Mike gets speeches, and they chain as short lines that abort when the world changes.
- Each character answers one private question: Margaret "what is he not telling me", Sayyad "what is the newest version of this", Zahra "which animal is this person", Russell "what is broken and what do you owe me", Mike "what is the theory". Adam still has no confirmed trait.
- Load-bearing text in the language the player reads. French for narrator, briefs and signage. English speakers written fully in English.
- The gas gag is planted straight in job 1, escalates in completion toasts, never lands in two consecutive missions after the third beat, and gets exactly one reversal where someone overpays.
- Nostalgia through specific unflattering detail, not brand names.

## Settled 22 September 2026

- **French narrator, English bubbles.** Briefs, hints, toasts and HUD in Quebecois French; every spoken line in English.
- **Margaret spoke English and called him Tom.** No "mon grand".
- **She never rode along with the gang.** Six missions put her in the truck and all six are wrong. Ledger section 5a lists the fix per mission; four are one-word swaps, two need Tom.
- **The Dr Morin box is a crown for Alanis Morissette**, never confirmed out loud. The teeth are gone because the bike crash was later. Approved fiction, not memory.

## Decisions still open

1. What Tom's father said when he handed over the truck, if anything.
2. Adam: one real trait. He is the only cast member with nothing confirmed.
3. Summer school or another reason for the 9 a.m. class.
4. Norm's real name and location (the code has two).
5. Which arc events are real: Saint-Jean at the beach, the bridge breakdown, the convoy, Mike's boxes.
6. Whether Rudy is named in the opener at all.
7. The two Margaret missions in ledger 5a: who is waiting at 299 Fraser in `gang`, and what becomes of `dames`.

## Next actions, in order

1. Build the story editor from `ANTIGRAVITY-TOOL-PROMPT.md`, then use it instead of marking up Markdown by hand.
2. Tom marks up `STORY-SCRIPT-DRAFT-v0.md` with keep, tweak, wrong or more story.
2. Claude applies approved text on a branch off `codex/2004-graphics-prototype`. Text only, one commit per mission, tests run, nothing merged.
3. Tom gathers photos into `references/story/` per ART-PHOTO-BRIEF.md and runs the six-image proof batch through ChatGPT.
4. Two picture-in-picture inserts get implementation notes before any code: the then-and-now photo dissolve on the final lap of Principale, and Sayyad's window lighting up on the third doughnut.
5. Remaining 19 missions get drafted as anecdotes arrive.

`references/story/` must be added to `.gitignore` before any photo lands. The repo is public and these are photographs of real people. `data/raw/` is already ignored and is an acceptable alternative location.
