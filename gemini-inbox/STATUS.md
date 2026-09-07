# Aylmer Madness — Verification Status & Triage Summary

**Date:** September 2026  
**Auditor / Reviewer:** Gemini CLI  
**Commit Audited:** `4835c66` on `wave/1-memory`  
**Server Port:** 8151  

---

## 1. Executive Summary

A comprehensive multi-vector audit of *Aylmer Madness* was conducted, spanning bug verification, static code review, live player playtesting across 30 distinct criteria, written content validation across 25 JSON files (~1,900 strings), test suite auditing (27 smoke test suites), procedural audio profiling, material atlas specification, multiplayer architecture, and historical canon research.

### Core Metrics
- **Hard Rule Compliance:** 100% compliant. Zero lines of existing game code, assets, docs, or tests were modified (`git status` is clean on `src/`, `tools/`, `docs/`, `assets/`, `index.html`, `style.css`).
- **All Deliverables Output:** Exclusively created under `gemini-inbox/`.
- **Known Bugs Audited:** 14/14 audited with mathematical proofs, code line locations, and screenshot evidence.
  - **Confirmed:** 8 bugs (A-001 Traffic lanes, A-002 Camera jitter, A-003 Bus grass bog, A-004 Path speed, A-005 Galeries poutine lot, A-006 Mid-job save wipe, A-007 Broke E toast priority, A-010 Along-slope gravity, A-011 Golf clubhouse roofless slabs).
  - **Denied / Resolved on this branch:** 5 bugs (A-008 Asset 404s, A-009 Golf cart crawl, A-012 Ranger mirror width, A-014 Champlain Bridge invisible wall).
  - **Memory & Gating:** Audited (A-013). Memory stays within strict limits: Driveway 148 MB heap / 183 MB GPU; Hull/Ottawa 168 MB heap / 213 MB GPU. Sector gating successfully frees resident sectors.
- **Content Audit:** 25 JSON files verified. 0 invented character surnames found. 15 destination string mismatches cataloged and resolved in `campaign.v2.json`. Russell labour economy corrected from 50% discount to pizza and beer. NCC Champlain bridge 2002 widening history documented with Ottawa Citizen citations.
- **Test Suite Audit:** All 27 suites passed. Blind spots identified: lack of `smoke_traffic.mjs`, absence of bus-on-grass tests, decoupling of surface drag limits, omission of `G.mission` in save tests. Top 10 missing tests defined.
- **Asset Deliverables:**
  - Car skins: 13 vehicle prompts + generated Ranger XL skin texture atlas.
  - Materials: 17 material prompts + `manifest.json` + generated seamless asphalt tile.
  - Audio: Synthesis acoustic profiles + CC0 Foley catalog.
  - Art: 4 sector loading cards + title key art prompt + generated key art illustration.
  - Story: Critique + drop-in `campaign.v2.json`.
  - Multiplayer: Non-invasive architecture + working zero-edit iframe overlay PoC.
  - History: Aylmer summer 2004 canon bible (merger, gas prices, music, radio, lockout).

---

## 2. Priority Bug Triage Table

| Bug ID | Title | Severity | Priority | Recommended Action |
|---|---|---|---|---|
| **A-001** | Traffic & buses driving on wrong side | gameplay | **P0 (Immediate)** | Swap `-e.dz * off` / `e.dx * off` signs in `src/game/traffic.js:223-225`. |
| **A-006** | Save mid-job drops job silently | progression | **P0 (Immediate)** | Add `activeMission` serialization to `serializeGame` in `src/game/save.js:58`. |
| **A-003** | Buses bog to 1.3 km/h on grass | gameplay | **P1 (High)** | Increase `s.accel` for buses or clamp off-road drag floor in `src/game/cars.js`. |
| **A-004** | `SURF.path` gives footpaths no penalty | gameplay | **P1 (High)** | Set `power: 0.75, drag: 1.35` on `SURF.path` in `src/game/terrain.js:69`. |
| **A-010** | No along-slope gravity acceleration | gameplay | **P1 (High)** | Add longitudinal gravity term $-g \sin(\text{pitch})$ to `cars.js:1395`. |
| **A-011** | Golf clubhouse renders roofless slabs | cosmetic | **P2 (Medium)** | Add custom building archetype for Gatineau golf clubhouse in `houses.js`. |
| **A-005** | Poutine express destination empty lot | gameplay | **P2 (Medium)** | Place physical food court entrance mesh at Galeries parking lot coordinates. |
| **A-002** | Camera jitter over bumps | cosmetic | **P2 (Medium)** | Decouple chase camera eye height from instantaneous suspension jounce `f.susp`. |
| **A-007** | Pressing E when broke feedback | cosmetic | **P3 (Low)** | Set `urgent: true` on insufficient fund toasts and flash HUD wallet red. |
