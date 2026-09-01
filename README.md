# Aylmer Madness

An open-world arcade driving game in the spirit of Midtown Madness, set in a
stylised Aylmer, Québec. Built on a small WebGL2 engine written from scratch for
this project — no Three.js, no npm, no build step, no assets to download.

## Run it

```sh
./serve.sh          # http://localhost:8123
```

ES modules refuse to load over `file://`, so double-clicking `index.html` will
not work. Any static server does; `serve.sh` just wraps `python3 -m http.server`.

## Controls

| | |
|---|---|
| **W / S** or **↑ / ↓** | throttle / brake — hold **S** and you're in reverse (25 km/h max, **R** on the speedo); **W** while backing up brakes and goes, no stop needed |
| **A / D** or **← / →** | steer |
| **Space** | handbrake — this is how you get the back end out |
| **Tab** | full-screen map (north-up): drag/arrows to pan, wheel to zoom, **click to set a GPS waypoint** |
| **N** | minimap size (small / large); **+ / −** zoom it while driving |
| **E** or **Enter** | take the job you're parked on, buy something, load the couch, take a friend's car |
| **Q** | cycle jobs when a marker offers more than one |
| **Backspace** | abandon the current job |
| **Shift** | look behind (hold, or latch it in Settings) |
| **C** | camera (chase / close / far / hood) |
| **?** | show / hide the on-screen key legend |
| **R** | radio: CKOI 102.1 → cassette → off |
| **F5** | quick-save to the last slot you used |
| **H** horn · **T** put the car back on the road · **0** mute · **Esc** pause (jobs, controls, settings, best times) |

A gamepad works too: left stick steers, triggers are throttle and brake, A is
the handbrake, and it rumbles when you hit things. The first drive walks you
through the keys once; the pause menu has a keyboard diagram and a Settings tab
(steering sensitivity, FOV, look-back latch, French/English chrome).

## Getting around

- The **minimap** rotates with you; the cyan line is the GPS route to the
  current job (or to your waypoint), replanned if you wander off it. Yellow
  rings are job starts, green rings are your friends' cars, white chevrons on
  the rim point at things off-screen.
- The **street name** you're on shows next to the minimap.
- **Tab** opens the whole town with street names and landmarks; click anywhere
  to drop a waypoint.
- **Switching cars**: the Saturn, Civic and Sunfire are parked in front of
  Margaret's, Sayyad's and Adam's houses. Pull up next to one, press **E**, and your
  car stays where you left it. Jobs that depend on seats (the Ranger's bench)
  re-plan for whatever you're driving.
- Best times per job are kept in the pause menu.

## The cars

You start with one. The rest you earn or buy, and they do not drive alike.

- **1993 Ford Ranger XL** (white, 2.3 four-cylinder, three-across bench) —
  yours. Slow, tall, leans in corners, and the bench means only **two
  passengers**. The "pick up the gang" job re-plans itself into two trips.
- **1997 Saturn SL, 4-door** (blue) — Margaret's, parked next to yours at
  299 Fraser. She lends it after « Ramasser la gang ». Average at everything.
- **1988 Honda Civic Si** (red) — Sayyad's, 75 Denise-Friend. His after
  « Poutine express ». Light, revvy, best grip and turn-in.
- **1997 Pontiac Sunfire** (teal) — Adam's, out in Deschênes. After « Avant
  minuit ». Quick in a straight line, lazier in corners.
- **The Club's golf cart** sits on the apron at Club de Golf Gatineau, up Rue
  du Golf — free to take with **E**: electric whine, bike-bell horn, 24 km/h,
  hopeless on asphalt and brilliant on grass and paths.
- **The used lot** on chemin d'Aylmer, past the Canadian Tire — press **E**
  beside one: a 1987 Oldsmobile Cutlass Ciera ($300, brown, floaty V6 and a
  three-speed slushbox), a 1991 Chevy Cavalier Z24 ($450, quick-ish, rattles
  above 55), a 1988 Dodge Caravan ($250, seven seats — the gang goes in one
  trip), and an Orion I city bus ($1,500, forty seats, only after ten jobs).

Every engine is synthesized: a four-stroke pulse train at the firing
frequency (the Ranger idles at 25 Hz, booms in third at 50 km/h), intake hiss,
exhaust rasp, a rev limiter, overrun pops, and a real five-speed with the
right ratios. `docs/audio/` has 12-second auditions of each car; `node
tools/audition.mjs` regenerates them.

**Radio** (**R**): CKOI 102.1 plays four synthesized 2004 loops with a jingle
between tracks; the cassette deck plays your own files — drop them in
`assets/radio/` and list them in `playlist.json` (see the README there).

## The jobs

Fifteen of them, marked by yellow pillars on the map. The original seven:
getting to first period at Heritage College, hauling the gang to Parc des
Cèdres, a poutine run from the Galeries food court, a slush run to the dep,
dropping résumés, beating curfew home from the marina at night, and a
five-checkpoint sunset tour of the town. Then the side jobs:

- **Le canot à 45 piasses** — a garage sale on Promenade Wychwood is selling a
  canoe that "floats". $45. Bondo is $21 at the Canadian Tire on chemin
  d'Aylmer. Patch it on Plage des Cèdres (tap **E** in the green — a bad patch
  leaks faster), then paddle it to Île Aylmer before it fills up.
