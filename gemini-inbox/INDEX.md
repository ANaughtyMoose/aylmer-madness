# Aylmer Madness — Gemini Inbox Master Index

Welcome to the **Aylmer Madness** audit, review, and creative expansion package.
All work contained in this directory was generated under strict read-only constraints: **zero existing game files were modified**.

**Branch:** `wave/1-memory`  
**Commit:** `4835c66`  
**Server Port:** `8151` (`http://127.0.0.1:8151/`)  

---

## Directory Navigation & Deliverables

### 1. Core Technical Reports & Audits (Part A)
- **[REVIEW.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/REVIEW.md)**
  - **Section A1:** Mathematical and visual analysis of the 14 known bugs (confirmed vs denied with code diffs).
  - **Section A2:** Static code review covering sector gating, per-frame allocations, leaks, save completeness, keybinding collisions, i18n, WebGL state, and console hygiene.
  - **Section A6:** 20 specific recommendations ("What would make it great") tailored to Aylmer in summer 2004.
- **[PLAYTEST-GEMINI.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/PLAYTEST-GEMINI.md)**
  - Full 30-step player trajectory audit table matching `docs/PLAYTEST.md` format.
  - Concluding with *"The ten things a new player notices first"*.
- **[CONTENT-AUDIT.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/CONTENT-AUDIT.md)**
  - Audit of ~1,900 written entries across 25 JSON files in `assets/text/`.
  - Destination key resolution between `campaign.json` and `src/game/places.js`.
  - Real person / surname validation, post-2004 anachronisms check, Joual vs France-French register analysis.
  - Russell labour framing critique (50% discount vs pizza and beer).
  - **NCC Champlain Bridge Cycling Path Research:** Full historical documentation with 2002 Ottawa Citizen citations resolving the conflict for Thomas.
- **[TESTS-AUDIT.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/TESTS-AUDIT.md)**
  - Analysis of all 27 smoke test suites in `tools/smoke*.mjs`.
  - Identification of false-confidence blind spots and loosened tolerances.
  - The missing `smoke_traffic.mjs` analysis.
  - Top 10 missing tests ranked by bug-finding power.
- **[STATUS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/STATUS.md)**
  - High-level executive verification status and priority bug triage matrix (P0–P3).

---

### 2. Creative Assets & Expanded Designs (Part B)

#### [cars/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cars/) — Vehicle Roster & Textures (B1)
- **[PROMPTS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cars/PROMPTS.md):** Orthographic texture generation prompts for all 13 vehicles (1993 Ranger XL, 1988 Civic Si, 1997 Saturn SL, 1997 Sunfire, 1998 Forester, 1991 Cutlass Ciera, 1989 Cavalier, 1999 Sienna, Golf Cart, STO Nova Bus LFS, School Bus, Cruiser Bike, Mountain Bike).
- **[ranger_skin_atlas.jpg](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cars/ranger_skin_atlas.jpg):** Fully generated 1024x1024 orthographic texture atlas sheet for the protagonist 1993 Ford Ranger XL (black plastic trim, base XL argent wheels, road grime).

#### [materials/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/materials/) — Material Atlas (B2)
- **[manifest.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/materials/manifest.json):** Configuration mapping 17 materials to 2048x2048 atlas grid UVs and physics attributes.
- **[PROMPTS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/materials/PROMPTS.md):** Prompts for 17 seamless PBR tiles (weathered asphalt, road markings, concrete sidewalks, limestone gravel, summer lawn, beach sand, river water, brick, vinyl siding, cedar shakes, asphalt shingles).
- **[asphalt_weathered.jpg](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/materials/asphalt_weathered.jpg):** Fully generated seamless tile of weathered Outaouais asphalt with tar-snake crack repairs.

#### [audio/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/audio/) — Procedural Sound Design (B3)
- **[SOUND-DESIGN.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/audio/SOUND-DESIGN.md):** Web Audio procedural synthesis acoustic profiles for Ford 2.3L Lima engine, Honda Civic Si DOHC bark, STO diesel bus & air brakes, surface rolling noise, and summer cicada ambient soundscapes.
- **[SOURCES.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/audio/SOURCES.md):** CC0 / Public Domain Foley reference catalog for optional offline sampling.

#### [art/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/art/) — Key Art & Seam Loading Cards (B4)
- **[PROMPTS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/art/PROMPTS.md):** Prompts and lore cards for sector seams (Aylmer, Hull, Ottawa, Chelsea) and main title poster.
- **[aylmer_key_art.jpg](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/art/aylmer_key_art.jpg):** Fully generated 16:9 widescreen key art illustration showing the white Ranger parked on the grassy river shore near Auberge Symmes at sunset.

