# W6-FRICTIONS (wave 6, 20 Oct 2026)

Branch rf/w6-frictions from fix/look-on-qr at 813b1a7. Stopped at the 11:56 hard stop.

## What changed
1. Kerb scrub (src/game/cars.js, kerb block, marked [w6-frictions]). A fast kerb crossing (over 30 km/h) now scrubs 3.5 % of forward speed and 8 % of sideways speed at k=1 (was 9 % and 18 %). Cutting a corner over the sidewalk is two crossings: about 7 % lost at 50+ km/h instead of about 17 %. The slow thud (under 30 km/h) is unchanged, and the kick height (S3-RANGER) is unchanged.
2. Gravel road sound (src/core/audio.js, RoadDriver.step, marked [w6-frictions]). On loose ground (surface grit over 0.6: gravel, sand, dirt, path) the grit crunch follows speed^0.7 instead of speed^1.3, so the gravel shake from feel.js (fires above 20 km/h) has a crunch under it. At 40 km/h on gravel the crunch gain is about 2x (0.44 vs 0.22 of full); at 130 km/h it is the same. Asphalt, concrete and grass are untouched. No main.js edit.

## Checks
- npm test through qa-slot (AYLMER_QA_SLOTS=1): started at about 11:48, still queued or running at the 11:56 stop. Finished after the stop (12:09): 104/104 suites passed, exit 0 (wall-clock budgets skipped as usual). To rerun: `AYLMER_QA_SLOTS=1 zsh ".../references/review/qa-slot.sh" npm test` in this worktree (node_modules is a symlink to wt-qr-look's, not committed).
- Risk: tools/smoke_audio.mjs or the audition might pin grit levels on gravel; tools/smoke_handling.mjs might pin speed after a kerb. If either fails, read which number moved; do not loosen the test, tell me or retune.

## Browser checks for the lead (cloud)
- `--only course` and the speed beat on the Ranger: corner cut over the sidewalk at 60 km/h should exit faster than the same corner taken on the road with braking. Bar: exit speed of the cut >= exit speed of the road line.
- Audio audition (src/core/audition.js, 5.6 s gravel at 70 km/h): gravel crunch audible, no clipping on master (peak under the existing audition limit).
- Boot of both entries, 0 console errors.

## Open
- Not measured: actual exit-speed numbers before/after (no browser allowed). Numbers above are from the formulas.