- **Réveiller Sayyad** — 75 Denise-Friend, after midnight. Three doughnuts in
  the street wake him up; then you have 25 seconds to be somewhere else.
- **Le divan de Mike** — 129 avenue Frank-Robinson. Mike's couch has to end up
  in the maple on the front lawn. Load it, hit the tree at 35 km/h, physics
  does the rest. Three tries.

And the races — your friends drive their own cars, with real steering and
just enough rubber-band to keep it honest:

- **Adam jusqu'aux Galeries** — 4.3 km from Deschênes vs Adam's Sunfire.
- **La Civic de Sayyad à la marina** — through the Vieux; he barely lifts.
- **Circuit du Vieux-Aylmer** — three laps, Principale → Frank-Robinson → du
  Patrimoine → Bancroft, vs Margaret and Adam. Best lap is kept.
- **Blitz: le tour de l'île** — six checkpoints against the clock, +15 s each.
- **Le cart du Club** — the members' carts keep ending up at the school down
  the street. Bring one back before the marshal's round.

Every job pays. You start with $80 (mowing lawns) and spend it at the garage
sale, the Canadian Tire and the used lot. Each job shows a 2-second intro card
with a route preview; a 3-2-1 countdown starts the races.

## The town fights back

Pedestrians walk every sidewalk and dive out of the way, yelling, when you
come at them — you can't hit them, but you can frôler them, and the game keeps
count. Bins on garbage day, mailboxes, newspaper boxes, Canada Post relay
boxes, terrasse chairs on Principale and shopping carts at the Galeries all go
flying and stay where they land. Traffic obeys the eight traffic lights and 140
stop signs; run a red at speed and the police show up: a wanted meter fills to
three stars, cruisers chase and ram, and at three stars there's a roadblock at
the next lights. Lose them by getting out of sight for twelve seconds; get
boxed in and it's a $150 ticket and the job.

