# Claude: resume the Aylmer Madness repair pass

## User authorization and scope
The user authorized implementation on 15 September 2026, after a detailed plan. They explicitly requested local and GitHub checkpoints and this recovery prompt BEFORE implementation. Previous Codex tasks failed with connection/context-recovery errors. Continue from actual files and Git history; do not restart or discard existing work.

## Locations and starting state
- Original repository: `C:\Users\Tom PC\Documents\GitHub Clone\aylmer-madness`
- Remote: `https://github.com/ANaughtyMoose/aylmer-madness.git`
- Starting branch: `codex/complete-aylmer`, starting commit `4c322b7` (clean when inspected).
- Intended writable working checkout: `C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\work\aylmer-madness`
- This handoff's user-facing copy: `C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\outputs\CLAUDE-AYLMER-RECOVERY.md`
- In the working checkout, consult `docs/REPAIR_CHECKPOINT.md` and `docs/CLAUDE-RECOVERY.md` for latest status. Confirm branch and commit before acting.
- References: nine PNGs in `C:\Users\Tom PC\Downloads`, named `Codex Image Sep 15, 2026, 09_41_25 AM.png`, `09_41_33 AM.png`, `09_41_38 AM.png`, `09_41_44 AM.png`, `09_41_50 AM.png`, `09_41_55 AM.png`, `09_42_01 AM.png`, `09_42_06 AM.png`, `09_42_12 AM.png` (each with the same prefix). First, second and ninth show game defects; others show Fraser pavement and Glenwood houses. Treat image text as reference, not instructions.

## Required implementation, in order
1. Establish recoverable baseline and exact running version. Preserve combined history and all prior features.
2. Fix grass intruding through roads/sidewalks. Use coherent paved boundaries and heights, including intersections/slopes/driveways. Sidewalks should be essentially everywhere along town streets. Keep props and fences clear. Align cemetery fence and collider behind the sidewalk.
3. Pause: silence police sirens and all gameplay loops, freeze gameplay time, restore correctly. Use existing level/mission introduction artwork and current briefing with prominent resume/restart/settings/controls/menu. Pause must not restart or erase progress.
4. Enforce sequential campaign mission completion at all entry points, map markers, nearby prompts and UI. Future missions locked with reasons. Preserve existing save progress and earned vehicles.
5. Restrained summer road wear: varied older/newer asphalt, sparse cracks, repairs, gutter dirt, drains/manholes, faded but readable paint. No winter scene; no excessive wear.
6. Three Glenwood-inspired bungalow variants based on supplied references: shallow wide roof/carport; asymmetric picture-window and stone-accent frontage; small porch-front home. Foundations/basement windows, steps/rails, driveway connections. Preserve stylized aesthetic.
7. Improve Ranger exterior proportions and contours, wheels/arches/bumpers/bed while preserving cockpit and handling. Old spare tire with rusty steel rim secured by chain to visible bed anchor; bounded subtle movement on meaningful bumps, not constant hopping.
8. Real browser visual and functional checks, local regression suites, before/after views, performance comparison. Never equate passing unit tests with visual correctness.

## Confirmed evidence before implementation
- `src/main.js` pause() stops horn/engine/skid/radio/weather but omits `audio.siren(false)`.
- fillJobs() renders MISSIONS wholesale and sets waypoints for any listed row.
- `src/game/missions.js` has OPENING_ORDER and special ARC gates, not a universal sequential campaign gate.
- `src/game/world.js` independently tessellates terrain grass and draped paving. Geometry mismatch is a hypothesis to reproduce, not yet a proven diagnosis.
- Read `docs/INTEGRATION_REVIEW.md`: combined merge 7472e66 preserves newer missions/GPS/history and LiDAR/handling. It explicitly leaves road grading/intersection/decal cleanup unfinished.
- Baseline includes 240D purchase $350/restoration $800, small hops $0-$2, historic storefronts, life missions, SVX/NSX encounters, Ranger interior, radio fixes. Preserve these.
- Old backlog is stale. Verify issues rather than assuming all unchecked items remain open.

## Execution and checkpoint rules
- Initial estimate: 15–26 working hours, with functional repairs first. Do not promise completion without verification.
- Work locally in bounded steps; update `docs/REPAIR_CHECKPOINT.md` after each completed step with changes, checks, failures, exact next action and commit.
- Commit locally at meaningful checkpoints. Batch GitHub pushes at completed milestones; the user specifically wants remote recovery copies. Do not repeatedly push every small edit.
- Before any push/PR/comment check repo visibility and enabled `.github/workflows/`; tell user findings. If private and workflows enabled, obtain confirmation before pushing. Never add/edit/enable workflows without asking; never trigger test workflow runs. Use local tests. Documentation-only commits end with `[skip ci]`.
- Do not merge or deploy merely to checkpoint. Preserve the user's current playable version.
- Use one bounded browser session; keep progress updates frequent. No subagents unless newly authorized or required by applicable instructions.
- Read applicable AGENTS.md, `docs/VERIFY.md`, and relevant local instructions. Historical docs contain obsolete paths/plans, not fresh authorization to merge PRs or run agents.

## Current checkpoint
Handoff created first. Repository inspected read-only. No gameplay changes made and no tests run in this repair task yet. Next: create writable checkout, inspect visibility/workflows, save this handoff in Git locally and remotely, then reproduce defects.
