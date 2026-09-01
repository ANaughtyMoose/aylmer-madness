# Prompt for Gemini — Aylmer Madness content corpora

Paste everything below the line into Gemini. It needs no repo access and no code.
Output lands as JSON files you drop into `assets/text/`; the game reads them, so
a bad line costs a delete, never a debugging session.

Ask for ONE section at a time — the output is long and Gemini truncates.

---

You are writing content for a video game called **Aylmer Madness**: an open-world
driving game set in the real Aylmer, Québec, in the **summer of 2004**. The player
is seventeen, has just finished school, and has the keys to a father's white 1993
Ford Ranger XL — a base-trim regular-cab pickup with a 2.3 four-cylinder, a
five-speed, a whip antenna and 200,000 km on it. The whole game is in **Québécois
French** — not France French, not translated English. Joual, real Outaouais
register, the way people from Aylmer and Hull actually talked in 2004.

Aylmer in 2004: a west-end suburb of Gatineau on the Ottawa River. Chemin
d'Aylmer, rue Principale in the old village, the Galeries d'Aylmer, the marina,
Plage des Cèdres, the Champlain bridge over to Ottawa, Hull to the east, Chelsea
up the 105. Anglos and francophones mixed. Nothing to do. Everyone drives.

Cultural period markers to use, sparingly and correctly: flip phones, MSN
Messenger, burned CDs, cassette adapters, Napster's ghost, the Canadiens, the
Sens, Céline, Les Cowboys Fringants, dépanneurs, poutine, Tim Hortons, Canadian
Tire money, Petro-Canada, the SAQ, gas at about 80 cents a litre.

Rules for every section:
- Québécois French. Use joual freely: *char*, *chum*, *blonde*, *dépanneur*,
  *tabarnak*, *câlisse*, *pantoute*, *icitte*, *pis*, *ben*, *toé*, *moé*.
- Swearing is fine and correct — these are teenagers and construction workers.
  Keep it to sacres, not slurs.
- No real living people, no real business names except large chains that were
  genuinely there (Tim Hortons, Canadian Tire, Petro-Canada, Rona).
- Output valid **JSON only**, no commentary, no markdown fences.

## Section 1 — Radio (largest, do this first)

Six stations. For each: a call sign, a frequency, a format, and a personality.
Suggested: a French pop/rock station, a classic rock station, a campus/college
station, a country station, a French AM talk-and-sports station, and a weak
Ottawa English signal that fades in and out.

For each station produce:
- 8 station idents (2-6 words, the thing shouted over a jingle sting)
- 25 lines of DJ patter (1-3 sentences, between songs, in character)
- 12 radio ads for fictional local businesses — a casse-croûte, a garage, a
  used-car lot, a pool installer, a wedding hall, a driving school. Ads from
  2004 local radio are shouty, over-written, and end with an address.
- 6 news/weather/traffic stingers
- 4 contest bits ("le neuvième appelant")

```json
{"stations":[{"id":"","call":"","freq":"","format":"","persona":"",
  "idents":[],"patter":[],"ads":[{"business":"","copy":""}],
  "stingers":[],"contests":[]}]}
```

## Section 2 — Slang heckles, with English glosses

300 lines other drivers and pedestrians yell when the player drives badly.
Sort them into these triggers: `nearmiss`, `honked`, `sidewalk`, `ranred`,
`hitcar`, `hitprop`, `speeding`, `reversing`, `wrongway`, `stuck`, `cops`,
`bigair`.

Each line needs an English gloss that keeps the flavour and, where the joke does
not survive translation, one short note explaining it. The player toggles the
gloss with a hotkey, so the note is read by an anglophone friend who wants to
know why it is funny.

```json
{"heckles":[{"trigger":"","fr":"","en":"","note":""}]}
```

## Section 3 — Kijiji classified ads, 2004

40 used-car listings for a period-correct classifieds screen. Cars a teenager in
the Outaouais could actually buy in 2004: Civics, Cavaliers, Sunfires, Neons,
Escorts, Grand Ams, Tercels, an ambitious Firebird, a rusted-out Bronco, a
minivan someone's mother is selling. Prices $400 to $4,500.

The comedy is in the register: ALL CAPS, no punctuation, "AUCUN LOWBALLER JE SAIS
CE QUE J'AI", "besoin de p'tits travaux", "vendu tel quel", "sérieux seulement",
"pas de textos". Some sellers are obviously lying. One ad should be a masterpiece
of denial about the rust.

```json
{"listings":[{"title":"","year":0,"make":"","model":"","price":0,"km":0,
  "body":"","seller":"","phone":"","redFlag":""}]}
```

## Section 4 — Friend dialogue

Four characters, spoken as bubbles when a job starts and ends. Write 12 start
lines and 12 end lines each. Keep them short — one or two sentences.
- **Sayyad** — owns a Civic, lives on Denise-Friend. Confident, funny, always
  has an opinion about the music. Wears a Hawaiian shirt unironically.
- **Margaret** — older, warm, unbothered, the adult who is quietly amused by all
  of this and has better judgement than anyone else in the car.
- **Adam** — owns a Sunfire. Deadpan.
- **Ton père** — laconic, protective of the truck, absolutely serious about the
  radio presets.

```json
{"dialogue":[{"who":"","when":"start|end","line":""}]}
```

---

**When Gemini finishes each section:** save the JSON as
`assets/text/radio.json`, `heckles.json`, `kijiji.json`, `dialogue.json`. Skim
for anything that names a real person, breaks the 2004 setting, or drifts into
France French — that is the whole review, and it takes minutes. Then tell Claude
Code the files are there and it will wire them in.
