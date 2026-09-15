# Repair checkpoint — 15 September 2026

Working checkout: `C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\work\aylmer-madness`
Branch: `codex/aylmer-repairs`. Original checkout is untouched.

## Saved and integrated
- Recovery instructions committed and pushed first: 64361ef.
- Opus Glenwood commits c6943589/d070a466 cherry-picked as d1db6a1/0c577fa.
- User supplied Opus handoff; preview tested by Opus, real-game check still pending.

## Implementation in progress — NOT release-ready
- Shared terrain surface clipper `src/game/surface.js`; world lawn, landuse, roads, sidewalks, markings and junction decks now use it. Prevents independently tessellated ground covers from crossing.
- Two-sided residential sidewalks enabled. Sidewalk curb geometry optimized to two longitudinal faces.
- Sequential mission availability: first unfinished campaign mission, with existing story beats inserted when earned. Completed jobs replayable; modes/encounters remain separate. Applied to start, nearby prompts, maps, markers and story hints.
- Pause master audio gate added, with volume changes respecting pause. Briefing artwork, current objective, collapsible locked/completed lists and restart action added.

## Checks so far
- JavaScript syntax passes for main/world after edits.
- Running browser started a fresh Tom game and alternator mission; pause opens and keeps all primary actions on screen.
- Latest full-world smoke: 20/22 checks pass. Remaining failures: non-house geometry 4,441,725 triangles against 3,950,000 budget; vertex buffers 370 MB against 340 MB. Do not claim these tests pass or loosen them casually: user's machine was short of memory during Opus work. Optimize further.
- Pause artwork CSS ordering corrected after browser check; needs reload/verification.
- Original baseline tests have not been rerun in this task; historical report says 49 suites passed.
- Local server started on port 8136 (Node tools/serve.mjs), verify it is still alive before use.

## Next actions
1. Complete surface optimization and numerical overlap/physics tests. Verify actual Fraser/cemetery/Glenwood streets.
2. Locate cemetery fencing: current world source only explicitly mentions Galeries fence. Do not invent a confirmed cause; inspect running scene and map data. Check roadside obstacles broadly.
3. Test mission sequence, legacy saves and paused audio/resume/restart in browser.
4. Add restrained road wear and truck/spare improvements.
5. Run local regression suites serially, capture visual evidence, finish verification and push a completed milestone.

No main merge, deployment, workflow edits, CI dispatches or tags. Public repo has only dynamic Pages workflow. Repair branch checkpoints are authorized; batch pushes and check visibility/workflows before each.
