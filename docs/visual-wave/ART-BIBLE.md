# Aylmer Madness: art bible

Task V0-05, 6 Oct 2026. Data: `assets/look/palette.json` (hex, albedo, tolerance, sample rects). Direction: `docs/ROADMAP.md` section 2. Crops stay in `~/Desktop/Coding Projects/aylmer-madness/references/places/<slug>/` (gitignored); paths below are relative to that.

**North star (Tom, 6 Oct 2026):** Midtown Madness for a game of that era. Clean silhouettes, honest low-poly forms, rhythm on every street (poles, lamps, trees, signs), cars that gleam, light that carries the mood. True where locals look, simple where the engine is weak, warm where it is cheap. Never grimy, never photo-real.

## Materials

Texel density near: walls 128 per m, roofs 96, road and walk 96 to 128, lawn 64, car 256. Large-scale variation (20 to 50 m) in vertex colour, never photo noise. Hex values are `srgbTarget` from the palette.

| Material | Colour family | Wear rules | Do not |
|---|---|---|---|
| Lawn | yellow-green olive `#788C3A`, dry edges `#6B8037` to `#9A8E58` | wear paths, yellowing at curbs and drive edges, darker under crowns, a few mower stripes | grey-olive (the roadmap value was too dull), lime, or a uniform sheet |
| Maple canopy | sunlit `#5D7445`, shade `#2B4023`, floor `#1C2618` | opaque lumps, darker undersides, 3 colour families | alpha-tested leaves, flat lollipops, pure blue-green |
| Spruce and cedar | `#36421E` | tiered cones, jittered hedge boxes | uniform cones, black |
| Asphalt | cool grey `#9C9694` measured, band down to `#5E5E5F`; tar seams darker, wheel tracks lighter | crack-seal lines, patch per block, faded salt-worn paint | blue tint, fresh-black, stripes with no wear. Principale 2004 has no centre line |
| Concrete walk and curb | warm light grey `#DAD2C9` measured, band to `#B3AEA3` | 1.5 m joints, rolled curb, grit | white, hard-edged curbs |
| Principale pavers | grey-pink brick `#959086` | 4.5 m wide, brick-paver sidewalk up to the wall, heritage lamp every 20 to 25 m | red brick (refs read grey-pink), concrete |
| White vinyl | `#E2DED2`, albedo 0.75 or less | clapboard courses at the right scale, light dirt under eaves | pure white, clipped highlights |
| Cream siding | `#D9CDAE` | as above | yellow |
| Brick (Principale) | red-brown `#98665C` | mortar lines, per-house tint, stone base | one brick for all |
| Brick (299 Fraser) | plum-brown `#432E28` as seen from the street | side-lit east wall, darker than Principale | copying the Principale red |
| Limestone | warm grey `#92908B` | coursed ashlar, darker base course | white, smooth |
| Shingle | neutral grey, `#4A4744` base, up to `#817C86` lit | tint varies per house | blue roofs; let the sky do the cast |
| Hydro pole | creosote brown `#5A4A3A` | crossarm, pale insulators, transformer 1 pole in 4, sagging wire (1.2 px minimum) | bare poles |
| Water | `#7896AA` near the horizon, tea-brown `#4F4537` close in | takes the sky colour by view angle | opaque blue |
| Sky | horizon `#B3BDCC`, 35 to 40 degrees `#A6BBD6`, true zenith deeper (roadmap `#5F8FC8`) | fbm clouds, dithered | flat gradient, octagon puffs |

