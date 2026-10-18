# Prompt for Antigravity: build the Aylmer story editor

Paste everything below the line into Antigravity. It is written to be self-contained, but the agent has repo access and should read the files named in it rather than guessing.

---

# BUILD: a local HTML story-editing tool for a personal video game

## Context you need before writing code

I am building a nostalgic arcade driving game called Aylmer Madness, set in the real town of Aylmer, Quebec, in the summer of 2004. It is based on my own memories, my real friends, and my real 1993 Ford Ranger. The game exists and works. It has 28 fixed missions and 5 story beats. The missions cannot be redesigned. What needs work is the writing: the mission briefs, the one-line dialogue bubbles that pop up while driving, and the completion messages.

The problem I am solving with this tool: turning my rambling memories into structured, labelled story data that an AI coding assistant can then apply to the game's source files. Right now that process lives in Markdown documents and it is slow and lossy. I want a tool that makes it fast and that feels good to use, where I can drag in old photos and see the story come together.

**Repository root:** `/Users/thomaslever/Desktop/Coding Projects/aylmer-madness`
**Branch:** work on a new branch off `main`. Do not commit to `main` directly.

**Read these first. They are the specification for the data model:**

- `docs/STORY-MISSION-INVENTORY.json` - the 28 missions and 5 arc beats with ids, titles and briefs. This is the structural constraint.
- `docs/STORY-LEDGER.md` - the canon: confirmed facts, facts the game currently gets wrong, a do-not-reintroduce list, open questions, and my exact phrases preserved verbatim.
- `docs/STORY-SCRIPT-DRAFT-v0.md` - a draft script for the first nine missions, showing the exact shape of what the tool must produce.
- `docs/STORY-RESEARCH-NOTES.md` - researched rules the tool must enforce, especially section A on dialogue length and timing.
- `docs/ART-PHOTO-BRIEF.md` - the photo shot list and the image-generation prompt templates the tool must assemble.
- `docs/STORY-HANDOFF.md` - the short version of all of the above.

**Settled language rule, which the tool must enforce:** mission briefs, stage directions, hints, toasts and all HUD text are in Quebecois French. Every spoken character bubble is in English. The line editor must default a bubble's language to English and a brief's to French, and warn if a bubble is written in French.

## Hard constraints

1. **No build step, no npm install, no framework.** This repository is a hand-written WebGL2 game with zero runtime dependencies and no bundler. The tool must match that: vanilla ES modules, plain CSS, and it must run by opening a file or by serving the folder with the existing `node tools/serve.mjs 8140`. Do not introduce React, Vue, Tailwind, Vite or a package.json.
2. **Everything stays local.** No network calls, no analytics, no cloud storage, no API keys. The photos are pictures of real people and the game repo is public.
3. **Photos never enter git.** Store them in IndexedDB. Before you finish, add `references/story/` to `.gitignore` and write a README in that folder explaining why it is ignored.
4. **The tool never edits the game's source files.** It only reads them and exports a bundle. Applying changes to the game is a separate step done by a coding assistant.
5. **No em dashes anywhere in the UI or in generated text.** Use a spaced hyphen instead. This is a standing rule of mine.

## Where it lives

`tools/story-editor/` in the repository. Entry point `tools/story-editor/index.html`.

## Step 1: build the extractor

Write `tools/story-editor/extract.mjs`, a Node script that reads the game's own source and produces `tools/story-editor/seed.json`. This is the tool's starting data, so it opens already full of the real game rather than empty.

Pull from:

- `src/game/missions.js` - the CORE_MISSIONS array: id, title, brief, giver, timeOfDay, and every stage's `text`, `sub`, `hint`, `toast`, `money`, `time`, `maxSpeed`.
- `src/game/sidejobs.js` - the canoe, Sayyad and couch missions.
- `src/game/verbjobs.js` - suis, dames, vitres, seme, sunfire, quatre.
- `src/game/racejobs.js`, `src/game/golfjob.js`.
- `src/game/lifejobs.js` - margaretdental, solerrand, stvincent, russellroyal.
- `src/game/arc.js` - the five beats and the `ARC_LINES` object.
- `src/game/story.js` - `STORY_CARDS`, `endingCards`, `FRIEND_LINES`, `GREETINGS`, `DIALOGUE`.
- `assets/text/dialogue.json`, `assets/text/zahra.json`, `assets/text/arc.json`.
- `src/game/places.js` - the place keys and labels, for the places screen.

