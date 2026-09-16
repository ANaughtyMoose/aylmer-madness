// The base height field, decoded once at boot from the base64 Uint16 blob that
// tools/build_ground.py bakes into ground_data.js. No imports: terrain.js takes
// the decoded record as an argument, so this runs in plain node and the browser
// alike, and a world built with `null` behaves exactly as the flat town did.
//
// Layout: node (i, j) is at game x = x0 + i * cell, z = z0 + j * cell, stored at
// index j * w + i — so i runs east and j runs SOUTH, the game's +Z. Heights come
// back with the datum already subtracted, i.e. they are game y, metres above the
// water quad's 0.02. gx/gz are dh/dx and dh/dz in m/m, central differences
// inside and one-sided at the four edges; they are baked here rather than
// differenced per sample so terrain.js can bilinear the gradient with the same
// four weights as the height and stay C0 across cell edges. 283k nodes is
// 3 x 1.1 MB of Float32Array.
export function decodeGround(G) {
  const { cell, w, h, x0, z0, min, datum, scale, b64 } = G;
  const n = w * h;

  // A tight loop over the atob() string, not Uint8Array.from(s, fn): the
  // per-character callback costs about 10x on 566 KB of payload.
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) bytes[k] = s.charCodeAt(k);
  const q = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const hgt = new Float32Array(n);
  const base = min - datum;
  for (let k = 0; k < n; k++) hgt[k] = base + q.getUint16(k * 2, true) * scale;

  const gx = new Float32Array(n);
  const gz = new Float32Array(n);
  const inv2 = 1 / (2 * cell);
  const inv1 = 1 / cell;
  for (let j = 0; j < h; j++) {
    const r = j * w;
    for (let i = 0; i < w; i++) {
      const k = r + i;
      gx[k] = i === 0 ? (hgt[k + 1] - hgt[k]) * inv1
        : i === w - 1 ? (hgt[k] - hgt[k - 1]) * inv1
          : (hgt[k + 1] - hgt[k - 1]) * inv2;
      gz[k] = j === 0 ? (hgt[k + w] - hgt[k]) * inv1
        : j === h - 1 ? (hgt[k] - hgt[k - w]) * inv1
          : (hgt[k + w] - hgt[k - w]) * inv2;
    }
  }

  return { x0, z0, cell, w, h, hgt, gx, gz };
}
