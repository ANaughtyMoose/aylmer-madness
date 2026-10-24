// Nature and ground shading for the prototype renderer (renderer.js extend()).
//
// * Foliage: the leaf-card trees and shrubs from src/game/vegetation.js carry a
//   UV sentinel (u = 4000 + 10*kind + local u). Here that becomes procedural
//   leaves / spruce boughs with an antialiased cut-out, mottled solid cores and
//   fissured bark, plus a little wind sway in the vertex shader. The same cut-out
//   runs in the shadow pass, so trees cast dappled shadows.
// * Ground: lawns take their colour from a mid-summer palette with the grass
//   photo's own blade colour on top, macro hue drift and dry patches; asphalt is
//   weathered grey with crack networks, crisp-edged patches and oil; paint is
//   worn; sidewalks keep their stained slabs.
// No textures are fetched beyond the three surface photos already loaded.

export const NATURE_VERT_HEAD = 'uniform float amClock; varying vec2 amUV2;';

// Runs right after <begin_vertex>. Leaf and bough cards (kinds 0 and 1) sway;
// the card's top edge (v = 1) moves more than its bottom.
export const NATURE_WIND = `amUV2=uv;
 { float amK=uv.x-4000.0;
   if(amK>-0.5&&amK<19.99){
    vec3 amWp=(modelMatrix*vec4(transformed,1.0)).xyz;
    float amPh=dot(amWp.xz,vec2(0.21,0.17))+amWp.y*0.11;
    float amSw=0.03+uv.y*0.06;
    transformed.x+=sin(amClock*1.7+amPh)*amSw;
    transformed.z+=cos(amClock*1.3+amPh*1.3)*amSw*0.7;
    transformed.y+=sin(amClock*2.9+amPh*2.0)*amSw*0.25;
   }
   // Moored boats (marina.js): u = 5000 + phase. Heave, and a slow roll and
   // pitch that lean the mast; the lever is the height over the waterline.
   if(uv.x>4999.5&&uv.x<5007.0){
    float amBp=uv.x-5000.0;
    float amT=amClock;
    vec3 amWp=(modelMatrix*vec4(transformed,1.0)).xyz;
    float amRoll=sin(amT*1.1+amBp)*0.035+sin(amT*1.9+amBp*2.3)*0.012;
    float amPitch=sin(amT*0.8+amBp*1.7)*0.015;
    float amLev=max(amWp.y,0.0);
    transformed.x+=amRoll*amLev;
    transformed.z+=amPitch*amLev;
    transformed.y+=sin(amT*1.3+amBp*1.3)*0.06;
 } }`;

export const NATURE_FRAG_HEAD = `varying vec2 amUV2;
vec2 amHash2(vec2 p){return vec2(amHash(p),amHash(p+vec2(19.19,7.73)));}
// Leaf cluster: jittered, rotated elliptic leaves inside a ragged round cluster.
// Returns a signed field (>0 inside); tone gets a per-leaf brightness.
float amLeafField(vec2 lp,float dist,out float tone){
 vec2 q=lp*7.5; vec2 i=floor(q); float best=-1.0; tone=1.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 c=i+vec2(float(x),float(y)); vec2 h=amHash2(c+17.3);
  vec2 d=q-(c+0.15+0.7*h); float an=h.x*6.2831; float cs=cos(an),sn=sin(an);
  d=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y);
  float f=0.44-length(d*vec2(1.0,1.75));
  if(f>best){best=f;tone=0.72+0.5*h.y;}
 }
 float edge=0.5-length(lp-0.5)+0.16*(amNoise(lp*5.0+amUV2.x)-0.5);
 float leaves=min(best*1.6,edge*2.2);
 // Far away single leaves are sub-pixel: fade to the ragged cluster outline so
 // the crown does not shimmer. This is the foliage LOD.
 float far=smoothstep(30.0,120.0,dist);
 tone=mix(tone,0.95,far);
 return mix(leaves,edge*2.2-0.12,far);
}
// Spruce / pine bough: a feathered blade from the trunk (u=0) to the tip (u=1).
float amBoughField(vec2 lp,float dist,out float tone){
 float u=lp.x, v=abs(lp.y-0.5)*2.0;
 float w=(1.0-u*u)*0.92+0.08;
 float twig=0.18*abs(fract(u*9.0+v*2.5)-0.5)*2.0;     // side twigs make a saw edge
 float f=w-v-twig*(1.0-smoothstep(45.0,140.0,dist));
 f-=0.35*step(0.78,amNoise(lp*vec2(16.0,6.0)+amUV2.x))*(1.0-smoothstep(40.0,120.0,dist));
 tone=(0.7+0.45*u)*(0.85+0.3*amNoise(lp*vec2(30.0,4.0)));
 return f*0.6;
}
// Crack network: distance to the nearest Voronoi edge, in cell units.
float amEdge(vec2 p){
 vec2 i=floor(p),f=fract(p); float d1=8.0,d2=8.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 o=vec2(float(x),float(y)); vec2 r=o+amHash2(i+o)-f; float d=dot(r,r);
  if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
 }
 return sqrt(d2)-sqrt(d1);
}`;

