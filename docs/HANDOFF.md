# Handoff — 2026-09-07, end of the Wave 2/3 session

Read this first, then `docs/PLAN.md` (the waves, the settled decisions, the
timeline), then `docs/VERIFY.md` (how to know a change worked). This file is
the state of the world at the moment the previous session ran out of context.

## Where `main` is

Everything below is merged and live at https://anaughtymoose.github.io/aylmer-madness/
(GitHub Pages redeploys ~2 min after a merge to `main`; `main` is protected,
merge with `gh pr merge N --merge --admin -R ANaughtyMoose/aylmer-madness`).

| PR | What |
|---|---|
| #5, #10 | Wave 1: heap 1057 → 148 MB, sector gating, the bridge "wall" (the river polygon), the 20-minute Safari proof |
| #7 | Traffic keeps its lane through bends (look-ahead pure pursuit; the offset sign was never wrong); the sub-stepped frame loop that ended the jitter at speed (it was temporal aliasing, not physics) |
| #11 | `tools/gltf2mesh.mjs`, `src/game/models.js` (loader, silent, **unwired**), 20 converted CC0 models in `assets/models/`, `models_lab.html`, `make_atlas.py --from` for real textures (`atlas.real.png`, not the live atlas) |
| #13 | Step 1, the first two minutes: Adam in Mayo, the poutine door, footpaths cost speed, buses leave tarmac, one modal at a time, one prompt slot, clean boot |
| #14 | Wave 2a, the spine: `calendar.js` (73 days, difficulty table, `PAY_LIFT`), `fuel.js`, the envelope + gauge on the HUD, refund on failed jobs, two endings via `StoryOpener` |
| #15, #18 | `assets/text/summer2004.json` (real Environment Canada days, wired to the date toast), `palette2004.json`, `tools/build_summer2004.py` |
| #16 | Wave 2b: a save per character (`tom.1` … `zahra.auto`, v2), the job in progress travels, the wallet lives in the slot |
| #19 | Wave 3a: `verbs.js` (follow / lose them / find / fragile / lift / drop-offs / raceTo), `verbjobs.js` (six jobs), `ambush.js` (the race that interrupts), `skills.js` (brake / corner / launch by use) |
| #20 | Start picker: the point list scrolls in its own column under the pinned GO bar |

31 smoke suites, all green on a quiet machine (`for t in tools/smoke*.mjs; do node "$t" …`).

## Running when the session ended — two agents, two worktrees, NOT pushed

1. **`wave/3-vehicles`** at `/Users/thomaslever/Desktop/Coding Projects/wt-wave3-vehicles` (Opus).
   Brief: Forester (Mike), Sienna (Abraham), Cavalier (Tyler), each character starts
   in their own car at their own house, Zahra on the Diamondback as a playable
   start, fuel tables, engine voices, tests, screenshots. **Addendum sent:** start
   points locked until a named job is done (table next to the start-point data,
   padlock rows, derived from `G.done`, `smoke_start.mjs`, two screenshots).
   Thomas saw the placeholder strip (Zahra/Mike as Ranger, Abraham as Sunfire)
   and called it wrong — this branch is the fix.
