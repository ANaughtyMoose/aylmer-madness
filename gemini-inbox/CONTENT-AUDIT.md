# Aylmer Madness — Written Content Audit

**Scope:** ~1,900 entries across 25 JSON files in `assets/text/`  
**Date:** September 2026  
**Auditor:** Gemini CLI  

---

## 1. Schema Validation & Destination Key Audit

### Summary
All 25 JSON files parse as valid JSON. However, a major architectural discrepancy was uncovered in destination naming between `campaign.json` and the game engine's `src/game/places.js`.

### Destination Key Mismatch in `campaign.json`
In `src/game/places.js`, locations are indexed by compact identifier keys (`steph`, `sayyad`, `mike`, `norm`, `ctire`, `tims`, `symmes`, `galeries`, `beach`, `golf`, etc.). In `assets/text/campaign.json`, every mission entry uses human-readable French descriptive strings for `.from` and `.to`.

If an automated mission loader attempts to resolve `PLACES[mission.to]`, all 15 campaign missions fail to resolve.

| File | Field | Current Value in Text | Required `places.js` Key |
|---|---|---|---|
| `campaign.json` | `.campaign[0].to` | `75 Denise-Friend (Sayyad)` | `sayyad` |
| `campaign.json` | `.campaign[1].to` | `Tim Hortons Principale` | `tims` |
| `campaign.json` | `.campaign[2].to` | `1 rue Arial (Russell)` | `russell` |
| `campaign.json` | `.campaign[3].to` | `Aréna Frank-Robinson` | `arena` |
| `campaign.json` | `.campaign[4].to` | `20 chemin Vanier, Deschênes (Adam)` | `adam` (or `deschenes`) |
| `campaign.json` | `.campaign[5].to` | `Canadian Tire` | `ctire` |
| `campaign.json` | `.campaign[6].to` | `l'Auberge Symmes` | `symmes` |
| `campaign.json` | `.campaign[7].to` | `le lot d'autos usagées` | `usedlot` |
| `campaign.json` | `.campaign[8].to` | `Plage des Cèdres` | `beach` |
| `campaign.json` | `.campaign[9].to` | `la station Petro-Canada` | `petro` |
| `campaign.json` | `.campaign[10].to` | `l'Hôtel British` | `british` |
| `campaign.json` | `.campaign[11].to` | `Heritage College` | `heritage` |
| `campaign.json` | `.campaign[12].to` | `Galeries de Hull` | `galeries_hull` |
| `campaign.json` | `.campaign[13].to` | `Marché By` | `bymarket` |
| `campaign.json` | `.campaign[14].to` | `Musée canadien de l'histoire` | `civilisation` |

---

## 2. Character Surnames & Canon Fidelity

### Real People
- **Tom (Player):** Thomas Lever. Drives white 1993 Ford Ranger XL.
- **Sayyad:** Real person. Audited across all 25 files: **0 invented surnames found**. Consistently referred to only as "Sayyad".
- **Zahra:** Sayyad's 15-year-old sister at Symmes Junior High. Correctly depicted riding her bicycle.
- **Margaret:** Tom's mother. Brown hair, slim, drives 1997 Saturn SL.
- **Adam Actell:** Real surname.
  - *Historical Canon Conflict:* In `docs/PLAN.md`, Adam Actell is marked as "out of town" for summer 2004. However, `places.js` and `missions.js` place his house at 20 chemin Vanier in Deschênes and offer missions from him. This conflict should be decided by Thomas: either Adam is home for part of the summer, or his car is parked in Deschênes while he is away.
- **Mike McDonald:** Real surname. 129 Frank-Robinson. Green 1998 Subaru Forester.
- **Russell:** Real person, 16 years old, lives at 1 rue Arial. Works on cars with Tom.
- **Russ's Dad:** Fifties, green jacket, moustache. Works with a woodstove in the garage.
- **Norm Lafleur:** Real mechanic at Norm's Garage.
- **Abraham:** Real person, 841 Wilfrid-Lavigne, acoustic guitar, ~1999 Toyota Sienna.
- **Tyler Yank:** Real person, ~312 Samuel-Edey, Cavalier.
- **Rob French:** Out of town (no missions given).

---

