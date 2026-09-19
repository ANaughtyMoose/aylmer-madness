// Code-native surface detail: vinyl should read as painted horizontal laps,
// not the strongly lit weathered wood photograph used by the legacy atlas.
import {TILES} from '../game/materials_stub.js';
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const colour=name=>`vec3(${[16,8,0].map(n=>linear((TILES[name]>>n&255)/255).toFixed(6)).join(',')})`;
export const SIDING_GLSL=`
 if(amRect.z>0.0 && amRect.y<0.02 && amRect.x>0.65) {
  // Thin, staggered limestone courses, rather than square bathroom-like tiles.
  float row=floor(amWorld.y/0.115);
  float u=vMapUv.x*0.9/0.34+fract(sin(row*17.13)*437.7);
  vec2 cell=vec2(u,amWorld.y/0.115);
  vec2 f=fract(cell),aa=max(fwidth(cell),vec2(.015));
  vec2 e=min(f,1.0-f);
  float face=smoothstep(.018,.018+aa.x,e.x)*smoothstep(.025,.025+aa.y,e.y);
  float noise=fract(sin(floor(u)*23.31+row*71.7)*913.37);
  vec3 stone=amRect.x>0.82 ? vec3(.43,.38,.28) : vec3(.34,.355,.33);
  sampledDiffuseColor.rgb=mix(stone*.73,stone*(.90+noise*.18),face);
 }

 if(amRect.z>0.0 && amRect.y>0.16 && amRect.y<0.33) {
  float cell=floor((amRect.x-0.00390625)/0.1640625+0.5);
  vec3 base=${colour('vinyl_white')};
  if(cell>0.5 && cell<1.5)base=${colour('vinyl_beige')};
  if(cell>1.5 && cell<2.5)base=${colour('vinyl_grey')};
  if(cell>2.5 && cell<3.5)base=${colour('vinyl_blue')};
  if(cell>3.5 && cell<4.5)base=${colour('vinyl_green')};
  if(cell>4.5)base=${colour('clapboard_white')};
  float course=amWorld.y/0.16;
  float phase=fract(course),aa=max(fwidth(course),0.012);
  float edge=min(phase,1.0-phase);
  float lap=mix(0.80,1.0,smoothstep(0.0,aa+0.025,edge));
  lap=mix(lap,0.975,smoothstep(0.25,0.8,aa));
  // A little original surface variation, with the baked wood shading removed.
  vec3 grain=clamp(sampledDiffuseColor.rgb/max(base,vec3(.02)),vec3(.85),vec3(1.15));
  sampledDiffuseColor.rgb=base*lap*mix(vec3(1.0),grain,0.18);
 }
`;
