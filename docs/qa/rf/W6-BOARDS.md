# W6-BOARDS report (branch rf/w6-boards, base fix/look-on-qr 813b1a7)

Stopped at the 11:56 AM PT hard stop. Started 11:45, so only the first item was done.

## Done
Step 1: St-Hubert and Jean Coutu boards (src/game/landmarks.js, MALL_SIGNS, marked [w6-boards]).
Node check (scratch script, nearest edge of OSM 68609502, point-in-polygon):
- St-Hubert: before 0.37 m INSIDE the mall wall, yaw GA_YAW (-0.2399) vs wall edge yaw -0.2796. After: (-102.86,-258.00), 0.15 m outside, yaw -0.2796.
- Jean Coutu: before 4.88 m off the wall (z -282.5 vs wall at about -287.4). After: (22.61,-287.21), 0.15 m outside, yaw -0.0806.
- Jean Coutu buff fascia panel in historicMall moved from z -282.8 to -287.4 so it sits on the wall with its board.

## Not done (where I stopped)
- Step 2: the Tim's (V3-04 Design 1) and Step 3: Saint-Paul (Design 2). Not started.
- npm test: started through qa-slot (AYLMER_QA_SLOTS=1), killed by my 330 s timeout with no output, so it was most likely still waiting for the slot. NOT verified green. Lead: run it before merging.
- Open: the St-Hubert board is 18 m wide but its wall edge is 10.5 m long (the wall bends at (-94,-260.7)); check in the cloud that the east end does not clip into the next edge. The St-Hubert fascia panels at z -258.8 (yaw 0) were not touched.
- Open: the lead-log search across Coding Projects was refused by the Saidbook guard (bulk search); I worked only inside this worktree.

## Browser checks for the lead (cloud)
- boot of both entries, 0 console errors.
- harness --only galeries (or the galeries_lot perf8 pose): both boards flush on the wall, no z-fight, St-Hubert east end not inside the wall.
- node tools/smoke_landmarks.mjs and tools/smoke_landmark_ground.mjs (boards moved, count unchanged, 8 vertices each).
