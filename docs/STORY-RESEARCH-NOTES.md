# Story research notes (21 September 2026)

Three Opus research passes, requested by Thomas. Sourced claims only; each agent listed what it could not verify. Numbers marked "inference" are the agent's, not industry canon. Companion to STORY-LEDGER.md.

## A. In-motion text dialogue: rule sheet

| Rule | Value | Basis |
|---|---|---|
| Bubble length | ≤12 words, ≤70 chars, one line preferred, never more than two | BBC subtitle guidelines (37 chars/line, ~3 words/s) plus a 2 s glance budget (NHTSA driver-distraction guideline). Applying it to a game HUD is inference |
| On-screen time | 0.3 s per word + 1 s floor, clamped 2.5 to 5 s | BBC minimum-duration rule; clamp is inference |
| Spacing | ≥6 s between bubbles in transit; ≤6 bubbles per minute | inference from 12 s cumulative glance budget |
| Long speeches (Mike only) | chain short lines; each line re-checks world state before the next fires, so the speech aborts on its own when conditions change | Ruskin, Valve, GDC 2012 |
| Which line wins | most matching conditions wins; generic line is the fallback | Ruskin 2012; Firewatch GDC 2017 independently |
| Anti-repeat | stamp an expiry on a played line so two beats of a running gag never land close together; don't repeat until the eligible pool is spent | Ruskin 2012; Hades (Kerr breakdown) |
| Priority | fail/state change > navigation > critical story beat > event bark > idle banter > radio | inference |
| Radio duck | ~6 to 9 dB under a bubble, fast down, slower up; never duck for idle banter | standard sidechain practice; no published GTA/Forza figure found |
| Triggers | event and location, not timers | Firewatch, Oxenfree, Wheels of Aurelia |
| Variants | 6 to 10 for any bark that can fire more than twice a session | Zach Johnson, West of Loathing, GDC 2018 |
| Punchline | last word of the bubble; type-on reveal makes timed jokes land | Tom Francis, Tactical Breach Wizards; inference |

## B. Distinct voices: one private question per character

Same event, different noticing. Proposed questions (PROPOSAL, from confirmed traits):

- Margaret: what is he not telling me?
- Sayyad: what is the newest version of this?
- Zahra: which animal is this person, and do I say so?
- Russell: what is broken here, and what do you owe me for fixing it?
- Mike: what is the theory?
- Adam: unknown until Thomas gives a trait.

Bark slots worth a per-character pool: gets in, leaving the driveway, en-route idle, landmark passed, radio reaction, player error, stall, waiting, lost, near destination, gets out (success and failure), callback to a named earlier job.

Comedy rules: don't set out to be funny (Vanaman, GDC 2010); straight man against a mad world, never two mad at once (Wolpaw, Portal); one non-cynical register per friend (Mikkelson); joke on the free line after the critical line, never on it.

## C. English and French on the HUD

1. Anything the player must act on within two seconds is in the language they read.
2. French in three slots only: fixed interjections, proper nouns and signage, one personal tic per character. One short phrase per bubble.
3. Mark the speaker with the name tag, not italics.
4. Gloss by context, never by parenthetical.
5. Untranslated French lives in the radio, signage and ambient world.
6. English speakers written fully in English; unmotivated code-switching reads as localisation debris.

## D. Storytelling techniques that fit 28 fixed missions

1. Every bubble is a fragment of a conversation already in progress; never open with setup (Mikkelson).
2. Condition-checked line pools, not branches; selection carries the reactivity (Hades, Kasavin).
3. Branch for character, not consequence: two flavours of the same yes (Cannon, GDC 2024).
4. Tag each mission's writing with a tone colour and avoid three of the same in a row (Road 96).
5. One callback slot per mission that names an earlier job (Road 96).
6. The truck's visible state is the story ledger: gouges, junk in the bed (Unpacking).
7. Passenger lines vary with how rough the driving was (Jalopy).
8. Lines fire off map landmarks; driving never pauses (Wheels of Aurelia).
9. Hard length cap; understatement; sometimes the answer is "OK." (Firewatch, A Short Hike, Night in the Woods).
10. A repeating template per mission (brief, one mid-drive bubble, completion toast) so rhythm does the work; 84 authored lines total (Tactical Breach Wizards).

