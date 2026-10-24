// Overhead hydro wires strung between the poles in ctx.poles. Stub: V2-06
// fills it in. Runs after every geometry section (emitters.js), so it can read
// ctx.poles, ctx.roads and ctx.roadSegArr, add to the chunk builders with
// ctx.bAt, or queue a bake with ctx.postBuild(fn). Emits nothing today.
export function emitWires(ctx) {}