// Fragment: after <color_fragment>. Decides amLeaf / amAlphaCut for every lit role.
export const FOLIAGE = `float amLeaf=0.0; float amCut=1.0;
 { float amK=amUV2.x-4000.0;
   if(amK>-0.5&&amK<39.99){
    float kind=floor(amK/10.0+0.0001); vec2 lp=vec2(amK-kind*10.0,amUV2.y);
    float dist=distance(amWorld,amEye); float tone=1.0;
    if(kind<2.5)amLeaf=1.0;
    if(kind<0.5){float f=amLeafField(lp,dist,tone);float fw=max(fwidth(f),1e-4);amCut=clamp(f/fw+0.5,0.0,1.0);}
    else if(kind<1.5){float f=amBoughField(lp,dist,tone);float fw=max(fwidth(f),1e-4);amCut=clamp(f/fw+0.5,0.0,1.0);}
    else if(kind<2.5){tone=0.72+0.42*amNoise(amWorld.xz*2.7+amWorld.y*1.9)*(0.6+0.4*amNoise(amWorld.xz*9.0-amWorld.y*7.0));}
    else {
     // Bark: vertical fissures; pale (birch) bark gets dark horizontal marks.
     tone=0.72+0.4*amNoise(vec2(lp.x*14.0,lp.y*3.0));
     float pale=step(0.45,dot(vColor.rgb,vec3(.2126,.7152,.0722)));
     tone*=1.0-pale*0.7*step(0.72,amNoise(vec2(lp.x*9.0,lp.y*70.0)));
    }
    if(amCut<0.02)discard;
    diffuseColor.rgb*=tone;
    diffuseColor.a*=amCut;
 } }`;

// Shadow pass: same cut-out, hard edge.
export const FOLIAGE_DEPTH = `{ float amK=amUV2.x-4000.0;
   if(amK>-0.5&&amK<19.99){
    float kind=floor(amK/10.0+0.0001); vec2 lp=vec2(amK-kind*10.0,amUV2.y);
    float tone; float dist=distance(amWorld,amEye);
    float f=kind<0.5?amLeafField(lp,dist,tone):amBoughField(lp,dist,tone);
    if(f<0.0)discard;
 } }
 #include <alphatest_fragment>`;

