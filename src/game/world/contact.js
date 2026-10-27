// Contact shading where things meet the ground (V2-07). S5-LIGHT (20 Oct):
// the baked vertex AO only (look/aobake.js), queued to run once every builder
// is filled and before upload. The ground contact strips of the V2-07 spec are
// not built yet (they need the triangle budget reconciled first).
import { aoOn, bakeAO } from '../look/aobake.js';

export function emitContact(ctx) { if (aoOn(ctx)) ctx.postBuild(runContact); }
export function runContact(ctx) { bakeAO(ctx); }