Crops used (paths only):
- 299 Fraser: `299-chemin-fraser/streetview-capture/{60b6f207_299_fraser_2009_east_front,gi-streetview_three_quarter_left,gi-streetview_three_quarter_right}.jpg`
- 1 Arial: `1-rue-arial-house/streetview-capture/{gi-streetview_front_elevation,60b6f207_1_arial_2009_angle_east}.jpg`
- 75 Denise-Friend: `75-rue-denise-friend/streetview-capture/60b6f207_75_denise_2009_front.jpg`
- Principale: `principale-storefronts/streetview-capture/comm/60b6f207_comm_{12,13,24}_north.jpg`, `.../strip/60b6f207_strip_{02_east_street,05_north}.jpg`
- Galeries: `les-galeries-aylmer/streetview-capture/60b6f207_galeries_2009_parking_east.jpg`
- Marina (Tom's photos): `marina-parc-des-cedres/tom-upload/d24c29c6_media_{1788892315222,1788892252048}.jpg`

## Cars

Clean period paint, moderate gloss, a Fresnel clear-coat with a sphere-mapped sky (V3-05). The hero Ranger (white `#ECEAE3`, a little yellowed) and the SC2 (navy `#1E2A47` base, reads about `#646B81` on the lit side) gleam. Traffic is duller: less gloss, no strong reflection, period colours (maroon `#834C58`, grey `#444C57`, silver `#8E8E91` as seen lit). No rust, no dirt streaks, no modern metallic flake.

## Place rulings (Tom, 6 Oct 2026)

- **Principale, 2004:** no parking on either curb. Heritage lamps and brick sidewalks existed. Shops: Moca Loca, Jimmy's Pizza, Bamboo (red awning). No centre line.
- **British Hotel:** coursed grey limestone, arched portal with steps. No blade sign, no veranda.
- **Tim Hortons on Principale:** no drive-thru.
- **299 Fraser:** gravel drive, spruce on the left, brick as in the street-side refs.

## Colour script by time of day

Hex from ROADMAP 2.3 except where the refs have spoken (noon). Grade and haze live in the timecycle (V1-02).

| Moment | Sun | Sky | Shadow and ambient | Air and grade |
|---|---|---|---|---|
| Blue hour 4:30 to 5:30 | below horizon, warm NE rim | deep blue, peach band NE | cool fill, no hard shadows | mist, low contrast, lifted blacks |
| Morning 6:00 to 9:00 | `#F2C48A`, long shadows west | pale blue, warm at sun | soft, cool shade | dew haze, warm highlights |
| Humid noon 11:00 to 15:00 | `#FFF3DE`, short shadows | `#A6BBD6` low, `#B3BDCC` horizon (measured) | grey-green shade | strongest haze, saturation down 15 % |
| Golden hour 18:30 to 20:15 (hero) | `#F7B26A` over Lac Deschenes | warm gradient, lit-from-below clouds | long blue-violet shadows, warm bounce | warm haze, glittering lake |
| Dusk 20:15 to 21:15 | below horizon | magenta to orange west, navy overhead | lamps and windows come on | lifted shadows, readable |
| Night | moon fill `#1B2236` | navy, orange glow over Hull | sodium `#FF9A2E` pools, warm windows, blue TV flicker | lamps glow in light haze; Tom's night brightness ruling applies |
| July storm | hidden | slate `#4A5550`, bright gap | flat | wet roads with sky sheen |
| Overcast | none | flat pale grey | soft | low saturation, the 2009 Street View look |

## HUD and menu

Matched to the shipped opening (`wt-qr-look/opening.css`; `docs/design/OPENING.md` did not exist on 6 Oct, so the CSS and screenshots are the source). Tokens are in `palette.json` under `hudAndMenu`.
- Ink `#07080C`, paper `#FFF7E6`, amber `#FFC94D` (hot `#FFD23F`), sodium glow `#FF9A4A`, cold accent `#5FD3F0`.
- Cards: dark panel `#0C1013` with a thin gold hairline `#605C3F`, rounded, soft shadow, small spaced-caps kicker in amber, body in a clean grotesque, hint line in muted grey.
- Titles: Impact stack, uppercase, skewed 7 to 9 degrees, amber second line. Mono typewriter for place captions. Futura-style caps for kickers and buttons.
- HUD and signs in Quebec French. Amber on dark, never white-on-white, never a modern flat-UI blue.

## Quality checks

- Squint test: at thumbnail size the frame reads canopy, sky, road, warm light.
- Albedo ceiling: nothing above 0.80, white vinyl 0.75, nothing below 0.03.
- Capture check: region means within `tolerance` of `srgbTarget` (or inside `lightnessBand`).
