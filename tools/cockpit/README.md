# Aylmer cockpit

A local dashboard for developing Aylmer Madness: the decisions waiting on Tom,
where the roadmap and the visual wave stand, what every worktree is doing, test
results, look reviews, local servers and a recent activity timeline. No
dependencies, plain Node.

## Run it

```
node tools/cockpit/server.mjs          # http://localhost:8170
node tools/cockpit/server.mjs 8180     # another port
```

It binds to 127.0.0.1 only, rejects other Host headers and cross-site requests,
and never opens a browser. The page refreshes itself every 20 s without losing
what you are typing. Keys: `1` to `7` jump to a section, `r` refreshes, `t`
switches light and dark.

## Decisions (section 01, "Tom to decide")

Each decision in `docs/roadmap.json` `decisions[]` can carry:

```
{ "id": "D8", "aliases": ["T3"], "question": "...", "status": "open" | "answered" | "decided-by-claude",
  "priority": 2, "blocking": ["P0.1", "V0-01"], "why_it_matters": "...", "context": "short, `code` and **bold** allowed",
  "options": [{ "label": "...", "pros": "...", "cons": "..." }], "recommendation": "<an option label>",
  "confidence": "high" | "medium" | "low",
  "evidence": [{ "label": "...", "href": "/doc/<worktree>/docs/X.md" }, { "label": "...", "image": "references/places/..." },
               { "label": "...", "image": "docs/shots/x.png", "worktree": "wt-algonquin-qr" }, { "label": "...", "place": "british-hotel", "match": "strip" }],
  "fields": [{ "id": "colour", "label": "...", "choices": ["A", "B"], "placeholder": "..." }],
  "watch": { "dir": "references/places/_feedback/lookfix-qr/dentist" },
  "places": ["299-chemin-fraser"],
  "answer": null, "answered_by": null, "answered_at": null, "rationale": null }
```

Only `id`, `question` and `status` are required; older entries still work.
- `open` decisions show as cards, ordered by `priority`. Option buttons answer in one
  click (with an Undo in the toast), the text box saves a free answer or a note,
  and "Decide for me" accepts the recommendation.
- `fields` makes a card of small answers; each can be saved on its own, and the
  card closes when all are filled.
- `watch` keeps a card "coming" until files land in that folder, then lists them.
- `places` ties an answered decision to look review places, so their "Ask Tom"
  notes show Tom's answer instead.
- `decided-by-claude` decisions are listed with their `rationale` and an Overrule
  button, which reopens them.

