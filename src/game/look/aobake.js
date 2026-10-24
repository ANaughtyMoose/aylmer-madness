// Baked AO and contact strips (the bake itself runs in world/ postBuild): task V2-07, look flag `ao`.
//
// A stub from V0-03. look/frame.js already calls it: init once the renderer
// exists, tick(dt) on the fixed step, draw(r, G) at the `afterWorld` stage of
// render(), and only while the flag is on. V2-07 fills these in and touches
// nothing else in main.js. A module may also export any other stage by name
// (beforeSky, afterWorld, afterTransparent, post) and frame.js calls it there.
export function init(G, r) {}
export function tick(dt) {}
export function draw(r, G) {}
