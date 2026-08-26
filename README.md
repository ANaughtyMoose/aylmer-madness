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
| **W / S** or **↑ / ↓** | throttle / brake (hold brake at a stop to reverse — an **R** shows on the speedo) |
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
| **H** horn · **R** put the car back on the road · **0** mute · **Esc** pause (jobs, controls, settings, best times) |

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
  Margaret's, Sayyad's and Dave's houses. Pull up next to one, press **E**, and your
  car stays where you left it. Jobs that depend on seats (the Ranger's bench)
  re-plan for whatever you're driving.
- Best times per job are kept in the pause menu.

## The cars

Four real cars, and they do not drive alike.

- **1993 Ford Ranger XLT** (white, 2.3 four-cylinder, three-across bench) —
  slow, tall, leans in corners, and the bench means only **two passengers**.
  The "pick up the gang" job re-plans itself into two trips when you drive it.
- **1997 Saturn SL, 4-door** (blue) — polymer panels, average at everything.
- **1988 Honda Civic Si** (red) — light, revvy, best grip and turn-in.
- **1997 Pontiac Sunfire** (teal) — quick in a straight line, lazier in corners.

## The jobs

Ten of them, marked by yellow pillars on the map. The original seven: getting to
first period at Heritage College, hauling the gang to Parc des Cèdres, a poutine
run from the Galeries food court, a slush run to the dep, dropping résumés,
beating curfew home from the marina at night, and a five-checkpoint sunset tour
of the town. Then the side jobs:

- **Le canot à 45 piasses** — a garage sale on Promenade Wychwood is selling a
  canoe that "floats". $45. Bondo is $21 at the Canadian Tire on chemin
  d'Aylmer. Patch it on Plage des Cèdres (tap **E** in the green — a bad patch
  leaks faster), then paddle it to Île Aylmer before it fills up.
- **Réveiller Sayyad** — 75 Denise-Friend, after midnight. Three doughnuts in
  the street wake him up; then you have 25 seconds to be somewhere else.
- **Le divan de Mike** — 129 avenue Frank-Robinson. Mike's couch has to end up
  in the maple on the front lawn. Load it, hit the tree at 35 km/h, physics
  does the rest. Three tries.

You start with $80 (mowing lawns). Each job shows a 2-second intro card with a
route preview; progress, best times and the wallet are saved in `localStorage`.

Every car has a health bar. Walls, poles and other cars cost you: past 25 a
headlight goes and the bumper crumples, past 60 it pulls to one side and
misfires, at 100 the job is over and the flatbed drops it back at its owner's.
Repairs: pull into the Petro-Canada and wait five seconds. Traffic obeys the
eight traffic lights and 140 stop signs; you get a toast if you don't.

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
  Margaret's Saturn is in the driveway next to your Ranger at 299 Fraser; Dave's Sunfire is out on Chemin
  Vanier in Deschênes ("il habite loin").
- Landmarks are the actual ones: Galeries d'Aylmer, the Tim Hortons on
  Principale, the McDo on Chemin d'Aylmer, Aréna Frank-Robinson, Dépanneur
  Palmyra, Auberge Symmes, the marina lighthouse, Hôtel Deschênes.
- Heritage College is in Hull, on Cité-des-Jeunes, so the "first period" job
  ends at the way out of town on Chemin d'Aylmer.

To refetch (Overpass API, ~20 MB): see the `curl` calls at the top of
`tools/build_map.py`'s docstring history, then `python3 tools/build_map.py` and
`python3 tools/preview.py` for an SVG check. Map data © OpenStreetMap
contributors, ODbL.

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
src/game/props.js   hand-placed props: canoe, couch, Île Aylmer, Mike's maple, the yard sale
src/game/boat.js    the canoe: paddling, drift, the leak
src/game/stunts.js  doughnut counting and the couch's ballistic arc
src/game/money.js   the wallet
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

`node tools/smoke.mjs`, `smoke_ui.mjs`, `smoke_world.mjs`, `smoke_driving.mjs`
run under plain node (no browser) and bot-play the jobs, the collision solver,
the world build and the UI plumbing. `node tools/headless.mjs` boots the real
game in a headless Chrome (start one with `--headless=new
--remote-debugging-port=9222 --use-angle=swiftshader`), steps the sim, runs an
optional page script against `window.AYLMER` and writes a screenshot.
`tools/timers.md` (from `tools/timers.mjs`) lists every mission leg's real
route length against its timer.