// Ground: replaces the first pass's GROUND block. Needs FOLIAGE above it.
export const GROUND = `#include <color_fragment>
   // Only upward-facing ground receives projected grain; cars/signs use other roles.
   float up=smoothstep(0.72,0.95,amNormal.y)*(1.0-step(0.001,amRect.z))*(1.0-amLeaf);
   up*=1.0-step(4999.5,amUV2.x);   // boats and riprap (marina.js) are not ground
   float grass=step(vColor.r*1.25,vColor.g)*step(vColor.b*1.3,vColor.g);
   float vmax=max(vColor.r,max(vColor.g,vColor.b)), vmin=min(vColor.r,min(vColor.g,vColor.b));
   float road=(1.0-step(0.13,vmax))*(1.0-step(0.035,vmax-vmin))*(1.0-grass);
   float concrete=step(0.30,vColor.r)*step(0.30,vColor.g)*(1.0-step(0.60,vColor.r))*(1.0-grass);
   float yellow=step(0.35,vColor.r)*step(vColor.b*3.0,vColor.r)*step(vColor.g,vColor.r)*(1.0-grass);
   float white=step(0.55,min(vColor.r,min(vColor.g,vColor.b)));
   vec2 w=amWorld.xz, w2=mat2(0.8,-0.6,0.6,0.8)*w;
   vec3 lw=vec3(.2126,.7152,.0722);
   float dist=length(amWorld-amEye);
   float big=amNoise(w/38.0), mid=amNoise(w/9.0+17.0), fine=amNoise(w/1.7+5.0);
   // ---- lawns
   if(grass*up>0.0){
    vec3 gt=mix(texture2D(amGrass,w/3.1).rgb,texture2D(amGrass,w2/10.5).rgb,0.4);
    // The photo's own mean is about (0.115, 0.19, 0.03) linear; divide it out so
    // only blade-scale colour and light/dark survive, around our palette.
    vec3 blade=clamp(gt/vec3(0.115,0.19,0.032),vec3(0.45),vec3(1.8));
    blade=mix(blade,vec3(dot(blade,vec3(0.33))),0.35);
    float hue=smoothstep(0.2,0.8,amNoise(w/19.0)*0.55+amNoise(w/67.0+3.0)*0.45);
    vec3 lawn=mix(vec3(0.036,0.064,0.016),vec3(0.080,0.104,0.024),hue);
    // Dead, sun-burnt spots and worn bare dirt: Tom's lawns were never a carpet.
    float dry=smoothstep(0.5,0.8,big*0.6+mid*0.4)*0.75;
    lawn=mix(lawn,vec3(0.15,0.13,0.06),dry);
    float dirt=smoothstep(0.66,0.74,amNoise(w/3.3+71.0)*0.6+mid*0.4)*smoothstep(0.35,0.6,amNoise(w/31.0+5.0));
    lawn=mix(lawn,vec3(0.085,0.066,0.045)*(0.8+0.4*fine),dirt*0.85);
    // clover / weed patches: darker, bluer, small
    lawn*=mix(1.0,0.78,smoothstep(0.7,0.9,amNoise(w/2.3+41.0))*0.8);
    // Parks, schools and the cemetery keep their own relative brightness.
    lawn*=clamp(dot(vColor.rgb,lw)/0.203,0.75,1.25);
    vec3 g=lawn*mix(blade,vec3(1.0),smoothstep(60.0,260.0,dist)*0.5)*(0.92+0.16*fine);
    // Grazing sheen: grass seen low goes paler and yellower.
    vec3 V=normalize(amEye-amWorld); float gz=pow(1.0-max(dot(amNormal,V),0.0),4.0);
    g=mix(g,g*vec3(1.35,1.3,1.05)+vec3(0.012,0.012,0.006),gz*0.6);
    diffuseColor.rgb=mix(diffuseColor.rgb,g,grass*up);
   }
   // ---- asphalt
   if(road*up>0.0){
    vec3 at=texture2D(amAsphalt,w/4.0).rgb*0.6+texture2D(amAsphalt,w2/9.5).rgb*0.4;
    float al=clamp(dot(at,lw)/0.045,0.55,1.6);
    float age=smoothstep(0.25,0.8,amNoise(w/47.0)*0.7+big*0.3);
    vec3 asp=mix(vec3(0.052,0.052,0.056),vec3(0.105,0.101,0.097),age);
    asp*=clamp(dot(vColor.rgb,lw)/0.040,0.8,1.35);
    // Crisp-edged patches of newer, darker asphalt.
    float pn=amNoise(w/6.5+31.0)*0.75+amNoise(w/1.9)*0.25;
    float patchA=smoothstep(0.66,0.675,pn)*step(0.35,amNoise(w/55.0+9.0));
    asp=mix(asp,vec3(0.036,0.036,0.039),patchA);
    // Crack network in the old surface, plus wider sealed tar snakes.
    // Only some cell edges crack, and each crack wanders in and out, so the
    // network never reads as paving stones.
    float cr=dist>70.0?1.0:amEdge(w/3.4+0.35*vec2(amNoise(w*0.9),amNoise(w*0.9+13.0)));
    float crackMask=smoothstep(0.35,0.75,age)*(1.0-patchA)*smoothstep(0.5,0.7,amNoise(w/11.0+2.0))*step(0.4,amNoise(w*0.55+4.0));
    float fw=fwidth(cr)+0.001;
    asp*=1.0-0.65*crackMask*(1.0-smoothstep(0.0,0.012+fw,cr))*(1.0-smoothstep(25.0,70.0,dist));
    if(dist<220.0){
     float tar=amEdge(w/9.0+5.0);
     asp=mix(asp,vec3(0.028,0.028,0.03),(1.0-smoothstep(0.02,0.045+fwidth(tar),tar))*step(0.55,amNoise(w/21.0))*0.85);
    }
    asp*=mix(vec3(1.0),vec3(al),1.0-smoothstep(80.0,300.0,dist)*0.6);
    // oil and tyre darkening in small blotches
    asp*=1.0-0.22*smoothstep(0.62,0.9,fine*mid);
    diffuseColor.rgb=mix(diffuseColor.rgb,asp,road*up);
   }
   // ---- 2004 paint: faded, worn through in the wheel paths, a little dirty
   float paint=max(yellow,white)*up;
   if(paint>0.0){
    float wear=smoothstep(0.2,0.8,amNoise(w/0.35)*0.45+amNoise(w/3.0+7.0)*0.55);
    vec3 under=vec3(0.075,0.073,0.072);
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb*0.78,under,wear*0.75),paint);
   }
   // ---- gravel (shoulders, 299 Fraser's drive): stones and dust
   float gravel=up*step(0.15,vmax)*(1.0-step(0.31,vmax))*step(vColor.b*1.12,vColor.r)*(1.0-grass)*(1.0-yellow);
   if(gravel>0.0){
    vec2 gq=w*9.0; vec2 gi=floor(gq); vec2 gf=fract(gq)-0.5; float gh=amHash(gi);
    float stone=smoothstep(0.42,0.3,length(gf+0.25*(amHash2(gi)-0.5)))*(0.75+0.5*gh);
    vec3 gcol=vColor.rgb*(0.72+0.5*stone)*(0.9+0.2*amNoise(w/1.3))*(1.0-0.25*smoothstep(0.6,0.9,amNoise(w/4.0+3.0)));
    diffuseColor.rgb=mix(diffuseColor.rgb,gcol*mix(1.0,0.95,smoothstep(20.0,60.0,dist)),gravel);
   }
   // ---- sidewalks / concrete: stained slabs
   float c=0.6*texture2D(amConcrete,w/4.0).r+0.4*texture2D(amConcrete,w2/11.0).r;
   diffuseColor.rgb*=mix(vec3(1),vec3(clamp(c/.48,0.7,1.25)*(0.9+0.14*mid)*(1.0-0.12*smoothstep(0.6,0.85,fine))),concrete*up*0.6);`;
