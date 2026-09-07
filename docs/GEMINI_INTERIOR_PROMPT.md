# Aylmer Madness — driver's-seat interiors (Gemini 3.8 Flash, Antigravity)

Paste everything below the line into a new Antigravity agent on the `aylmer-madness` folder.

---

You are painting the **driver's-seat view** for Aylmer Madness, a from-scratch WebGL2 driving
game set in Aylmer, Québec, summer 2004. The player is seventeen. A new camera is coming that sits
where the driver's head is and looks through the windshield; your job is the interior around that
view, one plate per vehicle. Read `gemini-inbox/look/LOOK.md` and `BACKLOG.md` item C6 first.

**The tone, and this is the whole brief:** funny the way a real 1993 Ranger interior is funny, not
the way a sketch is. The comedy is in small, true, period-correct details a person from Aylmer
would recognise and nobody else would notice. **Nothing sits on the dash. No beer, no bong, no
Habs flag, no fleur-de-lis, no poutine.** Québec, not a Québec joke. If a detail would make a
Montréal tourism ad, cut it. If it would make Thomas's friends say "oh no, that's exactly it",
keep it.

## Rules

- Do not modify any existing file; git is read-only. Output only under `gemini-inbox/interiors/`.
- **Albedo only**, flat overcast light, no baked shadows or reflections: the engine lights it.
- 2048×768 PNG per plate, the windshield region **transparent** (alpha 0) so the road shows
  through; the A-pillars, dash top, wheel, mirror and visors opaque. Also supply a 512×512 alpha
  **dirt/chip layer** for the glass (a stone chip low left, wiper arcs, a little haze), separately.
- The wheel is drawn by the engine so it can turn: supply the wheel as its own PNG with alpha
  (`wheel.png`, 1024², centred, the real 2004 wheel for that car) and mark its centre and radius
  in the manifest.
- No people, no hands, no faces, no licence plates, no real logos on anything you invent.
- `interiors.json`: per vehicle `slug`, `plate`, `glass`, `wheel`, `wheelCentre` [x, y] in plate
  pixels, `wheelRadiusPx`, `eyeHeightM`, `eyeBackM` (from the front axle), `details` (the list, one
  line each, so the wiring agent can write the tooltip text), `source` (what you looked at).

## The vehicles, and the one true detail each

Research the real 2004-era interior of each model (grey plastic, the tape deck, the cluster
colours) before painting anything.

- `ranger` 1993 Ford Ranger XL, base trim: grey plastic, vinyl bench, manual windows, the AM/FM
  cassette. The **headliner sags** and is held up with two thumbtacks. A **stone chip** low on the
  passenger side. A cassette adapter cord running to a Discman on the bench. A Canadian Tire
  air freshener that stopped smelling of anything in 2002. The Galeries parking stub in the visor.
- `civic` 1988 Honda Civic Si (Sayyad's): the red-lit cluster, a **Hawaiian-shirt seat cover** on
  the driver's seat, a chrome shift knob, a Bluesfest wristband on the mirror.
- `saturn` 1997 Saturn SL (Margaret's): immaculate, a box of Kleenex in the back window, a
  Caisse populaire calendar magnet, a rosary that is not hers.
- `sunfire` 1997 Pontiac Sunfire (Adam's): one working speaker, a CD wallet on the passenger seat,
  a Mayo parish bulletin.
- `forester` 1998 Subaru Forester, green (Mike's): a paperback face down on the dash **is the one
  exception to nothing on the dash**, because Mike, and a skateboard in the back.
- `sienna` 1999 Toyota Sienna (Abraham's): a guitar capo in the cupholder, a stack of sheet music,
  a child seat that has been there since before it was his.
- `cavalier` 1991 Chevy Cavalier Z24 (Tyler's): a Fido pager on the console, a sun-cracked dash
  top, sunglasses clipped to the visor.
- `cutlass` 1987 Oldsmobile Cutlass Ciera: velour, a tissue box with a crocheted cover, an
  8-track that does not work under the cassette deck that does.
- `caravan` 1988 Dodge Caravan: a Tim Hortons cup holder that is not from Tim Hortons, 240 000 km
  on the odometer.
- `f250` early-90s Ford F-250 (Russell's dad's): a work-glove on the dash **is the other
  exception**, a CB radio, sawdust everywhere, a chainsaw file in the door pocket.
- `orion` Orion I city bus and `newlook` GM New Look: the driver's seat, the fare box, the
  transfer punch, the STO route card for the 40. `bluebird` Blue Bird school bus: the stop-arm
  switch, the mirror array, the *ÉCOLIERS* sign control.
- `cruiser` and `diamondback` bicycles: handlebars only, with a bell and a Radio Shack light.

## Prove it

`gemini-inbox/interiors/preview.html`: a page that shows each plate over a still of the game's
road (use any screenshot in `gemini-inbox/shots/`) with the wheel composited and rotated ±30°.
Screenshot each and look at them before you write `STATUS.md`. If a plate reads as a cartoon or
as a photo pasted on a box, it is not done.