How an answer flows: `POST /api/decide` (JSON body, `x-cockpit: 1`, same origin,
the same checks as running tests) sets `status: "answered"`, `answer`,
`answered_by: "Tom"`, `answered_at` in `docs/roadmap.json` (only the decisions
array is rewritten, atomically, keeping anyone else's edits to the file),
appends the change to `state/decisions.json` (append-only) and logs a
`decision` line to the activity feed. Agents read answers from `roadmap.json`.
Reopening keeps the earlier answer under `previous`.

Set `COCKPIT_BASE` to compare worktrees against another ref (default
`refs/remotes/codexwork/quality-review`). For a test instance that must not
touch the real files, point `COCKPIT_ROADMAP` at a copy of `roadmap.json` and
`COCKPIT_STATE` at a scratch folder.

## Log what you are doing (agents and Claude)

```
node tools/cockpit/log.mjs "Started British Hotel door fix" --who=Claude --kind=start
node tools/cockpit/log.mjs "Door fix done, shots in lookfix-qr" --who=Claude --kind=finish
node tools/cockpit/log.mjs "Blocked: need a rear photo of the Arial garage" --who=Codex --kind=blocked
```

Each call appends one JSON line to `tools/cockpit/state/activity.jsonl`:

```
{"ts":"2026-10-06T14:02:11.000Z","who":"Claude","worktree":"wt-qr-look","text":"...","kind":"start"}
```

- `kind` is one of `start`, `finish`, `blocked`, `note`, `decision` (default `note`).
- `worktree` defaults to the git top level of the current directory; override with `--worktree=NAME`.
- `who` defaults to `$COCKPIT_WHO`, then `$USER`.
- Text is capped at 400 characters. Writing the file directly is fine as long as each line is one JSON object.

## Endpoints

JSON, computed live. Worktrees, look and activity are cached for 15 s and
servers for 5 s; after that the old answer is served at once while a fresh one
is built, so no request waits on git or `lsof`. A JSON file caught mid-write is
retried, then the last good copy is shown with a note.

| Path | What |
|---|---|
| `/api/roadmap` | `docs/roadmap.json` from this worktree or the main checkout, whichever is newer. Falls back to `fixtures/roadmap.sample.json` with `sample: true`. Loops get a `lastRun` from the newest of their `outputs`. |
| `/api/worktrees` | `git worktree list` plus HEAD, ahead and behind the base, modified and untracked counts, dirty `src/` files, last change time and `agentsActive` (a change in the last 10 min). Read-only git only. |
| `/api/tests` | Latest `npm test` summary from `state/tests.json`, short history, and the live run if one is going. |
| `POST /api/run/tests` | Body `{"worktree":"<absolute path from the list>"}`, headers `content-type: application/json` and `x-cockpit: 1`. Starts `npm test` there in the background. One run at a time across every cockpit instance (`state/test-run.json` is the lock and carries progress), 409 otherwise, 30 min cap. |
| `POST /api/decide` | Body `{"id":"D8","action":"answer","option":0}`, or `{"action":"answer","text":"..."}`, `{"action":"answer","fields":{...}}`, `{"action":"recommend"}`, `{"action":"reopen"}`. Same headers as above. |
| `/api/wave` | `docs/visual-wave/tasks.json`: waves, tasks and their status, for the visual wave strip. |
| `/api/look` | Places from `references/places/_feedback/compare-index.json`, scores from `analysis/00-PLAN.md`, verdicts and Tom rulings from `analysis/<slug>.md`, `LATEST.md` if present, and every before and after pair under `lookfix*/`. |
| `/api/servers` | Listening ports 8123 to 8199 (`lsof`), every process on each port, the folder each serves, whether it answers (a 0.9 s HEAD probe), whether it listens beyond loopback (LAN), and links. 8141 is Tom's play server; other cockpits are marked as such. |
| `/api/activity` | Commits from the last 7 days across worktrees, uncommitted work per worktree, and `state/activity.jsonl`, newest first. |
| `/api/all` | All of the above in one response (what the page polls). |
| `/files/places/...` | Read-only images from `references/places/` in the main checkout. Image types only, no dot files, symlinks resolved and checked. |
| `/thumb/places/...?w=160\|480\|960` | Same images resized with macOS `sips`, cached in `state/thumbs/`. |
| `/gallery` | Every before and after pair (and after-only shot) from `_feedback/lookfix*/`, newest first; `?set=lookfix-qr` filters. |
| `/repo/...` | Read-only: `tools/aylmer-compare/`, `src/`, `assets/` from this worktree and `references/places/` from the main checkout, laid out like the repo, so the comparison page and the old lookfix gallery work from the cockpit. |
| `/doc/<worktree or main>/<path>` | A `.md`, `.txt` or `.json` under `docs/` or `references/places/_feedback/`, rendered as a page. |
| `/wtimg/<worktree>/docs/...` | Images under a worktree's `docs/` (spike screenshots). |

## Files

- `server.mjs` server, `log.mjs` activity logger
- `index.html`, `cockpit.css`, `cockpit.js` the page
- `fixtures/roadmap.sample.json` sample roadmap used until the real one exists
- `state/` runtime data (`tests.json`, `activity.jsonl`, `decisions.json`, `test-run.json` while a run is going, `thumbs/`). `decisions.json` is the record of Tom's answers; the rest is safe to delete
- `shots/` screenshots from the last design pass