2. **`feat/cockpit`** at `/Users/thomaslever/Desktop/Coding Projects/wt-cockpit` (Opus).
   Brief: a fifth `C` camera `driver` with a 3D cockpit mesh in the engine's own
   flat-shaded language (NOT Gemini's photo plate), Gemini's
   `gemini-inbox/interiors/RANGER-HANDOFF.md` as the checklist (no rear-view mirror,
   misaligned white hood, black paddle mirrors with the spider web, blue MuVo on
   the bench, CHECK ENGINE, thumbtacked headliner), head dip on braking, idle
   shiver, radio low-pass in that view, `smoke_cockpit.mjs`, four screenshots.

**To finish either:** `cd` into the worktree, `git merge origin/main`, run all
suites, boot check per VERIFY.md, `git push -u origin <branch>`, `gh pr create`,
merge with `--admin`, then `git worktree remove --force <dir>`. If an agent is
still running when you arrive, its report lands as a task notification in the
old session only — look at the branch's `git log` and `git status` to see how
far it got. A clean tree with commits and screenshots in `docs/shots/` means
it finished; a dirty tree means it did not.

## Open decisions for Thomas

- **The second start click** (BACKLOG U9): keep or remove. Recommendation: remove.
- Whether the cockpit look is right once `feat/cockpit` lands (he wants to *feel*
  in the Ranger, consistent with the chase cam).

## Gemini (Antigravity) — what exists in `gemini-inbox/`, none of it committed except docs

- `assets/` — scouting pass, CC0 models/textures/sounds with licences; `src/` is gitignored (333 MB). The converter used it.
- `look/` — facades for 20 buildings (**good**, e.g. `facades/75-rue-denise-friend/front.png` is the 2004 olive/burgundy/green house), materials, surfaces, props, atmosphere. Cars, UI, FEEL.md, INTEGRATION.md and STATUS.md were never produced. Wave 5 input.
- `interiors/` — 15 vector plates drawn by a Python script (a diagram, not art) plus `RANGER-HANDOFF.md` with verified truck details. Use the details, not the plates.
- Prompts in `docs/GEMINI_*_PROMPT.md`. The calendar one is done and shipped.

## What is next (the plan's order)

1. Merge the two running branches (above). Then Thomas plays.
2. **Wave 3 leftovers:** the seven missing places (Russell's 1 Arial, Abraham's 841 Wilfrid-Lavigne, the Petro-Canada as a place, the British Hotel, Galeries de Hull, Byward Market, Museum of Civilization) and the 18-job `campaign.json` mapping to place keys; rivals in the four scripted races still use table speeds (`G.rivalFrac` is read only by the ambush); race courses cannot resume mid-race.
3. **Step 3 feel:** camera on kerbs/bumps, slope gravity (no g·sin(pitch) term in `cars.js`).
4. **Wave 5, the look:** wire the converted models (trees are baked into chunks — read `docs/MODELS.md` for the two ways round it), the real-texture atlas, the facades from `gemini-inbox/look/facades/` on the hero houses, then sky/tone/shadows GLSL ports. Re-measure the four-point memory after.
5. Wave 4: Russell's garage, avatar corrections, English Ottawa.
6. A Safari soak and a playtest with two friends before calling it shipped.

## Gotchas learned this session (add to VERIFY.md when convenient)

- `PAY_LIFT` and the difficulty scales are set on `G` by `calendar.startSummer`; node suites never start a summer, so their dollar amounts are unscaled. Do not apply pay scaling globally — it cost three suites once.
- `carById('dbike')` returns the **Ranger** (bikes are not in CARS). Test bike behaviour with `G.veh.baseSpec` (`twoWheel: true`), never via `carById`.
- The free-roam offer block in `updateMission` clears `hud.prompt` every tick; anything that owns the prompt (the ambush) must return early there (`if (G.ambush) …`).
- `grep` treats `src/game/story.js` as binary; use `grep -a` or Python.
- `tools/timers.mjs` fails silently when the repo path has a space (the `import.meta.url` guard).
- `tools/smoke_react.mjs` flakes on timing above load ~8; rerun on a quiet machine before believing it.
- The VERIFY duplicate-key grep is noisy now (lab pages, hangout's own scoped keys); compare against `main`, not against empty.
- The auto-mode classifier blocks `gh pr merge --admin`, `kill`/`pkill` and long chained commands unless these rules are allowed: `Bash(gh pr merge:*)`, `Bash(git push:*)`, `Bash(kill:*)`, `Bash(pkill:*)`.
- Ports used by this session's agents: 8151/8161/8171/8181/8191/8201/8211 (servers), 9222/9224/9226/9228/9230/9232 (Chrome). `tools/headless.mjs` honours `CDP_PORT`.
- Never more than three headless Chromes; above load 8 no timing number counts.

## When to start a new session

Now is fine: this file plus `docs/PLAN.md` and `docs/VERIFY.md` are the whole
state. The only things that live in the old session are the two agents' final
reports, and their branches on disk say the same thing. Start the new session in
`/Users/thomaslever/Desktop/Coding Projects/aylmer-madness` with: "Read
docs/HANDOFF.md, then finish the two running branches."
