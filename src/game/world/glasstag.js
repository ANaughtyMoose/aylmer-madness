// ==== s5-reflect (V3-02): tag untextured window glass for shaders/glass.js ====
// The fragment shader normalises vNor, so its length is free: a glass pane's
// vertices carry normals of length GLASS_LEN, which glass.js reads back on
// MAT_WORLD fragments. Colour, texel and lighting are unchanged (the light
// normalises), and no stream is added. Every other world vertex has a normal
// length of 1.0 to 1.1 (measured over the whole node bake), and interpolation
// between unit normals never falls under 0.7, so the band cannot catch them.
// No imports: worker-safe (landmarks.js runs in the sector worker).
export const GLASS_LEN = 0.43;

// Rescale the normals of every vertex mb emitted from vertex index `from` on.
export function tagGlass(mb, from) {
  const v = mb.v, S = 9;
  for (let j = from * S; j < v.length; j += S) {
    const l = Math.hypot(v[j + 3], v[j + 4], v[j + 5]);
    if (l > 0) { const k = GLASS_LEN / l; v[j + 3] *= k; v[j + 4] *= k; v[j + 5] *= k; }
  }
}
