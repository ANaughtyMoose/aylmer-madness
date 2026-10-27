# W7-DASHES: no em or en dash in player text

Branch rf/w7-dashes, worktree wt-rf-w7-dashes, from fix/look-on-qr at 082a4df.

## What changed

Tom's rule: no em dash (U+2014) or en dash (U+2013) in anything a player reads. Every one in the two scopes is gone, replaced by what reads naturally in that line. Comments in src were left alone.

- assets/text: 153 dashes across 8 files (houses, materials, places, campaign, story, grisha, radio_extra, streetview), plus 2 written as `\u2014` escapes in places.json that a text grep misses.
  - Confidence notes (houses, materials, places): « Haute : ... ».
  - Story and cast lines: a colon, a comma, « ... » or a new sentence, line by line. Grisha: « Pas su' l'aile. Su' le BIDON. », « Elle fume encore un peu... c'est un diesel, pas une théière. », « Je sacre pas. Je NOMME les choses. ». Radio English lines: « right now. Watch for... », « Whoops, losing you... ».
  - The streetview.json `_note` is a builder note (an underscore key), left as is.
- src string literals: 241 literal or template chunks across 45 files, plus 13 written as `\u2014` escapes or `&mdash;` / `&ndash;` entities (main.js, kijiji.js, economy.js).
  - Key prompts follow the lead's style: `E : prendre le char`, `U  :  ...`, `K  :  Kijiji`.
  - Mission titles: « Spot 1/5 : le phare de la marina », « Ramasse Sayyad, 75 Denise-Friend ». Hints: a period and a new sentence or a comma.
  - Placeholders for "no value" (a lone em dash in hud, save, modes, economy, kijiji, plus index.html #carname and the fuel `<dash> L`) are now `-`.
  - The race countdown (3 between two em dashes) is now `3...`. `1<en dash>4` in the modes footer is now `1 à 4`, and `Freinage 100<en dash>0` is now `Freinage 100 à 0`.
  - Radio now shows "artist - title" (spaced hyphen, the usual track format).
  - Heckle glossary notes (English): parentheses for the inline glosses, e.g. « “malade” (sick) means dangerous here ».
  - Console and lab messages with a dash got a colon or comma. The smoke covers every literal, so the rule is simple.
  - main.js: a CSS comment inside the shell skin template string had a dash. It is in a string literal, so it changed to a semicolon.
  - Real minus signs (U+2212) and hyphens are untouched.
- hull_mapdata.js (generated from OSM): « Hull-Chelsea-Wakefield », « Holiday Inn Gatineau-Ottawa », « Parc D'Arcy-McGee-Symmes ». tools/build_hull.py now turns any em or en dash in the OSM output into a hyphen, so a rebuild does not bring them back.
- garage.html title: « Aylmer Madness: garage ».

## Smokes

- Same check, new text: smoke_repair (4 strings), smoke_hangout (`/^E {2}:/`), smoke_story (`/^E : prendre la Civic de Sayyad/`), smoke_shell (`PUB : `, `LE DROIT : `, track includes ` - `).
- tools/lang-allowlist.json: no entry contained a dash, so no entry text changed. The count stays at 62.
- New tools/smoke_no_dashes.mjs, which uses a small JS tokenizer:
  1. Every string value and key in assets/text/*.json (keys starting with `_` skipped) must be dash-free.
  2. Every string literal and template chunk in src/**/*.js and *.mjs must be dash-free, and also free of `\u2013`/`\u2014` escapes and `&mdash;`/`&ndash;`/numeric entities. Comments and regex literals are skipped.
  3. A self-test proves the scanner finds string, nested template, template tail, escape and entity, and skips comments, regex and a minus sign.
  - Its first VM run caught the 2 escaped dashes in places.json, and the escaped and entity cases were fixed after that.

## Checks

- Targeted VM run on 4e4f068: the new smoke was RED only on places.json escapes (fixed in cc220f7). smoke_repair, smoke_hangout, smoke_story, smoke_shell, smoke_lang, smoke_retry, smoke_verbs and smoke_canon were green.
- Full suite on cc220f7 (VM): 116/118, ct: RESULT GREEN. The two failures are smoke_audio and smoke_models, which fail on the VM for VM-only reasons and count as green. The lead reruns them on the Mac.

## Not covered (outside the two scopes, for the lead)

- src/game/*_lab.html (houses, glenwood, models, ottawa labs) still have dashes. These are developer pages.
- style.css has 4 (probably comments or `content:`, not checked) and index.html line 179 is a comment.
- tools/smoke.mjs uses a fixture holdText 'E <em dash> acheter' that it passes in itself. It is test input, not game text, and was left alone.

## Cloud checks for the lead

- Glance at the HUD with no car (#carname shows `-`), the fuel gauge before first update (`- L`), a race countdown (`3...`) and the Kijiji page header, to confirm the new placeholders read well.

## Where I stopped

Done. Code head cc220f7 is tested GREEN. Only this report was committed after it.