#### [story/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/story/) — Narrative Architecture (B5)
- **[STORY-NOTES.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/story/STORY-NOTES.md):** Pacing critique, character evaluations, and narrative design analysis.
- **[campaign.v2.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/story/campaign.v2.json):** Complete revised 15-mission campaign JSON with standardized `places.js` machine keys and canonical pizza & beer mechanics for Russell.

#### [multiplayer/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/multiplayer/) — Non-Invasive Multiplayer (B6)
- **[DESIGN.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/multiplayer/DESIGN.md):** Peer-to-peer WebRTC DataChannels architecture, binary packet spec, dead-reckoning interpolation, and radio synchronization.
- **[poc/index.html](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/multiplayer/poc/index.html):** Zero-edit parent iframe wrapper that embeds the pristine game and renders a multiplayer overlay on top.
- **[poc/overlay.js](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/multiplayer/poc/overlay.js):** Parent canvas overlay extracting live telemetry from `iframe.contentWindow.AYLMER.G.veh` and rendering peer nametags.

#### [research/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/research/) — Historical Fact Pack (B7)
- **[AYLMER-2004.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/research/AYLMER-2004.md):** Canon Bible covering the 2002 municipal amalgamation wound, gas prices ($0.85/L), teenage minimum wage ($7.45/hr), top Outaouais songs (Les Trois Accords, K-Maro), radio dial, MSN Messenger culture, the impending 2004–05 NHL lockout, and road construction.

---

### 3. Screenshot Archive (`shots/`)
Over 25 high-resolution screenshots capturing bug reproductions, landmark visits, cast houses, vehicle rosters, and playtest criteria:
- **Bug Repros:** `a001-traffic.jpg`, `a002-cam-jitter.jpg`, `a003-bus-grass.jpg`, `a004-path-speed.jpg`, `a005-poutine-galeries.jpg`, `a006-save-midjob.jpg`, `a007-broke-e.jpg`, `a011-golf-clubhouse.jpg`, `a014-champlain-bridge.jpg`.
- **Playtest Log:** `playtest-gemini-01-menu.jpg` through `playtest-gemini-09-pause.jpg`.
- **Cast Houses:** `playtest-gemini-05-tom-house.jpg`, `playtest-gemini-05-sayyad-house.jpg`, `playtest-gemini-05-mike-house.jpg`, `playtest-gemini-05-russell-house.jpg`, `playtest-gemini-05-abraham-house.jpg`.
- **Landmarks & Sectors:** `playtest-gemini-06-galeries.jpg`, `playtest-gemini-06-marina.jpg`, `playtest-gemini-06-symmes.jpg`, `playtest-gemini-07-parliament.jpg`, `playtest-gemini-08-map.jpg`.

---

### 4. Look & Feel Pass: Summer 2004 (Part C)
- **[LOOK.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/LOOK.md):** Complete visual overhaul design document, asset catalogue, integration diffs, before/after audit, and visual proofs.
- **[showcase.html](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/showcase.html):** Interactive WebGL 3D showcase rendering houses, golden-hour atmosphere, botanical trees, and street furniture.
- **[houses_lab.html](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/houses_lab.html):** Architectural house material lab testing the 2048² atlas against engine archetypes.
- **[materials/out/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/materials/out/):** Master 2048² material atlas (`atlas.png` + `atlas.json`) with 12 seamless materials and 15 decals.
- **[facades/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/facades/):** 12 orthogonal, shadow-free, rectified building facades (299 Fraser, Symmes Inn, British Hotel, etc.).
- **[props/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/props/):** 11 cutout sprites of native Outaouais flora (Sugar Maples, White Pine, Birch, Sumac) and Gatineau municipal infrastructure (`props.json`).
- **[atmosphere/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/atmosphere/):** 3 equirectangular 2048x1024 sky panoramas and `lighting.json` presets (golden hour, midday, dusk, overcast).
- **[surfaces/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/surfaces/):** 8 seamless 512² road, sidewalk, paver, gravel, and lawn textures (`surfaces.json`).
- **[MARINA.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/MARINA.md):** Architectural and topographical specification of Aylmer Marina & Parc des Cèdres based on Google Maps and aerial drone photography, seasonal summer calibration, and drop-in `landmarks.js` replacement code.
- **[screenshots/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/screenshots/):** High-resolution visual proof screenshots.

---

