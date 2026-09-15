---
status: investigating
trigger: Recover interrupted integration, preserve newer missions and landmarks, verify topography and synchronize the complete version.
created: 2026-09-15
---

## Symptoms
Expected: One committed version contains the newer GPS, Fraser home, historic storefronts, life missions, hidden SVX encounter, and Claude's terrain, vehicle handling and 240D changes.
Actual: Original GitHub Clone is older drive-test. Newer Codex checkout has an interrupted merge with six unmerged index entries and partially fixed geometry.

## Current Focus
hypothesis: Stream interruption left the combined working tree uncommitted; site sign mapping and Fraser geometry have missing ground offsets.
next_action: Preserve a full recovery copy, run existing suites, fix concrete integration failures, verify visually, commit and synchronize.

## Evidence
- Newer commits d78c424, eca4506, 96aeca9 exist in the Codex checkout; backup/pre-claude-integration preserves original history.
- Claude drive-test 3131b5d is being merged; working files no longer contain conflict markers but index remains unresolved.
- User correction in recovered task: 240D purchase $350, restoration $800, tiny hops $0–$2.
- Recovery work occurs in a full copy at Desktop/TomDoesCode/aylmer-integration, preserving both originals.
