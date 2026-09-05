# Aylmer Madness — Procedural Audio Architecture & Sound Design (B3)

**Target Environment:** Web Audio API (Zero External Audio Libraries, Synthesizer-Driven)  
**Author:** Gemini CLI  
**Date:** September 2026  

---

## 1. Procedural Engine Acoustic Profiles

Aylmer Madness avoids static MP3 looping in favor of real-time procedural Web Audio synthesis using oscillators, periodic wave tables, wave-shaping distortion, and multi-mode biquad filters.

### 1. 1993 Ford Ranger XL (2.3L Lima SOHC Inline-4)
- **Acoustic Character:** Rough, utilitarian, mechanical valve clatter, hollow unpolished cast-iron manifold resonance, pronounced mechanical fan clutch roar under load, tall 5-speed gear whine.
- **Synthesis Pipeline:**
  - **Fundamental Combustion Pulses:** 2 firing pulses per engine revolution ($f_0 = \frac{\text{RPM}}{60} \times 2$). At 750 RPM idle: $f_0 = 25 \text{ Hz}$. At 4500 RPM: $f_0 = 150 \text{ Hz}$.
  - **Oscillator Type:** Asymmetrical triangle wave feeding a `WaveShaperNode` with soft-clipping polynomial curve ($y = \tanh(1.8x)$) to generate odd and even harmonics.
  - **Mechanical Clatter Layer:** White noise burst triggered on each ignition stroke filtered through a high-Q bandpass filter centered at $1850 \text{ Hz}$ (Q = 14) with an exponential decay of $12 \text{ ms}$ to simulate solid hydraulic lifter tick.
  - **Exhaust Resonator:** Series of two lowpass biquad filters ($f_c = 280 \text{ Hz}$, roll-off $24 \text{ dB/oct}$) simulating the long steel exhaust pipe leading to a stock single-chamber muffler.
  - **Transmission Gear Whine:** Sinusoidal oscillator tuned to gear tooth mesh frequency ($f_{\text{whine}} = \text{Driveshaft RPM} \times 3.73 \times \text{GearRatio}$), scaled with vehicle speed and throttle load.

### 2. 1988 Honda Civic Si (1.6L D16A6 SOHC / DOHC Cam Bark)
- **Acoustic Character:** Tight, high-pitched, metallic rasp, aggressive intake roar above 3500 RPM, sharp throttle response, stiff engine mounts vibrating the chassis.
- **Synthesis Pipeline:**
  - **Fundamental Combustion:** Crisp saw-tooth wave ($f_0 = 30 \text{ Hz}$ at 900 RPM idle; $f_0 = 240 \text{ Hz}$ at 7200 RPM redline).
  - **Harmonic Saturation:** Overdrive curve with cubic distortion to capture the signature 1980s Japanese 16-valve exhaust buzz.
  - **Intake Resonator:** Parallel bandpass filter with frequency dynamically modulated by throttle opening:
    $$f_{\text{intake}} = 450 \text{ Hz} + 850 \text{ Hz} \times \text{throttle}$$
    Gain ramps exponentially under wide-open throttle to create an authentic induction roar.
  - **Exhaust Burble on Decel:** When throttle drops to 0 at high RPM, an LFO introduces random low-frequency amplitude drops (12–18 Hz) combined with gentle low-frequency pops.

### 3. STO Transit Bus (Cummins ISC Turbo Diesel / Nova Bus LFS)
- **Acoustic Character:** Heavy low-frequency diesel combustion knock, pronounced high-pitch turbocharger spool, hydraulic fan roar, high-pressure pneumatic air brake discharge.
- **Synthesis Pipeline:**
  - **Diesel Knock:** Square-wave base multiplied by narrow pulse modulation at 6 combustion strokes per 2 revolutions ($f_0 = 3 \times \frac{\text{RPM}}{60}$). At 600 RPM idle: $f_0 = 30 \text{ Hz}$. Lowpass filtered at $400 \text{ Hz}$ with high gain.
  - **Turbocharger Spool:** Pure sine wave oscillator coupled to an envelope follower tracking engine load:
    $$f_{\text{turbo}} = 1200 \text{ Hz} + 3800 \text{ Hz} \times \text{boost}$$
    Gain follows engine load with a $1.2 \text{ s}$ lag to simulate turbo spool inertia.
  - **Air Brake Purge (`Psssshhht`):** Bandpass filtered white noise ($f_c = 3200 \text{ Hz}$, Q = 3) with an instantaneous attack and a linear $0.35 \text{ s}$ decay triggered whenever the bus slows to complete stop.

---

## 2. Surface Interaction & Rolling Audio

### 1. Asphalt Rolling Noise
- **Profile:** Continuous low-frequency pink noise filtered through a lowpass filter scaled with ground speed:
  $$f_{\text{cutoff}} = 180 \text{ Hz} + 22 \times v_{\text{km/h}}$$
- Gain scales with $\sqrt{v_{\text{km/h}}}$. Expansion joint clicks triggered when crossing road polygon boundaries ($35 \text{ ms}$ pulse at $120 \text{ Hz}$).

### 2. Crushed Limestone Gravel
- **Profile:** High-frequency granular noise. White noise modulated by a random frequency pulse generator (Poisson process, 80–240 events/sec) driving resonant bandpasses at $2200 \text{ Hz}$ and $4800 \text{ Hz}$ to simulate small stones striking the inner fender wells.

### 3. Grass & Turf
- **Profile:** Soft, muffled tearing noise. Brown noise with gentle high-shelf attenuation ($-12 \text{ dB}$ at $1000 \text{ Hz}$) and subtle periodic low-frequency dips (5–8 Hz) corresponding to wheel rotation over uneven turf mounds.

### 4. Railway Berm Impact (Chemin Fraser Crossing)
- **Profile:** Deep dual-thud impact. Sub-bass sine wave ($48 \text{ Hz}$) decaying over $180 \text{ ms}$ paired with a metallic leaf-spring rattle burst (filtered noise band at $950 \text{ Hz}$, $80 \text{ ms}$).

---

## 3. Summer 2004 Outaouais Ambient Soundscape

### 1. High-Summer Day Cicadas
- **Profile:** The definitive sound of a July afternoon in Aylmer. Two oscillators modulating a bandpass filter ($f_c = 7200 \text{ Hz}$, Q = 8) with an amplitude swell period of 6.5 seconds, mimicking the rhythmic swelling buzz of annual dog-day cicadas in suburban maple trees.

### 2. Lac Deschênes Riverfront Breeze
- **Profile:** Gentle stereo pink noise filtered between $300 \text{ Hz}$ and $1800 \text{ Hz}$ with slow sinusoidal pan sweep (0.1 Hz) and occasional gentle water lap transients when parked near the marina shoreline.
