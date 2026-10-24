# Save lot port

Source: `bbc483c`. Base: `87e252f` on `fix/look-on-qr`.

Unsold Cutlass, Caravan, bus and Benz defaults now use the used-car lot.
New saves and missing or invalid parked positions use the same lot row as
the runtime. Valid saved positions still win, including bought cars.

The port extracts the existing curb and lot geometry into `parkspots.js`,
shared by `homes.js` and `save.js`. This avoids the import cycle through
`vehicles.js`. Public exports remain available from their existing modules.
The wave A tow behavior remains intact.

Verification:

- `node tools/smoke_homes.mjs`: 74 passed, 0 failed. Covers matching owner
  tables, each beater's lot position and heading, new saves, missing and
  invalid saved spots, preserved bought-car positions, and Ranger/Saturn
  home fallbacks.
- `node tools/smoke_save.mjs`: 356 assertions passed.
- `npm test`: 86/86 suites passed, including `smoke_world` (23/23),
  `smoke_react` (48/48) and `smoke_terrain` (75/75). Both timing-sensitive
  suites passed on the first serialized run.
- `git diff --check`: passed.
- New comments, test text and this report contain no em or en dashes.

Both-entry headless boot passed through the authorized reviewed execution
mechanism after the environment policy changed. Index reached drive in 23.5 s
with 0 console errors and moved 146.3 m; prototype reached drive in 21.0 s
with 0 console errors and moved 144.6 m. Both exceed the 10 m movement gate.
The isolated server and browser were closed by the rig. Lead reviewed the
owned-file diff and the complete test summaries. No renderer or geometry
changes are part of this save-data port.

Boot command used:

```sh
CMP_SRV_PORT=8241 CMP_CDP_PORT=9541 node tools/qa/boot.mjs --entries=index,prototype
```

No geometry budget or timing budget changed.