Try dynamic `import()` first so you get real objects. Several of these modules import browser-facing siblings and may throw under Node, so wrap each import and fall back to a tolerant regex parse of the literal arrays. Report clearly which missions came from imports and which from parsing. Do not silently produce empty fields.

Also parse `docs/STORY-LEDGER.md` and `docs/STORY-SCRIPT-DRAFT-v0.md` into the seed: the confirmed canon, the do-not-reintroduce list, the open questions, my exact phrases, the per-character private questions, and every drafted line already written for missions 1 to 9 and the anchors.

## Step 2: the data model

One JSON document, persisted to IndexedDB on every change, with a version field.

```
{
  version: 1,
  updated: ISO8601,
  missions: [{
    id, title, order, kind: "campaign" | "arc",
    fixed: { giver, timeOfDay, stages: [{ text, sub, hint, toast, money, time, maxSpeed }] },
    current: { brief, friendLinesStart: [[who, line]], friendLinesEnd: [[who, line]], toasts: [] },
    proposed: { brief, start: [{ who, line, lang }], road: [{ who, line, lang, atStage }], end: [{ who, line, lang }], toast },
    anecdotes: [{ id, created, raw, exactPhrases: [], extracted: { people, places, objects, events, whyItStuck }, }],
    photoIds: [],
    verdicts: { brief: "keep"|"tweak"|"wrong"|"more", ... per line by id },
    status: "untouched" | "has-memory" | "drafted" | "approved" | "applied",
    toneTag: "cynical" | "warm" | "absurd" | "flat",
    notes
  }],
  people: [{ id, name, ageIn2004, confirmedTraits: [], privateQuestion, language, descriptors: [], voiceNotes, photoIds: [], doNotSay: [] }],
  places: [{ key, label, photoIds: [], notes }],
  canon: [{ id, fact, label: "confirmed"|"current-game"|"proposal"|"needs-confirmation", source, date }],
  rejected: [{ fact, date, why }],
  openQuestions: [{ id, question, answer, answeredDate }],
  gasGag: [{ missionId, line, form, beat }],
  photos: [{ id, filename, kind: "person"|"place"|"truck"|"object"|"group", subjectId, year, caption, blobKey }]
}
```

Every line carries a label: USER CONFIRMED, CURRENT GAME, PROPOSAL, or NEEDS CONFIRMATION. Render the label as a small coloured chip on every single line in the interface. This is the most important rule in the whole tool. Generated prose must never be mistaken for my memory.

## Step 3: the screens

**Mission board.** All 33 as a grid of cards, in game order, campaign and arc visually distinct. Each card shows the title, the French brief, the status colour, a count of attached memories and photos, and thumbnails of any photos. Filters for status, for "has my memory", and for tone tag. Click to open.

**Mission detail.** Three columns.

- Left, read-only: the fixed gameplay. Giver, time of day, every stage with its objective text, hint, money and any timer. Grey, clearly marked "cannot change".
- Middle, read-only: the current game text with its CURRENT GAME chips. Every existing friend line and toast. Each line has four buttons: keep, tweak, wrong, more story. Clicking one records a verdict and colours the line.
- Right, editable: the proposal. Fields for the brief, and repeatable line rows for start, on the road and end, plus the completion toast. Each row has a speaker dropdown from the cast, a language toggle for English or French, the line itself, and a live validator.

**The validator is the feature that makes this tool worth building.** For every line, show word count and character count against the limits of 12 words and 70 characters, an estimated on-screen time using 0.3 seconds per word with a 1 second floor, and a warning when two consecutive lines come from the same speaker or when the total reading time for one mission exceeds 12 seconds. Colour the counter green, amber and red. These numbers come from `docs/STORY-RESEARCH-NOTES.md` section A and are cited there.

**The memory capture box.** A single large text area with one prompt above it: "Just tell me what happened." No form, no required fields. Below it, one button that marks the selected text as an exact phrase, storing it verbatim and separately from any paraphrase. No audio recording and no transcription: that is a different tool of mine and does not belong here.