Pitfalls: exposition in briefs; barks that repeat until players mod them out (Burnout Paradise's DJ, community reception only); setting out to be funny; cutting the dark humour real life had (That Dragon, Cancer); restorative nostalgia (brand checklists) vs reflective nostalgia (specific, unflattering detail) (Garda; NORCO).

Running gag economics (gas money never covers the gas): plant it straight in mission 1 with no joke (Schafer); host it in the completion toast, which already fires every mission, with the number as the variable (Francis); rotate who delivers it; spend exactly one reversal where someone overpays and Tom gets suspicious.

## E. Static art and picture-in-picture

Screen set, in priority order: mission briefing card (real person, real corner, one imperative, one joke); chapter card (date slug, one first-person line, 3 to 5 s); unique loading portrait per mission (2.5 s floor); end-of-mission photo card filed into an album (Firewatch camera, Season scrapbook); ending sequence of one portrait card per friend then the truck (Max Payne panels). Cut the radio-ident strip and loading tips first if quality slips. NFS Underground 2's static cards failed because they were generic (GameSpot).

Six inserts, all 2D overlays, no second camera:

1. Passenger reaction insert, bottom-left, 2 to 3 s (errands, follow Sayyad).
2. Couch impact freeze: grab the framebuffer, freeze, zoom, panel border, snap back (divan). Burnout takedown precedent.
3. Sayyad's window lights up as an illustrated panel on the third doughnut (sayyad).
4. Convoy roster strip of three driver portraits dimming as cars fall behind (arcveillee). No sourced precedent; invention.
5. Photo-finish snapshot into a bordered print with caption (races).
6. Then/now dissolve: the real 2004 photo of each corner fades up in a framed inset on the final slow lap of Principale (arcdernier). Highest payoff, cheapest.

Photo-to-illustration pipeline: Max Payne route (photos of friends and family, then filters, not repainting). One approved reference sheet per person from the best two or three photos before any card; never generate a card from a previous card; attach the sheet plus one approved hero card every time; byte-identical style block in every prompt; batch by person, not by mission; fallback is posterise plus levels plus halftone over the real photo.

Risks: likeness and consent (get each friend's sign-off on their own cards; Quebec image-privacy regime); drift across 30+ cards; uncanny valley if output drifts toward realism; real logos and trade dress; static cards carrying more than they can.

Not verified by the agents: Stephen Bliss's process at Rockstar; Midtown Madness 2 briefing text; any Rockstar statement on in-car dialogue craft; NFSU2's production method; Forza Horizon rival PiP.

## F. Sources

Dialogue and barks
- Ewing & Armstrong, Do You Copy? Firewatch dialog system, GDC 2017: https://www.gdcvault.com/play/1024415/Do-You-Copy-Dialog-System
- Ruskin, AI-Driven Dynamic Dialog, Valve, GDC 2012: https://cdn.akamai.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf
- Gregory, A Context-Aware Character Dialog System, Naughty Dog, GDC 2014: https://www.gdcvault.com/play/1020386/A-Context-Aware-Character-Dialog
- Kasavin & Korb, The Dialogue of Hades, GDC 2021: https://www.gdcvault.com/play/1026975/Breathing-Life-into-Greek-Myth
- Kerr, How the dialogue system in Hades rewards failure: https://www.christi-kerr.com/post/how-the-dialogue-system-in-hades-rewards-failure
- Oxenfree walk-and-talk: https://www.gamedeveloper.com/design/how-i-oxenfree-i-s-narrative-unfolds-like-a-free-flowing-conversation
- Mikkelson, Adding Life To Worlds With Dialogue Barks: https://www.gamedeveloper.com/design/adding-life-to-worlds-with-dialogue-barks
- Johnson, There's Goofs in Them Thar Hills, GDC 2018: https://www.gdcvault.com/browse/gdc-18/play/1025010/There-s-Goofs-in-Them
- Wolpaw on Portal comedy: https://www.giantbomb.com/articles/so-heres-something-pretentious-anecdotes-and-thoug/1100-3148/
- GDC 2010 Comedy in Games panel: https://www.avclub.com/avc-at-gdc-10-the-comedy-in-games-panel-1798219354
- BBC subtitle numbers via Clevercast: https://www.clevercast.com/bbc-subtitling-guidelines/
- NHTSA driver distraction guidelines: https://www.federalregister.gov/documents/2013/04/26/2013-09883/visual-manual-nhtsa-driver-distraction-guidelines-for-in-vehicle-electronic-devices
- Venba language rendering: https://www.digitaltrends.com/gaming/venba-review-nintendo-switch/
- Kôna, joual dialogue: https://cmf-fmc.ca/now-next/articles/kona-has-you-conduct-an-investigation-in-the-1970s-northern-quebec/

Storytelling in errands
- Cannon, Branching on a Budget, GDC 2024: https://www.gamedeveloper.com/design/how-to-build-branching-narrative-when-you-don-t-have-a-big-budget-
- Road 96 narrative system: https://www.gamedeveloper.com/design/road-96-the-narrative-system-history-of-the-development-and-inspirations
- Unpacking, 1,000 household items: https://www.gamedeveloper.com/marketing/unpacking-a-narrative-through-1-000-household-items
- Jalopy, Pryjmachuk: https://www.vice.com/en/article/jalopy-is-a-game-examining-the-fall-of-communism-in-europe-from-a-uniquely-personal-perspective/
- Wheels of Aurelia design: https://www.gamedeveloper.com/design/interactive-fiction-meets-arcade-racer-designing-i-wheels-of-aurelia-i-
- Firewatch radio relationships: https://gamesbeat.com/crafting-relationships-through-radio-in-firewatch/
- A Short Hike postmortem: https://www.gamedeveloper.com/design/video-a-postmortem-look-at-the-making-of-i-a-short-hike-i-
- Night in the Woods postmortem: https://www.gamedeveloper.com/design/video-nuke-possum-springs---a-i-night-in-the-woods-i-postmortem
- Francis, Tactical Breach Wizards comedic cheat sheet: https://www.gamedeveloper.com/design/the-comedic-cheat-sheet-that-helped-build-tactical-breach-wizard
- Hades narrative rewards: https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death
- Garda, Nostalgia in Retro Game Design: https://www.academia.edu/4249396/Nostalgia_in_retro_game_design
- NORCO creator Q&A: https://www.wwno.org/coastal-desk/2022-04-01/q-a-with-the-creator-of-norco-a-transformative-point-and-click-game-exploring-the-south
- That Dragon, Cancer (cut dark humour): https://en.wikipedia.org/wiki/That_Dragon,_Cancer

Static art and inserts
- Making Max Payne (photo shoots, filters): https://gameinformer.com/b/features/archive/2016/03/27/making-max-payne-how-hong-kong-kung-fu-and-family-photo-shoots-built-a-noir-thriller.aspx
- NFS Underground 2 review, static cards: https://www.gamespot.com/reviews/need-for-speed-underground-2-review/1900-6113361/
- Burnout 3 takedown camera: https://www.gamespot.com/reviews/burnout-3-takedown-review/1900-6106827/
- Firewatch camera prints: https://www.pcgamesn.com/firewatch/firewatch-s-disposable-camera-can-be-used-to-print-real-life-photos
- Season scrapbook: https://adventuregamehotspot.com/review/556/season-a-letter-to-the-future
- Ethan Carter photogrammetry: https://www.theastronauts.com/2014/03/visual-revolution-vanishing-ethan-carter/
- Lake, small-town Oregon: https://www.wweek.com/technology/2021/05/05/how-did-game-designers-from-the-netherlands-capture-the-look-and-feel-of-small-town-oregon-better-than-any-other-video-game/
- Umurangi Generation: https://www.gamedeveloper.com/design/using-photography-to-document-the-end-of-the-world-in-i-umurangi-generation-i-
- Right of publicity and AI likeness: https://www.congress.gov/crs-product/LSB11052
- Stephen Bliss (no process detail): https://www.gtabase.com/news/interview-with-stephen-bliss-ex-senior-artist-at-rockstar-games-the-legend
