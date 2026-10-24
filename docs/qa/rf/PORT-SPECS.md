# PORT-SPECS: vehicle spec stack

Status: verified locally and ready for lead integration. Focused checks, the full suite and both-entry browser boot are green.

Branch: `port/spec-stack`, based on `fix/look-on-qr` at `87e252f`.
Source port: `b78aa3bf2e33c9d2bc3e8bb51c8286f762b8fb02`.

## Change

The spec stack owns the tuned dry sheet and engine voice. Each physics tick derives weather and skills from that stable sheet, then fuel applies the dry-tank limit as before. It keys upgrades by the vehicle's own car identity. Economy exports a pulse driven by the main frame and `AYLMER.step`, replacing its independent animation loop and step wrapper.

The port preserves Wave A's free mission patch-up, tow-debt repayment, slow motion, feel diagnostics, couch state and grounded tree handling. The opening replay now stamps the temporary vehicle's car identity as load and swap already do. It does not change opening behavior or dialogue. The obsolete economy import of `tunedSound` was removed.

## Owned files

- `src/game/economy.js`
- `src/game/specstack.js`
- `src/main.js`
- `tools/smoke_engine_rebuilds.mjs`
- `tools/smoke_specstack.mjs`
- This report

`jobready.js` is unchanged. The new stack smoke uses the real job patch and economy APIs to check compatibility.

## Verification

- `node tools/smoke_specstack.mjs`: 28 passed, 0 failed. Old and new pipelines match sheets across all 29 frames, all 7 engine-voice calls in order and fuel burned. It covers upgrade fits, wet grip, swaps, repainting, empty fuel, stable cache objects and vehicle identity disagreement.
- The same smoke checks the real economy fit charge and immediate tuned sheet, one engine-voice update, a free patch on an upgraded car, saved health and mission repair bookkeeping, retained wet grip, half-payout tow-debt collection, no repeated collection, and menu-loaded money not treated as income.
- `node tools/smoke_engine_rebuilds.mjs`: PASS. No rebuild across 120 wet, skilled, upgraded frames; one rebuild for a real tune change; engine gain rises and audio-context recovery works.
- `node tools/smoke_jobready.mjs`: 28 passed, 0 failed.
- `git diff --check`: clean.
- `npm test`: 87/87 suites passed, exit 0. Both timing-sensitive suites passed on the first run: `smoke_react` 48/48 and `smoke_terrain` 75/75. The upgrade suite passed 234 checks and the vehicle-layer suite kept all 21 vehicle specs finite through upgrades, rain and skills. Full log is retained locally at `out/qa/port-specs-npm-test.log` (gitignored).
- Both-entry boot: PASS through the lead's reviewed execution on dedicated ports 8242/9542. Index reached menu and drive in 18 seconds; prototype in 14.8 seconds. Each moved 144.6 m and reported 0 console errors. The earlier sandbox restriction was resolved through the authorized escalation mechanism.

## Integration gate

The lead must merge with `--no-ff --no-commit`, rerun the full suite and both-entry boot, and finalize only if green. No push has been performed.