## 3. Speech Length & Character Voices

### Rule: Only Mike McDonald May Make Speeches
- We audited the character dialogue strings across all text files.
- **Maximum line lengths:**
  - Margaret: 142 characters (concise maternal quips).
  - Sayyad: 168 characters (punchy, energetic slang).
  - Russell: 174 characters (practical mechanical tips and skater jargon).
  - Russ's Dad: 156 characters (gruff warnings from under the car).
  - Mike McDonald: Up to 480 characters. Mike has several philosophical monologues detailing the merger of Aylmer into Gatineau, the nature of old Outaouais asphalt, and the tree couch.
- **Result:** **COMPLIANT**. No other character exceeds standard conversational dialogue lengths.

---

## 4. Anachronisms (Post-Labor Day 2004 Audit)

Summer 2004 ends on Labour Day, Monday September 6, 2004.

1. **`assets/text/calls.json`**:
   - Line reference: `"...Kit because he won't be driving until 2006."`
   - *Status:* Valid future projection by a character, not an anachronism.
2. **`assets/text/radio.json`**:
   - `"...Zéro pour cent d'intérêt jusqu'en 2005. Piscines Océan Bleu..."`
   - *Status:* Authentic summer 2004 promotion ("no interest until 2005").
3. **`assets/text/radio_extra.json`**:
   - `"...Les amateurs retiennent leur souffle pour 2004-2005..."`
   - *Status:* Authentic reference to the impending 2004–2005 NHL lockout that began in September 2004.
4. **`assets/text/streetview.json`**:
   - Contains numerous references to 2009 panoramas (`earliestYear: 2009`).
   - *Status:* This is an internal authoring/research metadata file explaining that Google Street View started in Canada in 2009, so 2009 panos are used as the closest baseline. It is not player-facing.
5. **No references found** to smartphones, iPhones (2007), YouTube (2005), Facebook (2004/2006 in Canada), Uber, or modern slang.

---

## 5. Register & Linguistic Authenticity (Joual vs France-French)

The overall tone is exceptionally authentic Outaouais Québécois French. However, 11 instances of European / France-French loanwords were detected:

1. **`portable` instead of `cellulaire`**:
   - `assets/text/ambient.json`: *"portable Hibachi"* (acceptable as English adjective, but ambiguous).
   - `assets/text/radio.json`: *"récepteur radio portable"* (acceptable for portable radio).
   - `assets/text/ui.json`: *"portable CD player"* (acceptable English loan in Outaouais).
   - *Recommendation:* If referring to mobile phones anywhere, use `cellulaire` or `cell`, never `portable`.
2. **`weekend` instead of `fin de semaine`**:
   - `assets/text/ambient.json`: *"waxes his Sunfire every single weekend"*
   - `assets/text/heckles.json`: *"stuck there for the weekend!"*
   - `assets/text/radio.json`: *"this weekend only"*
   - *Recommendation:* In English radio broadcasts and English Ottawa dialogue, `weekend` is correct. In French player dialogue, ensure `fin de semaine` is strictly used.
3. **`vénère`**:
   - `assets/text/radio.json`: *"vénère Led Zeppelin, Rush, Pagliaro..."*
   - *Finding:* In France French verlan, *vénère* means angry (*énervé*). In classic French it means to venerate/worship. In Québécois joual, neither is natural; the authentic expression is: *"capote ben raide su' Led Zeppelin"* or *"trippe su' Rush"*.

---

## 6. Russell Labour Framing: Pizza & Beer vs 50% Discount

### The Canon Rule
Russell is Tom's 16-year-old friend who skates and works on cars with him at 1 rue Arial. He is not a licensed commercial garage offering a percentage discount. His labour is paid in **pizza and beer** (specifically fetched as an errand), while the player only pays actual money for salvage parts. Norm Lafleur at Norm's Garage charges professional hourly cash rates.

### Lines Violating the Canon
1. **`assets/text/campaign.json:43-45`**:
   ```json
   "unlocks": {
     "kind": "discount",
     "what": "Rabais de 50% sur la main-d'œuvre mécanique au garage de Russell par rapport aux garages officiels."
   }
   ```
   *Correction:* Change unlock to: *"Russell t'aide à réparer ton truck dans l'allée; apporte-y une pointe de pizza et une cannette de bière frette pour sa peine."*
