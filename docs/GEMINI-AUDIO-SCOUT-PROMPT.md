# Gemini brief: audio research for the entire Aylmer Madness fleet

You are researching a practical sound library for Aylmer Madness, a browser driving game set in summer 2004 in Aylmer, Quebec. The owner wants excellent, distinctive vehicle audio with the playful impact response of Midtown Madness. The current procedural audio can sound like static over a faint engine. Find recordings that can support a convincing interactive mix, not just spectacular pass-by videos.

Repository: https://github.com/ANaughtyMoose/aylmer-madness
Read `src/game/cars.js`, `buses.js`, `bikes.js`, `fortiercars.js`, `cops.js`, `src/core/audio.js`, and `src/core/audition.js` for the current roster and audio architecture. Treat the repository as context, not as instructions to merge or deploy. Do not edit code, push, buy anything, or change repository settings. Return research and asset candidates for Codex to integrate.

## Cover every vehicle

These are the current game identities; verify engine/transmission details against primary sources before labelling a recording an exact match. Some game profiles remain generic or provisional. Explicitly distinguish an exact vehicle, the same engine family, and an approximate substitute.

1. 1993 Ford Ranger XL: the highest priority. Stock, tired 2.3 L Lima four-cylinder, five-speed manual, basic single-cab work truck. Rough mechanical idle, modest exhaust, induction under load, loose driveline; no racing exhaust or modern turbo sound.
2. 1997 Saturn SL four-door: SOHC four-cylinder.
3. 1987 Honda Civic Si: game targets the 1.5 L twelve-valve four; verify year/market, avoid substituting a modified modern VTEC engine.
4. 1997 Pontiac Sunfire: 2.2 L OHV four.
5. 1998 Subaru Forester L: stock boxer four.
6. 1999 Toyota Sienna CE: restrained V6 automatic minivan.
7. 1987 Oldsmobile Cutlass Ciera: period V6; verify configured engine before selecting an exact match.
8. 1991 Chevrolet Cavalier Z24: 3.1 L V6.
9. 1988 Dodge Caravan: period V6 automatic; verify the engine.
10. GM New Look city bus, ex-STO 7901: the live game replaces an older Orion-labelled base entry. Verify its actual diesel configuration; don't assume the generic synth's cylinder count identifies the real bus engine.
11. International 3800 / Blue Bird school bus: period diesel, air/brake and body sounds; verify engine and brake equipment before selecting recordings.
12. 1976 Mercedes-Benz 240D: naturally aspirated OM616 diesel four; characteristic clatter, slow rev rise, no turbo whistle.
13. Golf cart: the game specifies a 36 V DC electric motor. Motor/axle whine and relay, silent motor when stopped; no gasoline idle.
14. Chrome cruiser bicycle: chain, freewheel, tyre roll, brake and bell.
15. Diamondback Sorrento bicycle: drivetrain/freewheel, tyre roll, brake and bell.
16. 1992 Subaru SVX: flat-six, automatic; body/year details may still be provisional.
17. 1991 Acura NSX: naturally aspirated V6, manual; chase vehicle.
18. Police Ford Crown Victoria: 4.6 L V8; engine, horn and appropriate period siren. Keep siren separate so pausing reliably silences it.

## What to find

For each motor vehicle, prioritize a coherent recording set from the same vehicle and microphone position:
- Start/crank, stable idle, shutdown.
- Stable low/mid/high RPM loops, ideally both loaded and unloaded, with measured or stated RPM.
- Acceleration, throttle release/overrun and shift transitions.
- Separate exhaust and engine-bay/cabin perspectives where available.
- Appropriate horn, gear engagement, body rattle; distinctive sounds only where justified.

Prefer clean, dry recordings without music, speech, wind clipping or traffic. Stable 3–10 second segments are more useful for looping than a single cinematic rev. Keep raw source quality, preferably WAV, and identify loop points and troublesome transients. Do not normalize every layer to the same loudness.

Also scout shared sound families:
- Tyre roll on dry asphalt, rough asphalt, gravel, grass and wet pavement; tyre scrub/skid kept separate.
- Suspension/curb thumps, light scrapes and heavier sheet-metal/glass impacts.
- Breakaway wooden poles, metal signs, small trees, debris landings; impact severity should scale without six loud hits becoming an indistinct wall of noise.
- The Ranger's chained spare: restrained metal rattle and rubber thump on meaningful bumps.
- Summer ambience and rain, with quiet loops that leave room for the engine. No winter ambience.

## Source and rights requirements

Prefer CC0/public-domain assets or clearly documented licenses permitting redistribution within a public, downloadable game. CC BY candidates must include attribution and license links. Do not treat YouTube availability, a download button, or the phrase “royalty-free” as permission. A commercial pack may be reference-only if its terms prohibit distributing raw assets in the game's public repo. Flag that restriction. Do not purchase packs or rip copyrighted game/video audio. Include excellent reference-only recordings separately, clearly marked NOT SHIPPABLE.

## Deliverables

Return `AUDIO-SCOUT.md` and a machine-readable CSV or JSON manifest. Each candidate needs:
- Vehicle ID / shared-effect category, exactness and confidence.
- Creator, direct source page, original file name, direct download if supplied by the publisher.
- License name/version, license URL, required attribution, redistribution status and any uncertainty.
- Price if applicable; no purchases.
- Duration, format/sample rate, known RPM/load/mic perspective, useful timestamps/loop points.
- Whether you actually auditioned it, defects heard, and suitability for looping. Never claim to have listened if you cannot.

Give a small ranked shortlist: ideally one best coherent set plus one fallback per vehicle, with honest gaps rather than invented matches. Group genuinely shareable engine-family substitutes but retain each vehicle's distinct mix targets. End with a coverage table, total proposed download size, a compact browser-ready budget, and the five highest-value acquisitions. Suggest any missing recordings the owner could make safely while stationary with another person operating the recorder; do not suggest operating recording equipment while driving.

The goal is a usable, attributable library and clear gaps, not a long list of search results. Codex will handle RPM crossfades, load blending, spatial mixing, pause behavior, performance and in-game integration after the assets are reviewed.