**Preview mode.** A button on the mission detail that renders the mission the way the game shows it: the brief as a job card in the game's HUD style, then the bubbles playing in sequence at their real computed timing, with the name tag in bold. I want to feel whether it is too much text to read while driving. Pull the fonts and colours from the game's own `src/css` or `index.html` so it looks right.

**People.** A card per cast member: name, age in 2004, confirmed traits, the private question that drives their voice, their language, a photo strip, and a free-text voice-notes box. Also a "do not say" list per person. Cast to seed: Tom, Margaret (his mother), Sayyad, Zahra, Mike, Russell, Adam, Norm, Abraham, Tyler, Rob, and Dad as phone-only.

**Places.** A card per place key from `src/game/places.js`, each a photo drop target with notes.

**Canon ledger.** Three tabs: confirmed facts, the do-not-reintroduce list, and open questions with answer fields. When I answer an open question, it becomes a confirmed fact with today's date and the question is struck through but kept.

**Export.** Described below.

## Step 4: photos, drag and drop

Dropping image files anywhere on a mission, person or place attaches them there. Also support a global drop zone that files by filename convention `who_year_shot.jpg`.

Store the blob in IndexedDB, generate a thumbnail, and record filename, year, kind, subject and caption. Show photos as a strip with a lightbox on click. Allow reordering, captioning and deleting. Allow tagging one photo per person as the reference-sheet source.

**Connect the photos to the art pipeline.** On a person card, a button called "build image prompt" assembles the exact ChatGPT prompt from `docs/ART-PHOTO-BRIEF.md`: the style block copied byte for byte, then the subject tokens from that person's descriptors, then the shot, action, place and mood fields I fill in. Copy to clipboard in one click. The same on a place card using the place-card template, and on a mission card using the mission-card template with that mission's giver as the subject. The style block must be a single constant in the code, copied and never paraphrased, because paraphrase causes the generated faces to drift.

Track which people have an approved reference sheet, and warn on the mission-card prompt if the subject has none, since the pipeline requires the sheet first.

## Step 5: export, which is the whole point

An export screen with three outputs.

1. **`story-submission.json`** - the full data document, minus photo blobs, with a photo manifest listing filenames and their tags.
2. **`STORY-SUBMISSION.md`** - a generated Markdown brief that reads the way my existing documents read. Per mission: what is fixed, what I said in my own words with exact phrases quoted separately, the proposed lines with their labels and verdicts, and what remains unconfirmed. Only missions that have something new. This is the file I paste to Claude.
3. **A photo bundle** - the original files, renamed to the convention, written into `references/story/`. No audio.

Use the File System Access API so I can pick the repository folder once and have exports written straight into it, with a plain download as the fallback for browsers that do not support it. Remember the handle.

Add a "copy submission prompt" button that puts a short instruction plus the Markdown on the clipboard, ready to paste into Claude Code, telling it to apply only lines marked approved, text only, one commit per mission.

Also support importing a `story-submission.json` back in, so a session can be resumed on another machine.

## Step 6: quality bar

- It must open and be usable in under two seconds with all 33 missions and 100 photos loaded.
- It must survive a browser crash. Persist on every change, not on a save button.
- Keyboard first: J and K to move between missions, a key to jump to the memory box, escape to close the lightbox.
- Make it look like the thing it is about. Warm, sun-bleached, early 2000s. Take the palette from `assets/text/palette2004.json` if it is usable. It should feel like a scrapbook, not like a CMS.
- Write a `tools/story-editor/README.md` covering how to run it, where data lives, how to reset, and how to get the exported bundle to Claude.

## What I do not want

Do not invent story content. The tool organises my memories; it does not write them. Do not add an AI text generator, a suggestion engine or autocomplete for dialogue. Do not add user accounts, sync, or a server. Do not touch anything in `src/` or `assets/`. Do not commit photos.

## Definition of done

`node tools/story-editor/extract.mjs` produces a seed with all 33 missions and their real current text. Opening `tools/story-editor/index.html` shows the mission board populated. I can open Réveiller Sayyad, read the existing lines, mark one wrong, type a memory, mark a phrase as exact, drag in three photos, write two replacement bubbles, see the validator turn green, preview them at real timing, and export a Markdown brief that contains exactly what I changed and nothing else.
