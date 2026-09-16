> **Start with [MACBOOK-HANDOFF.md](MACBOOK-HANDOFF.md)** for the Mac setup, current integration status and next-agent prompt. The owner explicitly approved both administrator merges and retargeting #43 to main. #42 is merged; consult the PR pages for #43 and use main after integration.

# Ranger and breakable roadside objects — recovery checkpoint

Branch: `codex/ranger-impact`. Gameplay commit: `ef4414a`. Based on approved repair commit `ef6fb794d63f1e801eaad833fb4465192933819c` from PR #42.

## Merge status
PR #42 merged as `78a41501687f74ce7ad9219a4d0e37516df489ef`. The owner explicitly authorized the administrator override for both PRs and retargeting #43 to main. Only documentation changed after the locally opened version (`611b3be`); the gameplay comparison passed. Check #43 for its final merge record and continue on main after integration.

## Implemented
- Streetlights, utility poles, signal masts, stop signs and small trees retain their own geometry when hit, lose their standing collider, fly, bounce and settle on terrain. Lit signal lenses disappear with the fallen mast.
- Swept contact prevents a fast car skipping thin objects. Default hard impact adds 14.7798 damage: six leave 88.6788, seventh reaches 100. A gentle nudge does not break them.
- Saved Controls slider: Collision damage / Dégâts de collision, 0–2 times normal. Zero still permits breakage and impact motion. Range inputs now retain native arrow-key adjustments.
- Ranger: rust-speckled white front bumper and black lower valance; black steel rear bumper; wider damaged grey grille and oval badge; larger headlamps; dark weathered steel wheels; front-fender badges; fine side stripes; aluminum tailgate cap and black handle; longitudinal bed ribs; visible rear window with black seal and center brake light. The original roof profile points are now preserved during lofting. Chained rusty spare remains.

## Verification
- Full local test run: 54/54 suites passed. Final keyboard-input guard and canopy clearance assertions also passed in `node tools/smoke_breakables.mjs`.
- World checks: 23/23. Graphics buffers remain about 327 MB; fragment copies add CPU memory, and only hit objects allocate additional GPU meshes (at most 40 retained objects). Sector unload and eviction free debris meshes.
- Actual game browser: streetlight and small tree contacts each recorded 14.7798 damage and broken=true; slider at zero recorded zero damage with breakage. Pause audio gain stayed zero. Slider keyboard adjustment restored saved value to 1.
- Final Ranger inspected in the renderer preview: front/side and rear/bed, including rear window, aluminum cap and spare. Preview is `tools/ranger-review.html`; actual-game impact harness is `tools/repair-review.html`.

## Remaining / limits
- Owner review of likeness and driving feel. No promise of an exact unseen rear: supplied photos do not show it straight on; black rear steel bumper and aluminum lip follow the owner's description.
- Debris is bounded arcade physics, not a full rigid-body simulation. It resets when its streamed sector reloads; at most 40 pieces persist. Larger trees retain existing behavior. Heavy props/buildings remain solid.
- Original personal photos are saved locally in the sibling `ranger-references` folder, outside this public repository. Never add them to Git.
- The owner explicitly authorized administrator merges for #42/#43. This does not authorize future review bypasses. Never add/change workflows, trigger test runs in Actions, or push tags. Batch pushes.

## Claude pickup prompt
Use the current pickup prompt in MACBOOK-HANDOFF.md. Check the merged PR records and continue on main after #42/#43 integration. Preserve local work, keep private photos outside Git, and do not repeat the completed repairs.
