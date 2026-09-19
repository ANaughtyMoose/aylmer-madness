# Glenwood photo reference pass — 2026-09-19

Thomas supplied four Glenwood-area house screenshots. Durable private originals: `/Users/thomaslever/Documents/Codex/2026-09-18/al/references/glenwood/glenwood-01.png` through `glenwood-04.png`. Raw screenshots are not included in GitHub or the portable build. These are architectural type references, not confirmed 2004 photographs or exact parcel assignments.

1. Broad bungalow, integrated left garage, large picture window, mixed muted painted panels and grey stone, shallow striped awning.
2. Low street-parallel roof, open left carport, pale horizontal siding, grouped white window frames, stone base.
3. Shallow front gable, integrated dark garage, beige panels, stone around broad dark-framed windows.
4. Low roof with open left carport, blue entry panels, broad window group, stone lower front, shallow entrance and posts.

Implemented in src/prototype/glenwood-houses.js, selected only by prototype materials through the existing Glenwood house builder. Other neighbourhoods retain their existing architecture. Eaves 2.78m; restrained roof pitches; deep overhangs, framed window groups, curtains, projecting sills, low stoops, carport posts or garage panels, short chimneys and occasional awnings. Stone material now uses staggered thin limestone courses; vinyl uses filtered 16cm horizontal laps. The models reinterpret the references rather than paste street photographs onto boxes.

Review at glenwood-review.html, including three variants, mirrored sides and three distance levels. Maximum measured triangles 136/70/32, within existing 160/80/48 budgets. Rendering inspection found no console errors. This first pass still needs neighbourhood landscaping, mature trees, driveway variation and feedback at driving distance; the isolated review deliberately makes geometry easy to assess.