Pedestrians and drivers yell at you in Québécois when you drive like that
(« Heille, le cave! », « C'est vert, tabarnak! ») — 59 lines, off in Options if
you'd rather. Friends talk at the start and end of every job.

Every car has a health bar. Walls, poles and other cars cost you: past 25 a
headlight goes and the bumper crumples, past 60 it pulls to one side and
misfires, at 100 the job is over and the flatbed drops it back at its owner's.
Repairs: your own driveway at 299 Fraser (free, 10 s, press **E**), or the
Petro-Canada / Canadian Tire (4 s, about 20 % of the damage in dollars). Past
25 % the HUD tells you where the nearest one is and the map gets a wrench.

## Air

The ground is not flat any more. The old rail embankment crosses the whole
town north of chemin d'Aylmer — every street that crosses it is a jump at
speed (Chemin Fraser at 80 km/h is a second and a half in the air). There are
loading-dock ramps behind the Galeries that clear the fence, a boat launch at
the marina that ends in the river, a gravel pile in the arena lot, Auberge
Symmes' terrace steps, a dirt jump off rue Court, driveable paths and a
mound at Parc des Cèdres, and driveway aprons that kick. Kerbs launch you above
30 km/h; grass, gravel, sand and dirt each have their own grip; landings cost
damage past 4 m/s of drop. The suspension is real, so the car squats and
pitches.

## Saving, and the options

Nothing is saved behind your back. **Esc → Sauvegarde** writes one of three
slots (or **F5** for the last one you used); autosave, if left on, writes its
own slot only when a job finishes or you buy a car. The main menu offers
*Continuer*, *Nouvelle partie* and *Charger*. « Remettre les chars chez eux »
(Options → Gameplay, or the pause menu) sends every car back to its owner's
driveway and repairs it, nothing else. **Options** (main menu or Esc) covers
audio (master / engine / effects / radio), video (quality preset, render
scale, pixel ratio, draw distance, fog, FOV, camera, minimap size, HUD, legend,
fullscreen, FPS counter), controls (steering sensitivity, assists, look-back,
rumble) and gameplay (French/English, autosave, difficulty, tutorial reset).

## The map

It is the real Aylmer. `tools/build_map.py` turns OpenStreetMap pulls in `data/`
into `src/game/mapdata.js`: every street (1,200 segments, 300+ named streets —
Chemin d'Aylmer, Principale, Lucerne, Wilfrid-Lavigne, Vanier, Fraser…), 10,000+
real building footprints, the Ottawa River shoreline, Parc des Cèdres, the
marina, every park and parking lot. The clip is roughly Rue Raoul-Roy to
Deschênes east-west, and Allumettières to the river.

The houses are the real houses, too. `tools/build_houses.py` joins each
footprint to Québec's open **rôle d'évaluation foncière** (year built, storeys,
detached / semi / row — 98% matched by address) and to the province's open
**LiDAR** point cloud (measured eave and ridge heights, ridge direction, hip vs
gable — 99% covered), and `src/game/houses.js` builds each one from ~14
parametric archetypes by era: Vieux-Aylmer brick two-storeys with porches,
Wychwood hip-roof bungalows, Deschênes cottages, split-levels and colonials,
2000s stone-fronts. Walls and roofs are textured from one procedural atlas
(`tools/make_atlas.py`); within 200 m you get windows, doors, garage doors and
chimneys, further out a cheap silhouette. See `docs/HOUSES.md` for the plan,
data sources and what is still rough.

- **You** live at 299 Chemin Fraser; **Sayyad** (the Civic) at 75 Denise-Friend.
  Margaret's Saturn is in the driveway next to your Ranger at 299 Fraser; Adam's Sunfire is out on Chemin
  Vanier in Deschênes ("il habite loin").
- Landmarks are the actual ones: Galeries d'Aylmer, the Tim Hortons on
  Principale, the McDo on Chemin d'Aylmer, Aréna Frank-Robinson, Dépanneur
  Palmyra, Auberge Symmes, the marina lighthouse, Hôtel Deschênes.
- Heritage College is in the Hull expansion on Cité-des-Jeunes, so the "first
  period" job now travels there through the connected road network.

To refetch (Overpass API, ~20 MB): see the `curl` calls at the top of
`tools/build_map.py`'s docstring history, then `python3 tools/build_map.py` and
`python3 tools/preview.py` for an SVG check. Map data © OpenStreetMap
contributors, ODbL.

### Highway to Hull expansion

Hull is a second real OpenStreetMap sector, joined to Aylmer through Route 148
and boulevard des Allumettières. `tools/build_hull.py` converts the separate
`data/hull_*.json` Overpass extracts into `src/game/hull_mapdata.js`, preserving
the original Aylmer coordinate frame and shared OSM road-node ids. The expansion
adds roughly 11,300 road ways, 47,000 exact building footprints, 3,700 land-use
polygons and 3,800 named POIs from the Plateau through central Hull, Portage,
Heritage College, the Gatineau Park approaches and Chelsea village. Regenerating
`mapdata.js` keeps this layer intact.

## Looking at the cars

`garage.html` (same server) is a turntable viewer: arrows change car, **S** toggles
between the lofted model and the photo skin if one is present. `node
tools/car_views.mjs` writes `data/cars.svg`, an orthographic sheet with the
mesh dimensions checked against the real ones.

## The engine

```
src/core/math.js    4x4 matrices, frustum extraction/culling, seeded RNG
src/core/mesh.js    MeshBuilder — boxes, tapered towers, gable roofs, cylinders, cones
src/core/gl.js      WebGL2 renderer: one shader, vertex colours, lambert + hemi ambient + exp2 fog, water swell
src/core/input.js   keyboard with ramped analogue steering, gamepad + rumble
src/core/audio.js   procedural engine note per car, tyre squeal, horn, honks, misfire, impacts — no audio files
tools/build_map.py  OSM JSON -> src/game/mapdata.js (projection, triangulation, water mask)
src/game/mapdata.js generated: roads, footprints, river, areas, POIs
src/game/places.js  the named spots missions use, snapped onto real streets
src/game/world.js   bakes mapdata into frustum/distance-culled chunk meshes + wall colliders,
                    proper intersections, shore, docks, lamp pools, snappable poles
src/game/signals.js the 8 traffic lights and 140 stop signs, and who has to stop
src/game/signage.js storefront signs on Principale from OSM names (canvas atlas)
src/game/cars.js    the four car models, the driving model, damage and lights
src/game/collide.js car-vs-car impulse solver
src/game/damage.js  crumples, steam, headlights, fallen poles, repairs
src/game/traffic.js ambient traffic driving the real road graph, on the right, obeying lights
src/game/missions.js the core jobs, and the time-of-day lighting presets
src/game/missionkit.js the stage model (hold/cost/condition/onTick...) the runner understands
src/game/sidejobs.js the canoe, Sayyad, and Mike's couch
src/game/racejobs.js the four races
src/game/race.js    AI rivals: pure-pursuit steering on Nav routes, rubber-band, positions, laps
src/game/cops.js    the wanted meter, cruisers, roadblocks, tickets
src/game/peds.js    pedestrians: sidewalk walkers who dive and yell
src/game/streetprops.js knockable street furniture, baked per chunk, knocked into debris
src/game/debris.js  rigid debris bodies, tyre smoke, sparks, glass
src/game/reactive.js glue for the three above + G.stats and the streak counter
src/game/props.js   hand-placed props: canoe, couch, Île Aylmer, Mike's maple, the yard sale
src/game/boat.js    the canoe: paddling, drift, the leak
src/game/stunts.js  doughnut counting and the couch's ballistic arc
src/game/money.js   the wallet
src/game/garage.js  which cars you have: lent by friends, bought at the lot
src/game/gearbox.js real gear ratios → rpm for the engine note
src/game/radio.js   CKOI 102.1 (synthesized loops) and the cassette deck
src/game/save.js    save slots, autosave, legacy migration
src/game/options.js the options screen and applySettings()
src/game/terrain.js the height field: 20 hand-placed ramps, berms, mounds, stairs; per-surface grip
src/game/hud.js     gauge speedo, damage bar, objectives, timer, toast queue, rotating minimap with GPS line
src/game/bigmap.js  full-screen map: pan/zoom, street names, click-to-waypoint
src/game/ui.js      key legend, tutorial, loading screen, intro card, settings, keyboard diagram
src/game/i18n.js    French/English UI strings
src/game/store.js   localStorage: settings, map prefs, garage (parked cars + damage)
src/game/nav.js     road graph, Dijkstra routing, "what street am I on"
src/game/sky.js     sky dome with sun disc and drifting clouds
src/game/carskin.js photo skins: silhouettes -> body shape, images -> texture
src/main.js         loop, camera, mission runner
```

Designed to hold 60 fps on a MacBook Air's integrated GPU: the static world is
baked into a handful of chunk meshes and frustum-culled, there are no shadow
maps (cars get a blob shadow), no post-processing, and the render scale is
capped. The **Graphics** setting in the menu trades resolution for battery.

## Driving notes

Assists (on by default) trim steering lock with speed and quietly counter-steer,
which is what makes a keyboard drivable. Turn them off in the menu for a looser
car. Grass and gravel cut grip and speed; the river will stop you outright and
put you back on the road.

## Testing

`node tools/smoke*.mjs` — sixteen suites (missions, UI, world, driving, houses,
atlas, audio, garage, race, react, save, terrain, story, repair, cart) —
`docs/PLAYTEST.md` is the last new-player playtest — run under plain node (no browser) and bot-play the jobs, the collision solver,
the world build and the UI plumbing. `node tools/headless.mjs` boots the real
game in a headless Chrome (start one with `--headless=new
--remote-debugging-port=9222 --use-angle=swiftshader`), steps the sim, runs an
optional page script against `window.AYLMER` and writes a screenshot.
`tools/timers.md` (from `tools/timers.mjs`) lists every mission leg's real
route length against its timer.
