# Aylmer Madness — the real summer of 2004, day by day (Gemini 3.8 Flash)

Paste everything below the line into Gemini (Antigravity or the app; no repo access needed).

---

You are producing a data file for a video game set in Aylmer, Québec (Gatineau, on the Ottawa
River, 45.4° N, 75.8° W) in the **summer of 2004**. The game has a calendar that runs from
**Saturday 26 June 2004 to Monday 6 September 2004** (Labour Day), 73 days, and each day needs
the real weather and the real daylight so the town looks and feels like that day actually did.

Output **valid JSON only**, one object per day, as an array, no commentary:

```
{
  "date": "2004-06-26", "dow": "Sat",
  "sunrise": "05:17", "sunset": "20:55",            // local time, EDT, for Ottawa
  "tmaxC": 26.1, "tminC": 14.8, "precipMm": 0.0,     // Environment Canada daily record, Ottawa CDA or Ottawa Macdonald-Cartier
  "sky": "clear" | "fair" | "cloudy" | "overcast" | "showers" | "rain" | "thunderstorm" | "fog",
  "humidex": 34,                                     // if there was one worth mentioning, else null
  "wind": "light" | "breezy" | "windy",
  "note": "…",                                       // one line, only if true and sourced: a heat warning, a storm, smoke, a holiday
  "events": ["…"]                                    // real things that happened in the region that day, sourced: Canada Day, Bluesfest 2004 headliners, the June 28 federal election, Expos games, the Sens, a Gatineau festival, a Cowboys Fringants show, the NHL lockout news. Empty array if nothing.
  "confidence": "high" | "medium" | "low"
}
```

Rules:
- **Use the Environment Canada historical climate data** for Ottawa (station Ottawa CDA 6105976
  or Ottawa Macdonald-Cartier Int'l 6106000) for temperatures and precipitation. Do not invent a
  number. If a day is missing, say `null` and mark confidence low.
- Sunrise and sunset from a proper solar calculation for Ottawa, EDT (UTC−4), to the minute.
- `sky` is your best reading of the day from the record (precip, and the hourly obs if you can
  reach them); mark confidence accordingly.
- Events must be real and dated. Bluesfest 2004 ran 8–18 July at LeBreton Flats; the federal
  election was Monday 28 June; Canada Day is 1 July; the Expos' last home stand was late
  September so most of their summer games are away — check. If you are not sure, leave it out.
- Nothing after 6 September 2004 exists.

Deliver the array as `summer2004.json`. Then, in a second short JSON, `palette2004.json`, the
sky and light for the six kinds of `sky` above at dawn, noon, golden hour and dusk, as RGB
triplets in 0–1 sampled from real Ottawa Valley photographs, with the source of each.