### 5. Asset Scouting: Summer 2004 (Part D)
- **[CATALOGUE.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/assets/CATALOGUE.md):** Comprehensive vetted catalogue across 6 categories (Vehicles, Trees & Greenery, Street Furniture, Buildings, Textures, Sounds). **Licence is strictly the first column**, sorted by fit descending.
- **[catalogue.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/assets/catalogue.json):** Machine-readable JSON catalogue with relative paths and mesh metadata, formatted for `tools/gltf2mesh.mjs`.
- **[GAPS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/assets/GAPS.md):** Detailed gap analysis and hand-building / procedural specifications for 2004 Outaouais regional items.
- **[STATUS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/assets/STATUS.md):** Final scouting mission report, polygon budget audit, licensing compliance review, and converter hand-off.
- **[src/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/assets/src/):** 100+ local downloaded source assets (glTF 2.0 `.glb`, seamless 1024² `.jpg` textures + normal maps, and 44.1kHz `.wav`/`.ogg` audio) with license files alongside each pack.

---

### 6. Historical Calendar & Weather: Summer 2004 (Part E)
- **[summer2004.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/data/summer2004.json):** Full 73-day historical simulation dataset (Saturday 26 June 2004 to Monday 6 September 2004) for Aylmer / Ottawa CDA / Macdonald-Cartier (Environment Canada stations 6105976 & 6106000), complete with NOAA solar calculations, hourly weather states, peak humidex, wind force classifications, and dated Outaouais/Ottawa regional historical events.
- **[palette2004.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/data/palette2004.json):** Sky and ambient light RGB triplets in [0, 1] across dawn, noon, golden hour, and dusk for the six primary sky conditions, sampled from authentic Ottawa Valley photographic records.

---

### 7. Driver's-Seat Interiors Pass: Summer 2004 (BACKLOG C6)
- **[INTERIORS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/INTERIORS.md):** Complete design document, comedy rationale, vehicle specification matrix, engine integration guide, and visual proofs for all 15 vehicle cockpits.
- **[RANGER-HANDOFF.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/RANGER-HANDOFF.md):** Detailed design and engineering hand-off for Claude on Tom's starting 1993 Ford Ranger XL, photoreal visual benchmarks, verified reality checklist, and proposed WebGL2 rendering approaches.
- **[showcase.html](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/showcase.html):** Interactive cockpit viewer with rotatable steering wheel physics, wiper animation, cluster night backlighting, and 2004 Outaouais radio station simulation.
- **[interiors.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/interiors.json):** Master manifest linking plates, wheels, glass, camera offsets (`eyeHeightM`, `eyeBackM`), and regional comedy details.
- **[plates/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/plates/):** 15 albedo 2048×768 cockpit interior plates with transparent windshield viewports and period-accurate dashboards.
- **[wheels/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/wheels/):** 15 transparent 1024×1024 steering wheels and bicycle handlebars formatted for runtime rotation.
- **[glass/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/glass/):** 15 512×512 windshield dirt layers with dual wiper sweep arc boundaries and star stone chips.
- **[screenshots/](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/interiors/screenshots/):** High-resolution visual proof composites under golden-hour lighting.

---

### 8. The Cinematic Pass: Summer 2004 (PR #33)
- **[STATUS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/STATUS.md):** Executive status, delivery matrix, and master copy-paste integration tables for the engine agent.
- **[COLDOPEN.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/COLDOPEN.md):** Full shot-by-shot storyboard of the 8-second cold open sequence at 299 Chemin Fraser, father's French voiceover lines, and camera keyframes table.
- **[keys.json](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/coldopen/keys.json):** Precise mathematical camera keyframes (`{t, pos, target, fov, ease}`) in car-local metres ($+Z$ fwd, $+Y$ up, $+X$ driver left).
- **[GRADE.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/GRADE.md):** 16-point filmic tone curves, white point calibration, 3-column split-toning matrices (35mm Kodak Vision2 film stock), lens rules, and physical solar ephemeris for Aylmer at 45.4° N.
- **[BEATS.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/BEATS.md):** 1440×900 HUD mockups for the 2004 Nokia flip-phone incoming call, the 1.5s mission-passed envelope slide, seam crossing card, and Labour Day endings.
- **[SOUND.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/cinema/SOUND.md):** Master audio cue sheet detailing engine synthesis, radio stations, and CC0 Foley samples with exact dBFS levels and ducking matrix.
- **[FEEL.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/FEEL.md):** Live runtime tuning report for vehicle physics, suspension weight transfer, handbrake slide, and chase camera damping.
- **[STYLE.md](file:///Users/thomaslever/Desktop/Coding%20Projects/aylmer-madness/gemini-inbox/look/ui/STYLE.md):** 2004 Outaouais aesthetic bible, color palette, typography hierarchy, and photocopy calque mode.