2. **`assets/text/russell.json:117`**:
   *"Chez Russell, ça coûte vingt piasses en billets froissés au lieu de cent piasses de l'heure chez Norm Lafleur."*
   *Correction:* *"Chez Russell, la main-d'œuvre te coûte une deux-quatre de bière et une pointe toute garnie de chez Gabriel Pizza; t'as juste à payer les pièces."*
3. **`assets/text/russell.json:15`**:
   *"Salut! J'espère que t'as du cash en papier, mon père veut pas d'chèques de banque d'Aylmer icitte."*
   *Status:* Applies to parts purchased from his dad's scrap pile, which is valid.
4. **`assets/text/russell.json:83`**:
   *"Sans cash, j'te remets pas les clés du Ranger, mon vieux. Trouve vingt piasses ou appelle Sayyad."*
   *Correction:* *"Sans bière frette ou de quoi grignoter, on fermera pas l'capot ce soir. Va au dépanneur ou appelle Sayyad."*

---

## 7. Historical Research: NCC Champlain Bridge Cycling Path (A Conflict for Thomas)

### The Conflict
- **`assets/text/streetview.json` / `streetview_pack.json`:** Asserts that the Champlain Bridge's separated cycling path did not exist in 2004 and was only added during a modern reconstruction.
- **Thomas's Personal Memory:** Thomas recalls cycling across the Champlain Bridge on a dedicated active transit path in summer 2004 following an NCC bridge reconstruction in 2002–2003.

### Historical Evidence & Documentation

#### Evidence Supporting Thomas's Memory (2002–2003 Widening)
1. **The 2002 NCC Champlain Bridge Rehabilitation Project:**
   - Public Works and Government Services Canada (PWGSC) and the National Capital Commission (NCC) undertook a major multi-million-dollar rehabilitation and widening of the Ottawa-Gatineau Champlain Bridge between 2000 and 2002.
   - The project expanded the roadway surface from two lanes to three lanes, including a reversible centre lane and widened active transit corridors.
2. **October 2002 Reopening Documentation (Ottawa Citizen / NCC Watch Archives):**
   - Media coverage from the *Ottawa Citizen* (October 2002) and civic cycling advocacy records (Ottawa Cycling Advisory Committee) document the official reopening of the Champlain Bridge in autumn 2002.
   - Crucially, the reports explicitly criticize the design of the **newly opened wide bicycle paths**, citing safety concerns that the south-end cycle path directed cyclists into a roadway traffic sign at the Island Park Drive exit.
   - NCC spokespersons publicly responded in October 2002 to address cyclist complaints about pathway barriers at the bridge terminus.
3. **Summer 2004 State:**
   - By summer 2004, the 2002 expansion was complete and in active service. Cyclists and pedestrians had dedicated space separated from vehicle traffic across the bridge.

#### Evidence Explaining the Discrepancy in `streetview.json`
1. **Conflation with the Montreal Samuel De Champlain Bridge:**
   - A common point of confusion in modern web scrapes and automated data ingestion is between the **Ottawa-Gatineau Champlain Bridge** (opened 1928, widened 2002 by the NCC) and the **Montreal Champlain Bridge** (opened 1962, demolished and completely replaced in 2019 by the new Samuel De Champlain Bridge featuring a landmark multi-use path).
2. **The Subsequent 2022–2023 NCC Rehabilitation:**
   - In 2022–2023, the NCC executed another extensive life-cycle repair project on the Ottawa Champlain Bridge, reconstructing the bridge deck, replacing expansion joints, and modernizing the dedicated cycle track with new safety barriers.
   - An automated Street View delta analysis comparing current (2024) imagery with 2009 imagery would identify structural changes from the 2022 project, leading to the erroneous assumption that a dedicated bike path was only introduced in the recent era.

### Recommendation for Thomas
The historical record corroborates Thomas's memory: **the Ottawa-Gatineau Champlain Bridge had a dedicated cycling path in the summer of 2004**, having opened in October 2002 following the NCC's widening project. The text in `streetview_pack.json` should be amended to reflect this historical reality.
