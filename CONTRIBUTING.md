# Contributing to Aylmer Madness

Thanks for wanting to make the town better. `main` is protected: nobody pushes
to it directly (not even by accident), and it can't be force-pushed or deleted.
Everything lands through a pull request that Thomas approves.

## The loop

1. Fork the repo (or, if you've been added as a collaborator, make a branch —
   `git checkout -b my-thing`).
2. Run it: `./serve.sh` then open http://localhost:8123. No install, no build.
3. Make your change. Keep the voice (Québécois French for anything the player
   reads in the town; UI chrome has an EN toggle in `src/game/i18n.js`).
4. Run the tests: `for t in tools/smoke*.mjs; do node $t; done` — all fifteen
   suites must stay green. `node tools/headless.mjs` boots the real game in a
   headless Chrome if you want to prove a change renders (see the file header).
5. Open a pull request against `main` with a screenshot if it's visible and a
   sentence on what it does. It gets reviewed and merged from there.

## Where things live

`README.md` has the engine map. Missions are data in `src/game/missions.js`,
`sidejobs.js`, `racejobs.js`, `golfjob.js` (the stage model is documented at
the top of `src/game/missionkit.js`); the town is `src/game/world.js`; the cars
are `src/game/cars.js`. `BACKLOG.md` is the list of things nobody has done yet —
pick one, or add your own idea to it.

Map data © OpenStreetMap contributors (ODbL); house attributes from Québec's
open rôle d'évaluation and LiDAR (see `docs/HOUSES.md`).
