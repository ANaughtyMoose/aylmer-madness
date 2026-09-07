# Aylmer Madness — Audio Sources & Public Domain Foley References (B3)

All synthesized audio in Aylmer Madness runs entirely in vanilla code using Web Audio API nodes without external MP3/WAV dependencies.

For supplementary physical Foley recordings (e.g. door thuds, glovebox latch clicks, cassette player mechanical engagement), the following CC0 / Public Domain / Creative Commons Attribution assets are cataloged for optional offline baking or reference:

---

## Catalog of Reference Foley Sources

| Asset Description | Source / Repository | License | Target Use |
|---|---|---|---|
| **1990s Pickup Door Slam** | Freesound.org (`sound/411460`) | CC0 (Public Domain) | Ford Ranger driver door close (heavy steel clunk with window glass rattle). |
| **Ford Ignition Key Chime** | Internet Archive Open Sound | CC0 (Public Domain) | Authentic repetitive electronic chime (`ding... Ding... Ding...`) when driver door opens with key in ignition. |
| **Cassette Deck Eject / Click** | Freesound.org (`sound/368734`) | CC0 (Public Domain) | Pressing `R` to toggle radio / cassette deck. Mechanical spring release and click. |
| **Air Brake Purge Release** | Freesound.org (`sound/264284`) | CC0 (Public Domain) | STO bus coming to a complete stop at passenger shelters. |
| **Gravel Spray in Wheel Wells** | Freesound.org (`sound/512469`) | CC0 (Public Domain) | Driving fast over gravel shoulders on Chemin Fraser. |
| **Annual Cicadas (Dog-Day)** | Freesound.org (`sound/642951`) | CC0 (Public Domain) | Suburban Outaouais afternoon ambient background. |
| **1990s Ford Horn (Single Low Note)** | Freesound.org (`sound/388052`) | CC0 (Public Domain) | Ranger horn (`H` key) — hollow unenthusiastic single-tone beep. |
| **Civic Si Twin-Tone High Horn** | Freesound.org (`sound/170825`) | CC0 (Public Domain) | Sayyad's Civic horn — sharp, polite Japanese twin-tone chirp. |

---

## Attribution & Integrity Guidelines
- If any audio clip is sampled or baked into an offline array buffer, verify that the licensing is strictly CC0 or CC-BY with full attribution in this document.
- In accordance with the project's zero-dependency principles, real-time procedural synthesis via `audio.js` remains the primary runtime implementation.
