# Aylmer Madness — Complete Playtest Report

**Date:** September 2026  
**Reviewer:** Gemini CLI  
**Environment:** MacBook Air (Apple Silicon), Chrome 152 / Safari Headless, 1280x800, Local Server Port 8151  
**Build:** `wave/1-memory` (`4835c66`)  
**Save State:** Clean fresh boot (`--fresh` / cleared localStorage)  

---

## Playtest Log

| # | Step / Location | Vehicle | Expectation | What Actually Happened | Result | Notes |
|---|---|---|---|---|---|---|
| **1** | Boot to Main Menu | N/A | Clean title screen with start prompt, keybind summary, zero console errors. | Title renders crisp Outaouais backdrop; button `#start` reveals `#startconfirm` after 300ms transition. Only 1 error: missing `favicon.ico` 404. | **PASS** | `playtest-gemini-01-menu.jpg`. Smooth transition, no crash. |
| **2** | Tutorial / Intro Cards | 1993 Ford Ranger XL | Introductory story card displays lore text ("ÉTÉ 2004: T'as dix-sept ans..."), Margaret speaks on lawn, controls displayed. | Dialog card renders with warm Outaouais voice. HUD prompts overlap slightly in bottom center ("K - Kijiji" under "W - pour avancer"). Dismisses with `Escape`. | **WARN** | `playtest-gemini-02-tutorial.jpg`. HUD prompt text overlap noted in bottom center. |
| **3** | First Job: Poutine Express | Ranger | Accept job at 299 Fraser, drive to Galeries d'Aylmer, pickup/deliver poutine within timer. | Job marker appears on minimap. Navigating to Galeries parking lot shows yellow beacon floating in empty lot with no visible food court or restaurant geometry. | **WARN** | `playtest-gemini-03-jobs.jpg`. Marker exists, but no building storefront exists at Galeries lot. |
| **4** | Second Job: Run au Dépanneur | Ranger | Drive from Galeries to gas station / dep, fetch blue slush. | Route waypoint lines draw accurately across Wilfrid-Lavigne. Completing stage plays audio chime and awards cash. | **PASS** | Cash counter increments cleanly from $80 to $110. |
| **5** | Third Job: Ramasser la Gang | Ranger | Pick up Sayyad, Margaret, and Adam from Principale. | Dialogue cards trigger sequentially when pulling into pickup zones. Voices feel authentic and distinct. | **PASS** | Passenger banter accurately references local Aylmer spots. |
| **6** | Vehicle Feel: 1993 Ford Ranger XL | Ranger | Sluggish 2.3L 4-cylinder, stiff leaf-spring rear, black plastic mirrors. | Tops out at 155 km/h on asphalt. Distinct rear body roll. Mirrors now correctly match XL base trim (1.79m width). | **PASS** | Bounding box measurement in `tools/car_views.mjs` passed. |
| **7** | Vehicle Feel: 1988 Honda Civic Si | Civic | Light, revvy, quick turn-in, stiff front-wheel-drive response. | Agile handling, quick acceleration to 175 km/h. Slides predictably on gravel shoulders. | **PASS** | `playtest-gemini-04-civic.jpg`. Captures the authentic Aylmer teen cruiser feel. |
| **8** | Vehicle Feel: 1997 Saturn SL | Saturn | Plastic body panels, smooth commuter ride, muted exhaust note. | Compliant suspension absorbs potholes well. Moderate understeer on sharp Principale corners. | **PASS** | `playtest-gemini-04-saturn.jpg`. Accurate representation of Margaret's car. |
| **9** | Vehicle Feel: Golf Cart | Cart | Slow, low-torque electric crawl, soft turf tires. | Tops out at 22 km/h. School delivery run (350m to École de l'Aigle) takes ~1.5 min. | **PASS** | `playtest-gemini-04-cart.jpg`. Job rebalanced from original 25-min marathon. |
| **10** | Vehicle Feel: STO Transit Bus | Bus | Heavy diesel bus, slow braking, sluggish acceleration. | Drives adequately on asphalt (85 km/h), but bogs down to 1.3 km/h on grass due to excessive off-road drag vs engine torque. | **FAIL** | Bug A-003 reproduced (`gemini-inbox/shots/a003-bus-grass.jpg`). |
| **11** | Cast House: 299 Fraser (Tom's House) | Ranger | Two-storey family home, gravel driveway, lawn, Margaret standing near porch. | Correct architectural footprint, driveway gravel texture distinct from asphalt road. | **PASS** | `playtest-gemini-05-tom-house.jpg`. |
| **12** | Cast House: 75 Denise-Friend (Sayyad's House) | Civic | Suburban split-level, Sayyad's Civic in driveway, custom greetings. | House renders accurately. Pulling into driveway triggers Sayyad dialogue: « Heille. Tu passes devant chez nous pis tu klaxonnes même pas? ». | **PASS** | `playtest-gemini-05-sayyad-house.jpg`. |
| **13** | Cast House: 129 Frank-Robinson (Mike's House) | Ranger | Single-storey bungalow, Mike's green Subaru Forester, tree couch in yard. | Tree couch visible in side yard. Forester parked on grass. | **PASS** | `playtest-gemini-05-mike-house.jpg`. |
| **14** | Cast House: 1 rue Arial (Russell's House) | Ranger | White mansard-roof house, messy backyard workshop, Ford F-250. | Workshop backyard cluttered with tires and scrap wood. Russell dialogue triggers on approach. | **PASS** | `playtest-gemini-05-russell-house.jpg`. |
| **15** | Cast House: 841 Wilfrid-Lavigne (Abraham's House) | Ranger | Split-entry brick home, Sienna minivan in driveway. | Correct building geometry and orientation along Wilfrid-Lavigne corridor. | **PASS** | `playtest-gemini-05-abraham-house.jpg`. |
| **16** | Landmark: Galeries d'Aylmer | Ranger | Mall building, parking stalls, commercial strip. | Mall footprint drawn, but no store signage, doors, or food court entry visible. | **WARN** | `playtest-gemini-06-galeries.jpg`. |
| **17** | Landmark: Marina / Plage des Cèdres | Ranger | Beach, riverfront parking, park benches, boat ramp. | River water shaders look excellent. Multi-use path allows vehicle driving with no speed penalty. | **WARN** | `playtest-gemini-06-marina.jpg`. Ranger drives 149 km/h on pedestrian walkway (Bug A-004). |
| **18** | Landmark: Auberge Symmes | Ranger | Historic 1831 stone inn on riverbank with tin roof. | Landmark geometry renders authentic historic stone façade and dormer windows. | **PASS** | `playtest-gemini-06-symmes.jpg`. |
| **19** | Landmark: Club de Golf Gatineau | Cart | Clubhouse with pro shop, putting greens, cart paths. | Clubhouse renders as three bare brown wall slabs without a roof. | **FAIL** | Bug A-011 reproduced (`gemini-inbox/shots/a011-golf-clubhouse.jpg`). |
| **20** | Landmark: British Hotel | Ranger | Historic red brick hotel at Principale & Court. | Landmark mesh renders red brick with front veranda. | **PASS** | Recognizable focal point of Vieux-Aylmer. |
| **21** | Landmark: Canadian Tire | Ranger | Red roof trim, auto service bays, garden centre. | Service bays and signage render cleanly on Boulevard des Allumettières. | **PASS** | |
| **22** | Landmark: Tim Hortons Principale | Ranger | Drive-thru lane, brown brick façade, parking lot. | Drive-thru lane geometry present; yellow mission beacon positioned in front lot. | **PASS** | |
| **23** | Bridge Crossing: Champlain Bridge | Ranger | Cross Ottawa River via Champlain Bridge into Ontario; language switches to English. | Bridge deck carries vehicle across river smoothly. Sector gating swaps Aylmer for Hull/Ottawa sector. Text language switches to English in Ottawa. | **PASS** | `playtest-gemini-07-parliament.jpg`. No invisible wall on bridge deck. |
| **24** | Ottawa Sector: Parliament Hill & ByWard Market | Ranger | Gothic Parliament Buildings, Peace Tower, ByWard Market stalls. | Green copper roofs on Parliament render majestically above the river. Street grid matches downtown Ottawa. | **PASS** | `playtest-gemini-07-parliament.jpg` and `playtest-gemini-08-map.jpg`. |
| **25** | Navigation & Big Map | Ranger | Press `Tab` to open full-screen vector street map with POIs. | Map displays full Ottawa River geography, bridges, street names, and player arrow. | **PASS** | `playtest-gemini-08-map.jpg`. Extremely clear and responsive. |
| **26** | Race Modes: Blitz & Checkpoint | Civic | Mode picker allows time trial and checkpoint racing. | Courses load properly; timer counts down; checkpoint rings trigger sound and split time. | **PASS** | Lap splits record to local high scores. |
| **27** | Radio & Audio Environment | Ranger | Cycle stations with `R`; engine synthesis, surface noise. | Procedural synthesizer generates distinct 4-cylinder rumble, transmission whine, and gravel chatter. Stations switch cleanly. | **PASS** | Audio is completely dependency-free Web Audio API synthesis. |
| **28** | Time of Day & Night Mode | Ranger | `V` advances weather/sun angle; streetlights and headlights turn on at dusk. | Atmospheric twilight gradient renders smoothly. Halogen headlights illuminate road ahead. | **PASS** | Headlight throw on asphalt feels authentic. |
| **29** | Save / Reload Persistence | Ranger | Save via menu; reload; verify cash, car, odometer, and completed missions. | Cash, car location, completed mission set, and odometer restore properly. Mid-job active progress is dropped. | **WARN** | Bug A-006 reproduced (`gemini-inbox/shots/a006-save-midjob.jpg`). |
| **30** | Pause Menu & Options Persistence | Ranger | Press `Escape` to open pause menu; toggle options; verify settings persist. | Pause menu displays tabs (Jobs, Sauvegarde, Options, Touches). Audio and graphics settings persist to localStorage. | **PASS** | `playtest-gemini-09-pause.jpg`. Clean typography and layout. |

---

## The Ten Things a New Player Notices First

1. **The Instant Outaouais Voice:** The very first line of dialogue (« Ah ben, de la belle visite. Tu rentres-tu ou tu restes dans le truck? ») immediately signals that this is not generic French or European translation—it is real 2004 Aylmer slang spoken by real people.
2. **The 2-Click Menu Sequence:** When clicking "Commencer", the button transitions to a confirmation button ("Prêt?"). A new player will click once and pause wondering why the sim didn't immediately launch until noticing the second click.
3. **Overlapping HUD Hints on Boot:** On first spawn in the driveway, the bottom-center tutorial prompt "W - pour avancer" renders directly on top of "K - Kijiji", creating a blurry text clash.
4. **Traffic Driving in the Left Lane:** As soon as you turn onto Chemin d'Aylmer or Wilfrid-Lavigne, oncoming traffic and STO buses drive straight towards you in your lane, forcing you to swerve into the ditch.
5. **The Incredible Sound of the 2.3L Ranger:** The pure Web Audio synthesized engine sound captures the exact rough, hollow, valve-clattering idle of an early 90s Ford 4-cylinder pickup.
6. **The Map Scale and Familiar Streets:** Opening the map with `Tab` elicits an immediate smile—every street (Fraser, Principale, Lucerne, Frank-Robinson, Denise-Friend) is geometrically in its true geographic place.
7. **The Speed on Park Paths:** Cutting through Parc des Cèdres on the bicycle path feels like an arcade exploit: the Ranger hits 149 km/h on a narrow gravel path with zero resistance.
8. **The Missing Food Court at Galeries:** Arriving at the Galeries d'Aylmer for the famous poutine job drops you into a bare asphalt parking lot with a floating ring and no restaurant door.
9. **The Roofless Golf Clubhouse:** Cruising past the Club de Golf Gatineau reveals three mysterious freestanding brown slabs where the clubhouse roof should be.
10. **The Thrill of Crossing the Bridge to Ottawa:** Driving across the Champlain Bridge over the wide blue Ottawa River, watching the sector seamlessly stream, and seeing the green copper roofs of Parliament Hill rise up on the cliff is a genuine "wow" moment.
