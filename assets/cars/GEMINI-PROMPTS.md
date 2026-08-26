# Gemini prompts for the car renders

Run each car's four prompts separately (one image per prompt). Save the results
as `side.png`, `top.png`, `front.png`, `rear.png` in `assets/cars/<id>/`.
The game reads the silhouette, so the background and framing rules matter more
than the lighting. If a render comes back at a 3/4 angle, with a shadow, or on
a coloured backdrop, regenerate it — the loader will make a lumpy car from it.

## Shared preamble (paste before every prompt)

> Technical orthographic reference render, like a manufacturer's blueprint
> elevation. Pure white background (#FFFFFF), no ground plane, no shadow, no
> reflections on the floor, no text, no watermark, no other objects. The whole
> vehicle is in frame with a small margin, centred, filling about 90% of the
> image width. Flat, even studio lighting; photoreal materials; stock factory
> condition; wheels pointing straight ahead; all windows dark tinted glass so
> the interior is not visible. Exactly one vehicle. Aspect ratio 2:1 for side
> and top views, 1:1 for front and rear views.

## 1993 Ford Ranger XLT — `assets/cars/ranger/`

Vehicle description to append to each view:
> 1993 Ford Ranger XLT regular cab, short bed, 2WD, in Oxford White. Second
> generation (1993 restyle) with the flush aerodynamic headlamps and the
> chrome-trimmed grille with the blue Ford oval, chrome front and rear bumpers,
> XLT two-tone lower body stripe absent (solid white), black door mirrors,
> factory 14-inch styled steel wheels with silver centre caps on all-season
> tyres, single cab with one row of seats, black rubber bed liner visible in
> the bed, tailgate closed with the embossed FORD lettering.

- **side.png**: "…Exact left-side profile view (driver's side), camera at
  mid-door height, perfectly perpendicular to the vehicle, vehicle facing LEFT.
  Show the full wheelbase; tyres touching the bottom of the vehicle's silhouette."
- **top.png**: "…Exact plan view from directly above, vehicle facing LEFT (nose
  on the left edge). Show hood, cab roof, and the open bed with the bed liner."
- **front.png**: "…Exact front elevation, straight on at bumper height, showing
  grille, headlamps, chrome bumper and windshield."
- **rear.png**: "…Exact rear elevation, straight on, showing tailgate, tail
  lamps, chrome rear bumper and rear cab window."

## 1997 Saturn SL 4-door — `assets/cars/saturn/`

> 1997 Saturn SL (first-generation S-series sedan, 1996–1999 facelift), four
> door, in Medium Blue metallic ("Blue-Green" / Medium Blue). Small
> horizontal-slot grille with the Saturn badge, wraparound composite headlamps,
> body-coloured bumpers, black door handles and mirrors, dark grey lower
> cladding, factory 14-inch full plastic wheel covers (hubcaps) with the
> multi-spoke design, four doors, short trunk with wide taillamp panel.

- **side.png**: "…Exact left-side profile (driver's side), perpendicular,
  vehicle facing LEFT, tyres at the bottom of the silhouette."
- **top.png**: "…Exact plan view from directly above, vehicle facing LEFT."
- **front.png**: "…Exact front elevation, straight on at bumper height."
- **rear.png**: "…Exact rear elevation, straight on."

## 1988 Honda Civic Si — `assets/cars/civic/`

> 1988 Honda Civic Si three-door hatchback (fourth generation EF, 1988–1991),
> in Rio Red. Low sloping hood, thin black grille slot between the flush
> rectangular headlamps, body-coloured bumpers with the black lower valance,
> black door handles and mirrors, factory 14-inch Si alloy wheels (the
> 5-spoke-ish flat-face alloy) on 185/60 tyres, sunroof, the long glass hatch
> with the small black rear spoiler at the top of the hatch, single exhaust.

- **side.png**: "…Exact left-side profile (driver's side), perpendicular,
  vehicle facing LEFT, tyres at the bottom of the silhouette."
- **top.png**: "…Exact plan view from directly above, vehicle facing LEFT.
  Show the sunroof and the glass hatch."
- **front.png**: "…Exact front elevation, straight on at bumper height."
- **rear.png**: "…Exact rear elevation, straight on, showing the hatch, wide
  tail lamps and the Si badge."

## 1997 Pontiac Sunfire coupe — `assets/cars/sunfire/`

> 1997 Pontiac Sunfire SE two-door coupe (first generation, 1995–2002) in
> Medium Green-Blue metallic (teal). Twin-port split Pontiac grille with the
> arrowhead badge, wraparound headlamps, body-coloured ribbed lower cladding
> along the sills and bumpers, black mirrors, factory 15-inch five-spoke alloy
> wheels, two long doors, and the factory rear deck spoiler. Stock ride height.

- **side.png**: "…Exact left-side profile (driver's side), perpendicular,
  vehicle facing LEFT, tyres at the bottom of the silhouette."
- **top.png**: "…Exact plan view from directly above, vehicle facing LEFT,
  showing the rear spoiler."
- **front.png**: "…Exact front elevation, straight on at bumper height."
- **rear.png**: "…Exact rear elevation, straight on, showing the spoiler and
  the full-width tail lamp panel."

## Checking a set

Open the game with the files in place; the console logs `skin: <id> (N tris)`
for each car it picked up. Press **C** for the far chase camera to eyeball it.
If the body looks too tall or too short, the side render's wheels probably
aren't touching the bottom of the silhouette — regenerate the side view.
