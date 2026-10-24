// Albedo: the texel under this fragment and what it does to the vertex colour.
// Owner after V0-01: V3-01 (house facades, roofs and trim).
//
// Two samplers. uTex (unit 0, opts.tex) is the material atlas or a skin;
// uTex2 (unit 1, opts.tex2, a 1x1 white texel when not given) is the ground
// atlas. A tiled face picks uTex2 by its rect sentinel: u0 >= 2.0 means "the
// same rect, offset by 2, in the second atlas". Nothing emits that yet.
export const UNIFORMS = {};

export const VERT = '';

export const GLSL = `
vec4 materialTexel() {
  // Tiling inside an atlas cell: wrap the local UV into the cell's sub-rect.
  // fract() breaks the implicit derivatives at the wrap, so hand the gradients
  // of the *unwrapped* UV to textureGrad or every repeat boundary picks the
  // blurriest mip and shows up as a seam.
  if (vRect.z > 0.0) {
    highp vec2 gx = dFdx(vUV) * vRect.zw;
    highp vec2 gy = dFdy(vUV) * vRect.zw;
    if (vRect.x >= 2.0) {
      return textureGrad(uTex2, vec2(vRect.x - 2.0, vRect.y) + fract(vUV) * vRect.zw, gx, gy);
    }
    return textureGrad(uTex, vRect.xy + fract(vUV) * vRect.zw, gx, gy);
  }
  return texture(uTex, vUV);
}
// Hook on the textured base colour (vertex colour x texel), before light.
vec3 materialAlbedo(vec3 base, vec4 tx) { return base; }
`;
