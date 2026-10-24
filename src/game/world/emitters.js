// The world emitters that later visual-wave tasks fill in. world.js runs every
// entry here, in this order, after the last geometry section (distant scenery)
// and before the reactive world, the bake hooks (ctx.postBuild) and the upload.
// Each entry owns its own file, so a task that fills one in never edits
// world.js or this list. Today every one of them emits nothing.
import { emitWires } from './wires.js';
import { emitContact } from './contact.js';
import { emitShadowDecals } from './shadowdecals.js';
import { emitYards } from './yards.js';

export const EMITTERS = [
  { id: 'yards', task: 'V2-05', emit: emitYards },
  { id: 'wires', task: 'V2-06', emit: emitWires },
  { id: 'contact', task: 'V2-07', emit: emitContact },
  { id: 'shadowdecals', task: 'V2-08', emit: emitShadowDecals },
];

export function runEmitters(ctx) {
  for (let i = 0; i < EMITTERS.length; i++) EMITTERS[i].emit(ctx);
}
