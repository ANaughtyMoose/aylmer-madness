# Opening sequence: design

Claude, 29 Sept 2026. DESIGN for Tom's review; nothing is built yet. Research behind it: `docs/design/GREAT-GAMES-RESEARCH.md` section 3. The story it opens: `docs/design/MAIN-STORY-PROPOSAL.md`.

## The idea

A 90-second, skippable photo title sequence in the spirit of the *Cheers* opening: real snapshots, warm, unhurried, named people, the feeling of a place where everybody knows you. It ends the way GTA IV hands Niko the keys: the last photo, the Ranger in the driveway at 299 Fraser, dissolves into the live 3D game from the same angle, the engine cranks twice and catches, and you're driving.

It has to *work*, not just exist:

- It plays over loading, so it never adds wait time.
- Hold Space or Esc to skip, from the first frame of the first boot.
- It is seen once, then offered as "Revoir l'intro" on the menu.
- Every shot is a data entry, so any photo can be pulled or swapped without touching code.

## The cut (about 90 s)

The shape: cold open, the truck, home, the people, the town, the title, the handoff. Every duration and move follows the research rules: 5-15% scale change per shot, eased, 3-5 s on a face, 6-10 s on groups and places, never three identical moves in a row.

| # | Shot | Move | Seconds | Caption |
|---|---|---|---|---|
| 0 | Black. FM static, an invented French station ID, the date read out | none | 4 | "mardi 22 juin 2004" |
| 1 | The Ranger, close: the tailgate, the badge or the rust | tight, pulling out | 6 | "Ford Ranger 1993." |
| 2 | The Ranger, side profile | slow pan left to right | 6 | "Pas le plus beau. Le seul." |
| 3 | 299 Chemin Fraser | push in toward the basement window | 6 | "299, chemin Fraser. Le sous-sol." |
| 4 | Margaret | push in, hold | 5 | "Ma mère." |
| 5 | Sayyad | push in | 4 | "Sayyad." |
| 6 | Mike | drift | 4 | "Mike." |
| 7 | Zahra | push in | 4 | "Zahra." |
| 8 | Russell | drift | 4 | "Russell." |
| 9 | Abraham | push in | 4 | "Abe." |
| 10 | Adam and/or Tyler | pan | 4 | names |
| 11 | The gang, group shot | wide, drifting across faces | 9 | none |
| 12 | Rue Principale | pan left to right | 6 | "Aylmer, Québec." |
| 13 | The beach, the marina or the bonfire | slow pull out | 7 | none |
| 14 | Title | still, fade | 6 | AYLMER MADNESS · été 2004 |
| 15 | The Ranger in the driveway at 299 Fraser, same angle as the game's spawn | hold, cross-fade to live 3D | 5 | the engine cranks twice, then catches |

Seven people are listed, but any can be dropped (the cut just gets shorter). Friends who don't send a photo, or don't want one used, get a place shot or nothing, never a stand-in.

**The first ten seconds of play:** Margaret in the doorway, in English: "Tom. Where are you going this early?" Then the battery light, and mission 1, L'alternateur.

## Look

- **Period photos:** 4:3 frames inside the widescreen, the 2004-05 point-and-shoot look. Warm, slightly cyan shadows, light grain added in the renderer (never by damaging the files), and slightly blown highlights.
- **Date stamps:** an orange date stamp only where Tom knows the real date. Never a made-up date on a real moment.
- **Transitions:** one frame device. Photos slide out of a Jean Coutu photo envelope onto a kitchen table, then fill the screen. No page curls or spins.
- **Captions:** lower left, short (at most 8 words), French (English when the game is set to English), no em dashes.

## Sound

The sequence opens on static and a station ID, so the radio is the game's voice from second one. One piece of music runs under the whole cut, and the Ranger's cranking is the bridge into play.

- **Music:** Tom picks one song that *is* that summer. A commercial song can only go in Tom's private build; the public version needs something cleared or original. The existing private radio recordings stay private in the same way.

## Privacy and consent

The repo is public.

- **Where photos live:** only in a private local folder that git never sees. The local server serves them to Tom's own browser, the way it already serves the private radio recordings.
- **What ships:** the repo gets the shot list (`intro.json`) and the code, never a photo.
- **Public fallback:** the public build plays the same cut with places and objects only, or skips it.
- **Consent:** each friend OKs their own photos before anything public; for Tom's private build, Tom's call.
- **Screening:** use only photos where everyone visible is someone in this game, or strangers in the background.
- **Dad:** Dad is not in the sequence unless Tom wants him there; he gets one photo, as the portrait on his phone calls.

## Build

- `intro/intro.json` (in the repo): `{ id, file, dur, from:{x,y,scale}, to:{x,y,scale}, caption_fr, caption_en, date }` per shot.
- The player is a full-screen layer over the 3D canvas: CSS transforms for the moves, a small WebGL or canvas pass for grain and grade, and an audio element for the track.
- The world loads underneath, and the last shot fades out over the live spawn view. The spawn camera pose is matched to shot 15's photo.
- `tools/serve.mjs --photo-dir <private folder>` works like `--audio-dir`: localhost only, no path traversal. With no folder, the fallback plays.
- Tests: the shot list parses, every shot has a fallback, skip works during loading, "seen" is remembered, and no photo path ever points inside the repo.

## What Claude needs from Tom

1. **Photos.** The originals if you have them; Facebook downloads (about 2048 px) are fine. Name them `who_year_what.jpg`, e.g. `sayyad_2005_driveway.jpg`, and put them in one folder, suggested `~/Desktop/Coding Projects/aylmer-madness/references/story/intro/` (already gitignored). Please download them yourself: I won't pull anything from anyone's Facebook.
   - The Ranger: a side view, plus any close-up (tailgate, badge, dashboard). Any year up to 2011.
   - 299 Chemin Fraser from the street.
   - Your mom.
   - One of each of Sayyad, Mike, Zahra, Russell, Abraham, Adam and Tyler: whoever you have.
   - One group shot of the gang.
   - Places, only if you have them: Principale, the beach or marina, the Saint-Jean bonfire, the Royal Ottawa.
   - The Ranger in the driveway at Fraser, from the street. A recent photo is fine.
2. **Dates.** For each photo, the real date or "summer 2005". It decides which ones get a date stamp.
3. **The song:** answered 29 Sept; see the music section of MAIN-STORY-PROPOSAL.md. Recommended: "Ahead by a Century". Tom supplies the audio file privately.
4. **The year:** 2004 (decided 29 Sept).
5. **Consent:** who has OK'd a public version. Until then, the public build uses the places-only cut.
