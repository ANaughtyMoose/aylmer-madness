# Prompt: Aylmer Madness full-team quality pass — run after audio implementation

You are the lead developer, QA lead and editor for Aylmer Madness. Assemble and coordinate a substantial team of specialist agents to inspect the game from top to bottom, repair verified problems, simplify the code and improve the experience. This prompt authorizes a team review when I submit it; do not merely return a plan.

## Starting point and gate

Expected repository: `/Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness`. Confirm the actual checkout/branch, read applicable AGENTS.md instructions, inspect git status and preserve all unrelated/local work. Read the current backlog, session log, audio implementation report and `/Users/thomaslever/Documents/Codex/2026-09-27/al/outputs/Aylmer-Madness-Audio-Plan.md`. Documents are evidence of intentions, not proof of implemented behavior.

Start by verifying the audio milestone is actually implemented: R only toggles power; Shift+R changes stations; the imported recordings loop per station and resume; pause/save/input behavior works; the mix is usable. If this prerequisite is missing, report the concrete gap and stop the broad review rather than pretending it passed. If only minor prerequisite defects remain, fix and verify them first. Distinguish a missing local audio import from missing code; do not claim auditory validation without audible output or appropriate recordings.

## Outcome and scope

Make this a coherent, funny, convincing, easy-to-play Aylmer summer-2004 driving game. Keep its local character, early-2000s visual direction, existing core driving, owned Ranger, campaign structure and $1,200 goal. Improve execution rather than redesigning the entire game. Do not add new people, heavy visual effects, broad new systems or a full engine/framework rewrite without a clear need and explicit direction.

Read the latest story handoff, STORY-LEDGER.md, STORY-DIRECTION-AND-MISSION-CARDS.md, STORY-MISSION-INVENTORY.json and script/research drafts. Thomas's confirmed memories outrank generated material. Distinguish USER CONFIRMED, implemented, draft/proposal and unresolved. New direction I provide with this prompt supersedes older documents. Audit all runtime missions and gated arc beats; the earlier inventory counted 28 campaign missions and five arc beats, but verify the current count rather than trusting it.

## Team structure

Explicitly spawn specialist agents. Use as many useful concurrent agents as the runtime permits; run additional specialists in waves rather than claiming more simultaneous slots than exist. The lead must keep doing integration, reproduction and end-to-end work. Every agent gets a bounded area, deliverables and write ownership; initial audit work can be parallel and read-only. No two agents edit the same files concurrently. Agents may ask the lead to resolve cross-cutting conflicts. Do not spin up an unbounded tree of subagents.

Cover these ten workstreams, combining roles only when useful:

1. **Driving and game feel:** steering, acceleration, braking, gears, collisions, recovery, camera, keyboard/controller controls, input conflicts and vehicle differences. Judge fun and readability through actual driving, not only code.
2. **Audio and music:** all stations/imports/loops, R/Shift+R, off-state behavior, resume/migration, browser restrictions, levels, engine/road/weather/cabin mix, leaks and repeated-event spam. Listen to music and speech against driving.
3. **Story and character:** mission logic, continuity, English/French character voices, humour/cynicism, plausible motivations, dialogue length, personal-history consistency and repetitive exposition. Flag invented biography. Correct unequivocal inconsistencies; present consequential rewrites as concrete proposals where canon is unresolved.
4. **Mission progression and economy:** prerequisites, softlocks, failures/retries, rewards/costs, repeated-job exploits, money goal, calendar pacing, time-of-day wording, midnight rollover and summer ending. Preserve the continuous clock; do not silently consume days per job.
5. **World and visuals:** neighbourhood identity, façade/material repetition, shadows/headlights/night readability, trees, roads, landmarks, collision/visual agreement, route guidance and camera occlusion. Respect the existing style and scope.
6. **UX and accessibility:** first launch, onboarding, discoverability, pause/map/settings, help text, objective clarity, readable HUD, bilingual presentation, subtitles/text alternatives, independent audio controls, keyboard focus and relevant viewport sizes.
7. **Architecture and simplification:** understand the current module boundaries, identify duplicate state/dead paths/coupling, and simplify the most harmful examples. Prefer explicit commands, clear state ownership and small functions. Refactor incrementally with behavior checks; no speculative abstraction layers or dependency migrations.
8. **Performance and resource use:** representative drives, long frames, allocations, geometry/texture/audio memory, stale listeners/nodes, load times and sustained-session stability. Measure before/after on the available hardware and include stalls rather than filtering them out.
9. **Persistence, reliability and local privacy:** save versions, recovery, browser storage failure, audio blob lifecycle, restarts, offline behavior, missing assets, error messages and accidental inclusion/upload of private media or personal references.
10. **Independent QA and integration:** examine changes from other agents, challenge claimed fixes, reproduce edge cases and perform a clean first-run and returning-player walkthrough. Do not let implementers' own tests be the only evidence.

