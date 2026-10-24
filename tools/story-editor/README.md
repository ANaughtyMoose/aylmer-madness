# Aylmer Madness - Story Editor

A zero-dependency, local HTML tool for structuring personal memories, dialogue barks, mission briefs, and reference photos for *Aylmer Madness* (summer 2004, Aylmer, Quebec).

## How to Run

You can run the tool in two ways:

1. **Via the local static server (recommended):**
   ```bash
   node tools/serve.mjs 8140
   ```
   Then open `http://localhost:8140/tools/story-editor/index.html` in Chrome or Edge.

2. **Directly in the browser:**
   Open `tools/story-editor/index.html` directly in any modern browser (e.g. Chrome, Edge, Safari, Firefox).

## Re-extracting Seed Data

To refresh `seed.json` from the game source files and planning documents:
```bash
node tools/story-editor/extract.mjs
```
This reads:
- `src/game/missions.js` and all job submodules (`sidejobs.js`, `verbjobs.js`, `racejobs.js`, `golfjob.js`, `lifejobs.js`)
- `src/game/arc.js` (five story beats)
- `src/game/story.js` (`FRIEND_LINES`, `STORY_CARDS`, `endingCards`)
- `src/game/places.js` (all 44 place landmarks)
- `docs/STORY-LEDGER.md` (canon facts, open questions, exact phrases, voice notes)
- `docs/STORY-SCRIPT-DRAFT-v0.md` (drafted scripts for missions 1 to 9, anchors, and gas gag table)

## Where Data Lives

- **IndexedDB**: All working edits, verdicts, proposals, audio recordings, and photos are stored in browser IndexedDB (`AylmerStoryEditorDB`).
- **Autosave**: Every keystroke, verdict click, and line change is automatically saved to IndexedDB.
- **Photos**: Never committed to Git. Stored as Blobs in IndexedDB. When exported, photos are written to `references/story/`, which is gitignored.
- **Reset to Seed**: To discard local edits and reset to `seed.json`, click the "Reset to Seed" button in the top header.

## Keyboard Shortcuts

- `J`: Navigate to next mission (in Mission Detail view).
- `K`: Navigate to previous mission (in Mission Detail view).
- `M`: Jump focus to the memory capture textarea.
- `Escape`: Close any open modal (Lightbox, Preview HUD, Prompt Builder).

## Dialogue Validator Rules (Section A)

The live validator enforces dialogue constraints from `docs/STORY-RESEARCH-NOTES.md`:
- **Word count**: Maximum 12 words per bubble.
- **Character count**: Maximum 70 characters per bubble.
- **On-screen display time**: `0.3s * words + 1.0s` floor, clamped between 2.5s and 5.0s.
- **Turn-taking**: Warns if two consecutive lines in a sequence come from the same speaker.
- **Cumulative glance budget**: Warns if total mission reading time exceeds 12.0 seconds.

## Art Pipeline & Prompts

- On any cast card, click **"Build Image Prompt"** to generate the exact ChatGPT prompt from `docs/ART-PHOTO-BRIEF.md` containing the byte-identical early-2000s illustrated art style block.
- On any mission card, click **"Build Mission Card Prompt"**. The tool warns if the mission giver does not have an approved reference sheet yet.
- Photos dropped using the convention `who_year_shot.jpg` (e.g. `sayyad_2004_car.jpg`) are automatically filed under the corresponding character or place.

## How to Export and Pass to Claude

1. Navigate to the **Export & Sync** tab.
2. Click **"Save Directly to Repo (File System Access)"** to write:
   - `story-submission.json`
   - `STORY-SUBMISSION.md`
   - Photos to `references/story/`
3. Click **"Copy Claude Code Prompt"** to copy the formatted instruction and markdown brief to your clipboard.
4. Paste the prompt directly into Claude Code. The instructions prompt Claude to apply only lines marked `APPROVED`, text only, one commit per mission.
