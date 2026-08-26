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
| **W / S** or **↑ / ↓** | throttle / brake (hold brake at a stop to reverse) |
| **A / D** or **← / →** | steer |
| **Space** | handbrake — this is how you get the back end out |
| **Tab** | full-screen map: drag/arrows to pan, wheel to zoom, **click to set a GPS waypoint** |
| **E** or **Enter** | take the job you're parked on, or take a friend's car you're parked next to |
| **Q** | cycle jobs when a marker offers more than one |
| **Backspace** | abandon the current job |
| **Shift** (hold) | look behind |
| **C** | camera (chase / close / far / hood) |
| **H** horn · **R** put the car back on the road · **M** mute · **Esc** pause (job list, best times) |

A gamepad works too: left stick steers, triggers are throttle and brake, A is
the handbrake.

## Getting around

- The **minimap** rotates with you; the cyan line is the GPS route to the
  current job (or to your waypoint), replanned if you wander off it. Yellow
  rings are job starts, green rings are your friends' cars, white chevrons on
  the rim point at things off-screen.
- The **street name** you're on shows next to the minimap.
- **Tab** opens the whole town with street names and landmarks; click anywhere
  to drop a waypoint.
- **Switching cars**: the Saturn, Civic and Sunfire are parked in front of
  Marc's, Steph's and Dave's houses. Pull up next to one, press **E**, and your
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

Seven of them, marked by yellow pillars on the map: getting to first period at
Heritage College, hauling the gang to Parc des Cèdres, a poutine run from the
Galeries food court, a slush run to the dep, dropping résumés, beating curfew
home from the marina at night, and a five-checkpoint sunset tour of the town.
Progress is saved in `localStorage`.

## The map

It is the real Aylmer. `tools/build_map.py` turns OpenStreetMap pulls in `data/`
into `src/game/mapdata.js`: every street (1,200 segments, 300+ named streets —
Chemin d'Aylmer, Principale, Lucerne, Wilfrid-Lavigne, Vanier, Fraser…), 10,000+
real building footprints extruded with roofs by type, the Ottawa River shoreline,
Parc des Cèdres, the marina, every park and parking lot. The clip is roughly
Rue Raoul-Roy to Deschênes east-west, and Allumettières to the river.

- **You** live at 299 Chemin Fraser; **Steph** (the Civic) at 75 Denise-Friend.
  Marc's Saturn is on Bancroft in old Aylmer; Dave's Sunfire is out on Chemin
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
src/core/gl.js      WebGL2 renderer: one shader, vertex colours, lambert + hemi ambient + exp2 fog
src/core/input.js   keyboard with ramped analogue steering, gamepad
src/core/audio.js   procedural engine note, tyre squeal, horn, impacts — no audio files
tools/build_map.py  OSM JSON -> src/game/mapdata.js (projection, triangulation, water mask)
src/game/mapdata.js generated: roads, footprints, river, areas, POIs
src/game/places.js  the named spots missions use, snapped onto real streets
src/game/world.js   bakes mapdata into frustum/distance-culled chunk meshes + wall colliders
src/game/cars.js    the four car models and the driving model
src/game/traffic.js ambient traffic driving the real road graph, on the right
src/game/missions.js the seven jobs, and the time-of-day lighting presets
src/game/hud.js     speedo, objectives, timer, rotating minimap with GPS line
src/game/bigmap.js  full-screen map: pan/zoom, street names, click-to-waypoint
src/game/nav.js     road graph, Dijkstra routing, "what street am I on"
src/game/sky.js     sky dome with sun disc and clouds
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
