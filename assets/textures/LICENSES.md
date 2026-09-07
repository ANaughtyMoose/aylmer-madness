# Photographed material tiles — where every one came from

Six seamless CC0 photographs, one per surface the houses are built out of.
`assets/textures/sources.json` says which atlas cell each one becomes and what
colour it has to come out; `tools/make_atlas.py --from assets/textures` composes
them into `assets/materials/atlas.real.png` + `.json`.

**Every tile here is CC0.** All six are from ambientCG, whose licence page says
"All assets on ambientCG are dedicated to the public domain under CC0" and whose
asset pages carry the same line. Attribution is not required; this file is it.

| file | ambientCG asset | atlas cells it becomes |
|---|---|---|
| `brick_brown.png` | [Bricks097](https://ambientcg.com/view?id=Bricks097) | `brick_brown` |
| `brick_red.png` | [Bricks104](https://ambientcg.com/view?id=Bricks104) | `brick_red`, `brick_buff` |
| `siding_wood.png` | [WoodSiding008](https://ambientcg.com/view?id=WoodSiding008) | `cedar`, `vinyl_beige`, `vinyl_blue`, `vinyl_green`, `vinyl_grey` |
| `siding_painted.png` | [WoodSiding005](https://ambientcg.com/view?id=WoodSiding005) | `clapboard_white`, `clapboard_yellow`, `vinyl_white` |
| `stone_block.png` | [Tiles143](https://ambientcg.com/view?id=Tiles143) | `stone_beige`, `stone_grey` |
| `plaster.png` | [Plaster001](https://ambientcg.com/view?id=Plaster001) | `stucco` |

- Source: <https://ambientcg.com>
- Author: Lennart Demes / ambientCG
- Licence: **CC0 1.0 Universal** — <https://creativecommons.org/publicdomain/zero/1.0/>

## What was done to them

The originals are 1K JPEG `_Color` maps. Each was converted to PNG and reduced
to 512 px (`sips -s format png -Z 512`) — the atlas cell core is 320 px, so 1K
was carrying four times the pixels the atlas can hold. Nothing was retouched.

`make_atlas.py --from` then, per cell: repeats a non-square sheet along its short
axis to fill a square cell (and doubles that cell's `metres` to match, or the
bricks come out 4 cm tall), area-resamples to 320 px, desaturates towards
luminance by `desat`, and scales the mean onto the colour the **procedural** cell
already had. That last step is why swapping atlases changes the surface of a
house and never its hue.

## Cells with no photograph

`shingle_brown`, `shingle_dark` and `shingle_grey` keep their procedural tiles,
and `make_atlas.py` says so when it runs. Neither ambientCG nor Poly Haven has
an asphalt shingle — only clay barrel tiles, slate and thatch — and slate tinted
brown reads as fish scales, which is further from an Aylmer roof than the drawn
courses already are. `flat` is procedural too and must stay that way: it is the
white cell a default UV of (0,0) samples, and untextured geometry sharing a
chunk mesh with textured houses depends on it.

Poly Haven was checked and not used: its wall textures are smooth plaster that
came out featureless once desaturated and tinted.
