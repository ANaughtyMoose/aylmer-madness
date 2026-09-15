# Repair checkpoint — 15 September 2026

Checkout: C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\work\aylmer-madness
Branch: codex/aylmer-repairs. Original checkout untouched. Work remains in progress.

## Saved work
- Recovery prompt was committed and pushed FIRST (64361ef).
- Opus houses integrated as d1db6a1 and 0c577fa; source branch claude/glenwood-houses.
- Shared terrain triangulation, continuous residential sidewalks, sequential campaign, pause audio gate and mission briefing.
- Restrained pavement patches, cracks, manholes, worn paint and sidewalk joints.
- Cemetery perimeter offset from road corridors; requires further visual verification.
- Ranger roof bevels, rusty spare, anchored chain and bounded impulse-driven tire movement.

## Verification
- Full local runner: 50/51 suites passed. Story failure found a real missing next-story-beat hint; fixed lookup to use all definitions, gated by save progress. Targeted story rerun: 3156 passed, 0 failed. No other code changes since full run at this checkpoint except that fix.
- World: 22/22. Vertex sharing brings buffers below the original 340 MB ceiling (previous measurement 313 MB). Non-house triangle ceiling intentionally changed from 3.95M to 4.7M for newly continuous residential walks and shared surface subdivisions; memory ceiling unchanged.
- Topography mesh and physics height regression passed.
- Running game: Glenwood houses visible from Rue Glenwood with clear pavement and sidewalks; spare visible in bed.
- Running pause: master gain 0 with active siren, game time frozen, mission unchanged. Primary actions visible with mission artwork.
- Browser review harness: tools/repair-review.html, local server port 8136. Single iframe game keeps memory use down.

## Remaining before calling complete
1. Verify Saint-Paul/Fraser roads across slopes and junctions: latest cemetery camera showed an apparent road gap/grass strip near the vehicle; determine geometry vs streaming/camera state. Do NOT call this fixed until checked.
2. Verify fence placement and collisions, road props, truck chain close-up and bounce.
3. Add focused regression coverage for campaign sequence/legacy completion, spare bounds, shared surface overlays and cemetery setbacks.
4. Check pause restart/resume, eliminate remaining HUD counter behind pause, and verify next job is actionable after completion.
5. Save final visual evidence, update recovery notes, commit and batch push.

No main merge, deploy, tags or workflow changes. Repository public; only dynamic pages-build-deployment workflow is active. Check visibility/workflows before pushes; docs-only commits use [skip ci].
