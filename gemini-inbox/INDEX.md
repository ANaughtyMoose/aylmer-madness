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
