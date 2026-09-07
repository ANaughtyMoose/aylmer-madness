# Aylmer Madness — Campaign Narrative Critique & Story Architecture (B5)

**Document:** `gemini-inbox/story/STORY-NOTES.md`  
**Companion File:** `gemini-inbox/story/campaign.v2.json`  
**Author:** Gemini CLI  
**Date:** September 2026  

---

## 1. Executive Summary & Narrative Arc

The 15-mission narrative of *Aylmer Madness* succeeds where many open-world indie games fail: it is rooted in **deep local specificity**. It does not attempt to be generic North American suburbia; it is unmistakably **Aylmer, Québec in the final golden weeks of summer 2004** (ending on Labour Day, September 6, 2004).

The narrative structure follows a classic coming-of-age arc framed entirely through vehicular autonomy:
1. **Act I: The Perimeter (Missions 1–5):** Small-radius domestic errands confined to Fraser, Denise-Friend, and Old Aylmer. The stakes are small (CDs, coffee, poutine, fan belts), establishing the handling limits of the 1993 Ford Ranger XL and the tight-knit social geography of the town.
2. **Act II: The Working Summer (Missions 6–10):** Expanding eastwards towards the highway, the used car lot, and the marina. The player learns the town's informal economy—trading favors with Russell, hauling building supplies for Mike, and escaping evening curfews.
3. **Act III: Crossing the River (Missions 11–15):** The horizon expands across the provincial boundary. Traversing the Champlain Bridge into Ottawa, navigating the unfamiliar English-speaking streets of the ByWard Market and Parliament Hill, and racing back before the Labour Day sunset marks the close of adolescence.

---

## 2. Character Arc Critiques

### Tom (The Player)
- **Voice:** Largely silent protagonist who communicates through choices, driving skill, and radio selections.
- **Arc:** Starts as a nervous seventeen-year-old with a probationary permit and a stiff clutch; ends as the reliable wheels of the friend group who knows every back alley between Fraser and Wellington Street.

### Sayyad
- **Strength:** Exceptional dialogue voice. His quips (« Deux grosses. Sauce à part. Pis grouille, le fromage attend pas ») establish him as the irrepressible, loyal copilot.
- **Canon Note:** Kept strictly authentic—no invented surnames, wears Hawaiian shirts, cruises on his chrome bicycle when not riding shotgun. He never acts cynical; his enthusiasm drives the early pacing.

### Zahra
- **Role:** Sayyad's 15-year-old sister. She attends Symmes Junior High and rides a mountain bike.
- **Narrative Value:** Essential bridge between the automobile road network and Aylmer's off-road pedestrian/bike pathways. She knows which pathways connect Lucerne to the beach without hitting traffic lights.

### Margaret (Tom's Mother)
- **Tone:** Grounded, affectionate Outaouais mother. Her lines are concise, warm, and slightly wry. She is never an obstacle; she is the hearth at 299 Fraser reminding Tom that supper is on the stove and gas costs money.

### Russell & Russ's Dad (1 rue Arial)
- **Narrative Core:** The mechanical soul of the game. Russell's backyard workshop is where things get fixed not through professional corporate service, but through resourcefulness, scrap parts, and shared labor.
- **Key Revision in V2:** In `campaign.json`, Mission 3 framed Russell's reward as a *"50% discount on garage labor"*. This was a corporate video-game artifact that violated character canon. In `campaign.v2.json`, this is corrected to **pizza and beer**: Russell works for free with his buddy; the player pays for scrap parts, and labor is rewarded with an all-dressed pizza from Gabriel Pizza on Principale.

### Mike McDonald (129 Frank-Robinson)
- **The Speech Rule:** Mike is the **only character in the game allowed to make long philosophical speeches**.
- **Thematic Weight:** While the rest of the gang talks about immediate teen concerns (cars, girls, beach bonfires), Mike reflects on the broader historical shifts: the recent 2002 municipal amalgamation that erased the independent Town of Aylmer into the mega-city of Gatineau, the nature of old Outaouais asphalt, and the sanctity of his backyard tree couch. His monologues anchor the game in real political and geographic history.

---

## 3. Structural Revisions Applied in `campaign.v2.json`

1. **Machine Key Standardization:** Replaced all natural-language `.from` and `.to` strings (`"75 Denise-Friend (Sayyad)"`) with exact machine-readable keys (`"sayyad"`, `"tims"`, `"russell"`, `"arena"`, `"ctire"`, `"symmes"`, `"beach"`, `"petro"`, `"british"`, `"heritage"`, `"galeries_hull"`, `"bymarket"`, `"civilisation"`) to ensure automated engine loading never throws runtime key exceptions.
2. **Russell Labour Rewrite:** Completely rewrote the setup, complications, and unlock conditions for Russell's garage, explicitly defining his reward as pizza and beer trade rather than commercial hourly discounts.
3. **Temporal Progression:** Enforced clear chronological time-of-day progression across the 15 missions, starting with bright early-morning July sun and culminating in the dusk of Labour Day weekend.
4. **Dialogue Register Polish:** Ensured 100% Outaouais Joual cadence across all player-facing dialogue strings while preserving clean bilingual switches during Ottawa excursions.
