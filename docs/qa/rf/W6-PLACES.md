# W6-PLACES report (stopped at the 11:56 PT hard stop)

Branch rf/w6-places, base fix/look-on-qr 813b1a7. Worktree /Users/thomaslever/Desktop/Coding Projects/wt-rf-w6-places.
Started 11:45 PT, so only 11 minutes of work time.

## Done
1. Super C panel on the Principale pylon (Tom 14 Oct, overrides the spec's "No pylon"). src/game/landmarks.js MALL_SIGNS: a new red (#b42e29) 'Super C' board at the pylon's x -130, z -175, w 7, h 1.6, y 7, stacked flush on top of the CINÉMA / BILLARD · SAQ board (y 2 to 7). Block marked [w6-places]. No main.js edits.

## Not done (where the next builder starts)
2. Grande-Rivière track and football field (Tom 14 Oct: draw both). Spec section 3 (landcover.js, LINED_SCHOOLS) not started. School area x -738 to -514, z -1343 to -977 per spec; needs a node smoke that the track and field footprints clear roads and building 68609168.
3. Super C fascia, Galeries name board, Grande-Rivière wall sign (spec signs list) not started.
4. Modern-name list smoke not started.

## Checks
- npm test through qa-slot (AYLMER_QA_SLOTS=1): did not finish inside a 6 min timeout (no output; most likely waiting for the slot). NOT verified green. The lead must run npm test before merging.
- No node smoke for the pylon panel: it reuses the existing pylon position, so no new footprint vs road question, but the panel's top (8.6 m) was not checked against anything overhead.

## Browser checks for the lead (cloud)
- boot of both entries, 0 console errors.
- Look at the pylon from Principale near x -130, z -160 in chase cam at 50 km/h: Super C reads, panel sits on the CINÉMA board with no gap or z-fight, no new frame cost (perf.mjs default display air, GPU+CPU p95 unchanged).

## For the lead to decide
- Whether the pylon should carry Super C on top (done here) or as a lower tier; Tom said only "put the Super C panel on the pylon".