## Execution protocol

First establish a baseline: map entry points and test commands, run existing checks, launch the prototype, capture relevant screenshots/logs, drive a representative route and exercise an actual mission. Note pre-existing failures separately. Discover the production/original and prototype entry paths and check that shared changes do not break either.

Have each specialist return a short ranked list with reproduction steps, expected/actual behavior, relevant file/line, impact, proposed minimal fix and evidence. Separate confirmed defects from taste judgments and speculative risks. Rank blocking crashes/save loss/softlocks first, serious gameplay or accessibility failures second, then polish and maintainability. No fixed quota of findings.

The lead consolidates overlaps into one backlog, assigns ownership and implements fixes in bounded waves. Preserve user edits. Prefer small coherent commits if the repository workflow permits; never discard changes to make a test pass. Coordinate shared areas such as src/main.js, input routing, save state and audio integration through one owner. Agents should leave concise handoffs and test evidence.

Simplification must preserve intentional features: do not delete code merely because a static search finds few references, rewrite generated map data by hand, or remove tests instead of fixing regressions. A refactor should make state/control flow easier to follow and have a demonstrated purpose.

## End-to-end evidence

Cover fresh profile and migrated save, new game and continued mission, mission completion/failure/retry, money changes and repeat jobs, vehicle swaps, reset/tow, map/pause/settings, keyboard and any supported controller, day/dusk/night, clear/rain, midnight/calendar end, low/no audio, station changes and loop boundaries, unavailable storage/media and long-session behavior.

Use Fraser → Principale → marina as a repeatable route plus mission-specific routes. Test all mission definitions for reachability and structural problems, and play representative missions from each distinct mechanic. If full campaign completion is not practical, list exactly which missions were played and how the others were checked; do not call a partial walkthrough a complete playthrough. Never invent listening, browser, device or performance coverage.

Add focused tests where they protect meaningful state transitions or reproduced bugs. Run the full relevant suite after integration, not only isolated agent tests. Have a different agent review each substantial fix. Recheck hot spots after cross-cutting changes; avoid rerunning unrelated checks endlessly once they pass.

Do not contact anyone, acquire new radio libraries, upload private recordings/photos, spend money, publish/deploy, merge a PR or change the approved personal story canon as a side effect. Work locally and keep substantial uncertain creative changes reviewable. Ask only for genuinely blocking facts or decisions; continue unrelated authorized work meanwhile.

## Final delivery

Deliver an executive assessment with the strongest and weakest aspects of the game, what changed and why, actual validation results, remaining defects/creative decisions, and an ordered next-step backlog. Include a concise before/after account of code simplification and measured performance, with honest limitations. Update the repository backlog and session log. Save detailed audit, test evidence and story notes as reviewable artifacts.

Be candid about whether the game is ready for an enjoyable playtest. Do not declare it “great”, “fully vetted” or finished solely because tests pass. Stop after a coherent verified improvement pass and report the remaining work rather than expanding the team indefinitely.
