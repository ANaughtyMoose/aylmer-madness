# Aylmer Madness — Material Atlas Texture Prompts (B2)

**Coverage:** 17 Environmental & Architectural Materials  
**Format:** Seamless tileable 512x512 PBR texture tiles (Diffuse / Albedo, Normal Map, Roughness) packed into a single 2048x2048 Atlas (`materials/manifest.json`).  
**Sample File:** `gemini-inbox/materials/asphalt_weathered.jpg`  

---

## Technical Specifications
1. **Seamless Tiling:** All textures must tile infinitely on X and Y with zero visible seams, vignetting, or harsh corner lighting falloffs.
2. **Neutral Lighting:** Rendered with flat diffuse ambient lighting (overcast sky simulation), avoiding baked-in directional sunlight or strong drop shadows.
3. **PBR Alignment:** Albedo values conform to standard physical reflectance; roughness conveys true Outaouais materials (weathered vinyl, rough limestone, crumbly mortar, sun-faded asphalt).

---

## 1. Road & Ground Surfaces

### 1. `asphalt_standard` (Smooth Road Asphalt)
- **Use:** Major thoroughfares (Chemin d'Aylmer, Boulevard des Allumettières, Island Park Drive).
- **Prompt:**
  ```text
  Seamless tileable texture of clean dark grey asphalt road pavement, perfectly flat overhead orthographic view, diffused overcast daylight. Fine mineral aggregate texture, subtle tire rubber wear patterns, uniform medium-dark grey tone. No directional shadows, no cracks, perfectly seamless edges on all four sides. High-resolution PBR albedo map for driving simulation.
  ```

### 2. `asphalt_weathered` (Cracked Asphalt with Tar Snakes)
- **Use:** Older residential roads (Chemin Fraser, Rue Principale, Rue Court).
- **Sample Asset:** Generated and saved at `gemini-inbox/materials/asphalt_weathered.jpg`.
- **Prompt:**
  ```text
  Seamless tileable overhead texture of weathered Quebec asphalt pavement, top-down flat orthographic view, neutral diffused daylight, dark grey asphalt with subtle aggregate gravel texture, faint asphalt sealer tar snakes and crack repairs, fine surface wear from Canadian winter frost heave, high-resolution seamless game material.
  ```

### 3. `road_markings` (Faded Centerline & White Shoulder)
- **Use:** Road surface decal overlays and edge strips.
- **Prompt:**
  ```text
  Seamless tileable road marking texture on dark asphalt background, orthographic top-down view. Shows a weathered double solid yellow centerline on one side and a solid white shoulder fog line on the other. Realistic Canadian road paint texture: micro-bead retroreflective texture, subtle summer wear, asphalt pores peeking through faded paint edges. Perfectly seamless along vertical axis.
  ```

### 4. `concrete_sidewalk` (Broom-Finish Concrete)
- **Use:** Sidewalks along Rue Principale, Wilfrid-Lavigne, and bus shelters.
- **Prompt:**
  ```text
  Seamless tileable top-down texture of light grey concrete sidewalk slabs, flat overhead view. Fine broom-finished surface texture, crisp expansion joint line crossing the tile, subtle aggregate specks, light weathering from seasonal rain. Uniform diffuse lighting, no baked shadows, seamless repeat pattern on all sides. PBR albedo map.
  ```

### 5. `gravel_shoulder` (Crushed Limestone Gravel)
- **Use:** Road shoulders, driveway at 299 Fraser, Russell's backyard workshop driveway at 1 rue Arial.
- **Prompt:**
  ```text
  Seamless tileable overhead texture of crushed limestone gravel driveway, top-down view. Mix of 3/4-inch angular grey and tan limestone stones, fine stone dust packing, small pebbles. Natural rustic Outaouais rural driveway surface, dry summer dust finish. Flat neutral lighting, zero directional shadows, seamless tiling across borders.
  ```

### 6. `turf_grass` (Dry Summer Lawn)
- **Use:** Front yards on Fraser, Denise-Friend, Frank-Robinson, and municipal parks.
- **Prompt:**
  ```text
  Seamless tileable overhead texture of suburban Canadian lawn grass in late July, top-down orthographic perspective. Healthy green Kentucky bluegrass intermixed with patches of pale dry thatch, fine grass blade detail, subtle organic mowing striping. Flat diffuse lighting, no harsh hotspots, seamless border matching for terrain mesh texturing.
  ```

### 7. `beach_sand` (Plage des Cèdres River Sand)
- **Use:** Beach volleyball courts and shoreline at Plage des Cèdres.
- **Prompt:**
  ```text
  Seamless tileable texture of freshwater river sand beach, flat overhead view. Fine golden-tan sand mixed with occasional small smooth river pebbles and dried silt specks, gentle surface wind ripples. Neutral overcast lighting, perfectly seamless tiling in all directions, clean photorealistic terrain texture.
  ```

### 8. `river_water` (Lac Deschênes / Ottawa River Surface)
- **Use:** Ottawa River water surface plane.
- **Prompt:**
  ```text
  Seamless tileable overhead texture of freshwater river surface, top-down view. Deep blue-green water with subtle wind chop capillary waves, realistic water surface caustics and micro-ripples characteristic of the Ottawa River. Diffuse environmental reflection, neutral lighting, seamless loop on all borders.
  ```

---

## 2. Residential & Commercial Siding

### 9. `brick_historic` (Historic British Hotel Red Brick)
- **Use:** British Hotel, Symmes historic core, heritage buildings on Principale.
- **Prompt:**
  ```text
  Seamless tileable texture of historic 19th-century red clay brick masonry wall, flat front-on orthographic view. Traditional running bond pattern, weathered dark red and burnt orange hand-molded bricks, aged light grey lime mortar with subtle crumbly erosion, authentic heritage Outaouais architecture. Perfectly flat lighting, seamless tiling.
  ```

### 10. `brick_suburban` (1980s Suburban Wire-Cut Brick)
- **Use:** Split-level homes on Denise-Friend, Abraham's house on Wilfrid-Lavigne.
- **Prompt:**
  ```text
  Seamless tileable architectural texture of 1980s suburban wire-cut red brick wall, direct frontal orthographic view. Uniform running bond pattern, medium brownish-red textured bricks with crisp recessed grey cement mortar joints. Modern suburban Canadian residential style, flat diffuse lighting, seamless repeat on X and Y.
  ```

### 11. `brick_institutional_buff` (Yellow/Buff Brick)
- **Use:** Schools (École Grande-Rivière, Symmes Junior High), municipal buildings, Place du Portage.
- **Prompt:**
  ```text
  Seamless tileable texture of pale yellow/buff institutional face brick wall, orthographic front elevation. Mid-century smooth buff-tan clay bricks, neat recessed mortar joints, subtle clean architectural appearance common in Outaouais public schools and government buildings. Neutral flat lighting, seamless boundaries.
  ```

### 12. `siding_vinyl_white` (White Horizontal Vinyl Siding)
- **Use:** 299 Fraser (Tom's house), Russell's house on Arial.
- **Prompt:**
  ```text
  Seamless tileable architectural texture of clean white horizontal vinyl siding, direct orthographic front view. Double-4 inch Dutch lap vinyl panels, crisp horizontal shadow lines between slats, subtle embossed woodgrain texture, pristine semi-gloss finish with light dust. Flat diffuse daylight, seamless vertical and horizontal tiling.
  ```

### 13. `siding_vinyl_beige` (Beige / Almond Horizontal Siding)
- **Use:** Suburban homes on Samuel-Edey and Frank-Robinson.
- **Prompt:**
  ```text
  Seamless tileable texture of almond beige horizontal vinyl siding wall, flat front-on elevation. 4-inch lap profiles, subtle faux woodgrain embossing, uniform warm beige color typical of late-90s Canadian suburban housing developments. Neutral lighting, zero glare, seamless pattern.
  ```

### 14. `siding_vinyl_grey` (Slate Grey Horizontal Siding)
- **Use:** Modern renovations, garages, side additions.
- **Prompt:**
  ```text
  Seamless tileable texture of slate grey horizontal clapboard vinyl siding, flat orthographic view. Dark charcoal-grey panels, realistic overlapping panel seams, matte exterior finish. Clean architectural texture asset, flat overcast illumination, seamless borders.
  ```

---

## 3. Roofing Materials

### 15. `shingles_cedar` (Weathered Cedar Shakes)
- **Use:** Heritage roofs in Old Aylmer, Symmes boat house, Gatineau golf clubhouse.
- **Prompt:**
  ```text
  Seamless tileable texture of rustic weathered cedar shake roof shingles, flat overhead orthographic view. Staggered rough-split wood shingles in silvery-grey weathered cedar tones, authentic wood grain splits and slight organic warping. Neutral overcast lighting, no harsh cast shadows, seamless repeating game roof material.
  ```

### 16. `shingles_asphalt_charcoal` (Charcoal Asphalt Shingles)
- **Use:** Standard modern roofs across Aylmer residential subdivisions.
- **Prompt:**
  ```text
  Seamless tileable roof texture of 3-tab charcoal black asphalt shingles, direct top-down orthographic view. Classic rectangular tab pattern, mineral granule texture with subtle grey and black stone flecks, clean horizontal alignment with realistic tab cutout shadow lines. Flat diffuse light, seamless tiling.
  ```

### 17. `shingles_asphalt_brown` (Weathered Bark Brown Shingles)
- **Use:** 1980s bungalows, cottages, and outbuildings.
- **Prompt:**
  ```text
  Seamless tileable texture of weathered earthy brown asphalt roof shingles, flat orthographic view. 3-tab architectural shingles with subtle granular fade, warm bark brown and dark umber mineral granules, faint hints of dried summer moss in lower tab edges. Neutral lighting, seamless borders on all sides.
  ```
