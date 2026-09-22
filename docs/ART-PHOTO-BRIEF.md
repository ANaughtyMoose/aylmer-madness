# Art brief: photos to find and the ChatGPT prompts

21 September 2026. Companion to STORY-RESEARCH-NOTES.md section E. Pipeline: real photos → one approved reference sheet per person → every card generated from the sheet, never from a previous card → one style block kept byte-identical.

Before anything ships: each friend signs off on their own cards. Real faces, free game or not.

## 1. Photos to find

Name files `who_year_shot.jpg` and drop them in `references/story/` (gitignored, like `data/raw/reference/`). Wrong year is fine; write the year in the filename. Hair and glasses matter more than resolution.

### People (two or three each, ideally 2003 to 2005)

For each: one face-on, one three-quarter, one candid doing the thing they did.

- Tom: face-on; in or beside the truck; the bike-crash era if any.
- Margaret: face-on; in the kitchen or the doorway at 299 Fraser; with the Saturn if any.
- Sayyad: face-on; at a computer or with any Apple hardware; asleep or just woken if such a photo exists.
- Zahra: face-on; with a cat.
- Mike: face-on; on or near the couch; with the Forester if any.
- Russell: face-on; skateboard; at the garage on Arial; in a golf-club shirt if any.
- Adam: face-on; with the Sunfire.
- Abraham: face-on; with a guitar; with the Sienna.
- Tyler, Rob, Norm: anything at all.
- Dad: one photo, for the phone-call portrait only. Not Rudy, not the aunt.
- A group shot: the beach, a party at Mike's, anyone in the truck bed. Photo 37 in the existing reference set is already flagged as the best Tom, Abraham and Adam shot.

### The truck (the more the better)

- Side profile, front three-quarter, rear with tailgate.
- Dashboard and bench, radio, whatever hung from the mirror.
- The bed, with junk in it.
- Any damage: rust, the bald tires, the box after the couch.
- Later years: a Waterloo move-out with the bed full, Boston, 2011. These make the last ending card.

### Places (2004 if possible, otherwise anything before the renovations)

- 299 Fraser: front, driveway, the kitchen window at night.
- 75 Denise-Friend: the front and the upstairs left window.
- 129 Frank-Robinson: the house and the maple. The couch in the tree, if it was ever photographed.
- Principale: Tim Hortons, Dépanneur Palmyra, Dr Morin's office, Sol, the church, the Auberge.
- Galeries d'Aylmer: the Canadian Tire end, the parking lot, the south entrance.
- Marina and the lookout; Parc des Cèdres beach.
- Royal Ottawa Golf Club gate; St. Vincent Hospital on Cambridge; Heritage College.
- Champlain bridge; boulevard de Lucerne; Wychwood.

### Objects and paper

- Cassettes, a Discman, a blue slush cup, a Canadian Tire receipt, Canadian Tire money, the canoe, a golf cart, a dental lab box, a Heritage student card, the 2004 Ottawa phone book, a paper map.

## 2. Style block (paste byte-identical into every image prompt)

```
STYLE: early-2000s illustrated video game cover art. Heavy black ink outlines, flat posterised colour in a limited palette of six colours, cel shading with one hard shadow, slight halftone grain, sun-bleached Kodak Gold warmth. Summer 2004, Aylmer, Quebec. No photorealism, no soft gradients, no text, no logos, no watermark, no lens blur. 4:3 aspect.
```

## 3. Reference sheet prompt (once per person, attach two or three photos)

```
Make a character reference sheet for a video game, based on the attached photos of the same real person. Keep the face, hair, build and glasses exactly as in the photos. Show three views on one plain light-grey sheet: front, three-quarter, profile. Neutral expression, even daylight, plain dark tee, no props. Same line weight in all three.

[STYLE BLOCK]

SUBJECT: [NAME], [age in 2004], [three fixed descriptors, e.g. "narrow face, dark buzz cut, gold-rim glasses"].
```

Approve the sheet before making any card. If it drifts from the photos, regenerate from the photos, not from the sheet.

## 4. Mission card prompt (attach the person's sheet plus one approved hero card)

```
Make a mission briefing illustration for a video game. Use the attached character sheet for the person's face, hair and build; do not change them. Match the line weight and colours of the attached example card.

[STYLE BLOCK]

SUBJECT: [NAME], [age], [same three descriptors as the sheet].
SHOT: medium close, three-quarter view, eye level, the person on the right third of the frame, looking slightly off-camera.
ACTION: [one concrete thing, e.g. "standing in a kitchen doorway holding a small white cardboard box, one eyebrow raised"].
PLACE: [named place, from the attached place photo if any, e.g. "a 1970s suburban kitchen, morning light, calendar on the fridge"].
MOOD: [one word: suspicious / half-asleep / triumphant / resigned].
```

Batch all of one person's cards in one session. Never generate a card from a previous card.

## 5. Place card prompt (attach the place photo)

```
Redraw the attached photograph of a real street in Aylmer, Quebec as a video game establishing shot, keeping the building shapes, sign positions and road layout exactly. Replace any readable text on signs with blank sign shapes. Summer, [time of day], a white 1993 Ford Ranger pickup parked at the kerb.

[STYLE BLOCK]
```

## 6. Chapter card prompt

```
Make a wide establishing illustration for a chapter title screen. [PLACE from a photo, e.g. "the marina at Aylmer at dusk, the river behind, one white pickup with the tailgate down"]. No people or two people seen from behind, sitting on the tailgate. Leave the lower third empty for a title.

[STYLE BLOCK]
```

## 7. Fallback when generation drifts

Posterise the real photo instead: levels to crush the midtones, posterise to six levels, add a black outline with a find-edges layer, halftone at 30 percent, warm tint. Closer to what Max Payne actually shipped, and the face is guaranteed right.

## 8. First batch to make (proof of the pipeline, six images)

1. Tom reference sheet.
2. Margaret reference sheet.
3. One hero mission card: Margaret in the doorway with the dental box (mission 25).
4. One place card: rue Principale from a photo.
5. One chapter card: the marina at dusk.
6. One posterised-photo fallback of the truck, to compare styles side by side.

Judge the batch on one question: does anyone who was there recognise the person and the corner? If not, the style is wrong, not the photo.
