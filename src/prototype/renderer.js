// Three.js adapter for Aylmer's existing immediate-mode renderer API.
// The simulation, world builders, coordinates, car meshes and collisions stay original.
//
// Look (docs/design/VISUAL-PLAN.md): filmic tone curve plus a light time-of-day
// grade, sun-tinted aerial haze, a stronger sun against a weaker sky fill so
// form reads, glass that reflects and lights up at night, and ground that is not
// one flat colour. Everything is in the material shaders: no post-process passes.
import {SIDING_GLSL} from './siding.js';
import {NATURE_VERT_HEAD,NATURE_WIND,NATURE_FRAG_HEAD,FOLIAGE,FOLIAGE_DEPTH,GROUND} from './nature.js';
import {FACADE_HEAD,HOUSE_GLSL,FACADE_GLSL} from './facade.js';
import * as THREE from '../../vendor/prototype/three.module.min.js';
import { m4, extractFrustum, aabbInFrustum } from '../core/math.js';
export const WHITE = new Float32Array([1,1,1]);
const linear = v => v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
// Scratch objects: nothing below allocates per draw or per frame.
const _c = new THREE.Color(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0,1,0);
const NIGHT_SKY = new THREE.Color(0x637da6), NIGHT_GROUND = new THREE.Color(0x343c50);
const srgb = (target,a,k=1) => target.setRGB(a[0]*k,a[1]*k,a[2]*k,THREE.SRGBColorSpace);

// ACES (the same fit three uses) followed by a small grade: split-tone, contrast
// around mid-grey and saturation. The grade uniforms are declared here, so any
// material that does not carry them gets zeros, which is the neutral grade.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
 'vec3 CustomToneMapping( vec3 color ) { return color; }',
 `uniform vec3 amShadowTint, amHighTint; uniform float amSat, amContrast;
 vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c *= 1.0 + mix( amShadowTint, amHighTint, smoothstep( 0.02, 0.45, l ) );
  c = 0.18 * pow( max( c, vec3( 0.0 ) ) / 0.18, vec3( 1.0 + amContrast ) );
  l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  return clamp( mix( vec3( l ), c, 1.0 + amSat ), 0.0, 1.0 );
 }`);

const VARY = 'varying vec4 amRect; varying vec3 amWorld; varying vec3 amNormal;';
const FRAG_HEAD = `${VARY}
uniform vec3 amEye, amSunDir, amSunFog; uniform sampler2D amAsphalt,amGrass,amConcrete;
uniform float amClock,amFogMul,amNight,amWet;
float amHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float amNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(amHash(i),amHash(i+vec2(1,0)),f.x),mix(amHash(i+vec2(0,1)),amHash(i+vec2(1,1)),f.x),f.y);}
// Metres per repeat of an atlas cell (prototype manifest in materials.js).
float amCellMetres(vec4 r){
 if(r.y<0.1)return r.x<0.16?1.0:(r.x<0.655?1.8:0.9);
 if(r.y<0.3)return 2.4;
 return r.x<0.16?2.4:(r.x<0.33?1.2:(r.x<0.82?0.8:2.4));
}
${FACADE_HEAD}`;

const MAP = `vec3 amGlow=vec3(0.0); float amGlass=0.0;
 #ifdef USE_MAP
 vec2 amUV=vMapUv;
 if(amRect.z>0.0)amUV=amRect.xy+fract(vMapUv)*amRect.zw;
 vec4 sampledDiffuseColor=textureGrad(map,amUV,dFdx(vMapUv)*(amRect.z>0.0?amRect.zw:vec2(1.0)),dFdy(vMapUv)*(amRect.z>0.0?amRect.zw:vec2(1.0)));
 if(amRect.z>0.0)sampledDiffuseColor.a=1.0;
 ${SIDING_GLSL}
 ${HOUSE_GLSL}
 // House walls armed by houses.js carry a +1000 v sentinel (materials.js
 // facade option): v then measures height above the footing, which grounds the
 // wall with a foundation strip, contact darkening and a little weathering,
 // instead of one texture running untouched from the lawn to the eaves.
 if(amRect.z>0.0 && vMapUv.y>500.0 && abs(amNormal.y)<0.35){
  float m=amCellMetres(amRect), h=(1000.0-vMapUv.y)*m, s=vMapUv.x*m;
  float weather=amNoise(vec2(s*0.35,h*0.12))*0.5+amNoise(vec2(s*1.7,h*0.08))*0.5;
  sampledDiffuseColor.rgb*=mix(0.86,1.04,weather);
  sampledDiffuseColor.rgb*=mix(0.62,1.0,smoothstep(0.0,1.1,h));
  float footing=1.0-smoothstep(0.30,0.33,h);
  sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,vec3(0.30,0.29,0.27)*(0.85+0.3*amNoise(vec2(s*3.0,h*9.0))),footing);
 }
 // Window decals (row of the atlas holding the three sash/bay/small windows):
 // the dark glass reflects the sky, and at night some rooms are lit.
 if(amRect.z<=0.0 && amRect.z>-0.25 && vMapUv.y>0.497 && vMapUv.y<0.737 && vMapUv.x<0.745){
  vec3 g=sampledDiffuseColor.rgb;
  amGlass=step(dot(g,vec3(.2126,.7152,.0722)),0.33)*step(g.r*1.05,g.b)*step(0.5,sampledDiffuseColor.a);
  // Depth cue: the head of the opening shades the top of the pane.
  float lv=fract((vMapUv.y-0.49609375)/0.2421875);
  sampledDiffuseColor.rgb*=mix(1.0,mix(0.45,1.0,smoothstep(0.06,0.34,lv)),amGlass);
 }
 diffuseColor*=sampledDiffuseColor;
 #endif`;

// Ground (lawns, asphalt, paint, sidewalks) and foliage live in nature.js.

// Buildings: glass is recognised either from the window decals (above) or from
// the dark blue-grey vertex colour every builder uses for untextured panes. It
// turns glossy (reflects the sky) and, after dark, about half the rooms light up.
const GLASS = `#include <color_fragment>
// Leaves (nature.js FOLIAGE, inserted above) never take the facade or glass paths.
 if(amLeaf<0.5){
${FACADE_GLSL}
 }
 if(abs(amNormal.y)<0.3&&amLeaf<0.5){
  vec3 vc=vColor.rgb; float mx=max(vc.r,max(vc.g,vc.b));
  amGlass=max(amGlass,step(mx,0.13)*step(0.012,vc.b)*step(vc.r*1.25,vc.b)*step(vc.r*1.02,vc.g));
 }
 if(amGlass>0.5){
  vec2 room=floor(amWorld.xz/7.0)+floor(amWorld.y/2.7)*17.0;
  float lit=step(0.58,amHash(room*0.37+vec2(3.1,7.7)));
  float warm=amHash(room+vec2(11.0,5.0));
  vec3 lamp=mix(vec3(1.0,0.62,0.30),vec3(0.95,0.80,0.60),warm);
  amGlow=max(amGlow,lit*amNight*amNight*lamp*(0.3+0.25*warm)*min(amGlass,1.0));
  diffuseColor.rgb*=0.6;
 }`;
function extend(material,role,uniforms) {
 material.customProgramCacheKey=()=>`aylmer2004-${role}-v4`;
 material.onBeforeCompile=s=>{
  Object.assign(s.uniforms,uniforms);
  s.vertexShader=VARY+'\n'+NATURE_VERT_HEAD+'\nattribute vec4 atlasRect;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   ${NATURE_WIND}
   amRect=atlasRect;amWorld=(modelMatrix*vec4(position,1.0)).xyz;
   amNormal=normalize(mat3(modelMatrix)*normal);`);
  s.fragmentShader=FRAG_HEAD+'\n'+NATURE_FRAG_HEAD+'\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',MAP);
  if(role==='building')s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',GLASS);
  if(role==='world'){
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',GLASS.replace('#include <color_fragment>',GROUND));
   // Wet asphalt: darker and glossy, so lamps and headlights streak on it.
   s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,0.22+0.2*amNoise(amWorld.xz/3.0),amWet*road*up);
    diffuseColor.rgb*=1.0-0.35*amWet*road*up;
    roughnessFactor=mix(roughnessFactor,0.1,amGlass);`);
  } else s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,0.1,amGlass);');
  // Foliage cut-out and tone run first, so the ground and glass tests can skip leaves.
  if(role==='depth')s.fragmentShader=s.fragmentShader.replace('#include <alphatest_fragment>',FOLIAGE_DEPTH);
  else s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+FOLIAGE);
  s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=amGlow;');
  if(role==='water')s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   normal=normalize(normal+vec3(sin(amWorld.x*0.23+amClock)*0.08,0.0,cos(amWorld.z*0.3-amClock*0.7)*0.08));`);
  // Fade shadow coverage before reaching the small, high-resolution shadow volume.
  s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
   'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
   'mix(getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ),1.0,smoothstep(48.0,72.0,distance(amWorld.xz,amEye.xz)))'));
  // Aerial perspective: the haze picks up the sun's colour when you look toward
  // it, thins with height, and goes through the same tone curve as the sky so
  // the horizon has no seam.
  s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
   vec3 amV=amWorld-amEye; float amD=length(amV);
   float amFd=fogDensity*amFogMul*vFogDepth;
   float fogFactor=1.0-exp(-amFd*amFd);
   fogFactor*=mix(1.0,0.55,smoothstep(20.0,160.0,amWorld.y-amEye.y));
   vec3 amFogC=mix(fogColor,amSunFog,pow(max(dot(amV/max(amD,1e-3),amSunDir),0.0),6.0));
   #if defined( TONE_MAPPING )
    amFogC=toneMapping(amFogC);
   #endif
   gl_FragColor.rgb=mix(gl_FragColor.rgb,amFogC,fogFactor);
  #endif`);
 };
}
// Time-of-day look: [hemi, sun gain, exposure, shadow tint, highlight tint, saturation, contrast, haze]
const LOOK = {
 day:  [1.05,3.3,1.0,[-0.03,0.0,0.035],[0.035,0.012,-0.03],-0.04,0.10,1.0],
 gold: [0.95,3.3,1.02,[-0.02,0.0,0.05],[0.08,0.025,-0.06],0.04,0.12,1.1],
 night:[1.9,3.3,1.25,[-0.02,0.01,0.06],[0.05,0.02,-0.03],-0.18,0.06,0.9],
};
const lerp=(a,b,t)=>a+(b-a)*t;
export class Renderer {
 constructor(canvas) {
  this.isPrototype=true;this.materialAtlas='atlas.real';this.canvas=canvas;this.scale=0.85;this.maxDpr=1.5;
  this.engine=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
  this.gl=this.engine.getContext();this.engine.outputColorSpace=THREE.SRGBColorSpace;
  this.engine.toneMapping=THREE.CustomToneMapping;this.engine.toneMappingExposure=1.0;
  this.engine.shadowMap.enabled=true;this.engine.shadowMap.type=THREE.PCFSoftShadowMap;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0xc1ced6,0.0015);
  this.camera=new THREE.PerspectiveCamera();this.camera.matrixAutoUpdate=false;
  this.sun=new THREE.DirectionalLight(0xffedcf,2.4);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-0.0002;this.sun.shadow.normalBias=0.07;
  Object.assign(this.sun.shadow.camera,{left:-88,right:88,top:88,bottom:-88,near:5,far:520});
  this.sun.shadow.camera.updateProjectionMatrix();this.scene.add(this.sun,this.sun.target);
  this.hemi=new THREE.HemisphereLight(0xc3d5ee,0x776c58,1.3);this.scene.add(this.hemi);
  this.headlights=[];
  for(const side of [-1,1]){
   const l=new THREE.SpotLight(0xffe2b2,0,65,0.48,0.65,1.2);
   l.castShadow=side===-1;l.shadow.mapSize.set(1024,1024);l.shadow.bias=-0.0001;l.shadow.normalBias=0.025;
   l.shadow.camera.near=0.3;l.shadow.autoUpdate=false;this.scene.add(l,l.target);this.headlights.push(l);
  }
  // 2004 sodium heads: yellow-orange, bright under the lamp, fading along the road.
  this.streetlights=Array.from({length:6},()=>{const l=new THREE.PointLight(0xffa640,0,30,1.4);this.scene.add(l);return l;});
  this.makeHeadlightGlow();
  this.frame=0;this.handles=new Set();this.active=[];this.gpuBytes=0;this.textureBytes=0;
  this.stats={draws:0,tris:0};this.timing=[];this._last=0;this.time=0;this.shadows=true;
  this.eye=[0,0,0];this.vp=m4.create();this.view=m4.create();this.proj=m4.create();this.camWorld=m4.create();this.planes=new Float32Array(24);
  this.uniforms={amEye:{value:new THREE.Vector3()},amClock:{value:0},amFogMul:{value:1},
   amSunDir:{value:new THREE.Vector3(0,1,0)},amSunFog:{value:new THREE.Color()},amNight:{value:0},amWet:{value:0},
   amShadowTint:{value:new THREE.Vector3()},amHighTint:{value:new THREE.Vector3()},amSat:{value:0},amContrast:{value:0},
   amAsphalt:{value:this.loadSurface('asphalt')},amGrass:{value:this.loadSurface('grass')},amConcrete:{value:this.loadSurface('concrete')}};
  this._sunRight=new THREE.Vector3();this._sunUp=new THREE.Vector3();this._target=new THREE.Vector3();
  this.nearPoles=[];this._poleD=[];
  this.makeSky();this.makeEnvironment();this.resize();
 }
 // Night driving: a soft glow at each lamp and a wide, feathered wash of light on
 // the road ahead (additive, unlit), on top of the two shadowing spotlights.
 makeHeadlightGlow(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const grd=g.createRadialGradient(32,32,0,32,32,32);grd.addColorStop(0,'rgba(255,248,225,1)');grd.addColorStop(0.25,'rgba(255,225,170,0.55)');grd.addColorStop(1,'rgba(255,200,140,0)');
  g.fillStyle=grd;g.fillRect(0,0,64,64);this.glowTex=new THREE.CanvasTexture(c);this.glowTex.colorSpace=THREE.SRGBColorSpace;
  this.lampGlow=[0,1].map(()=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false}));sp.scale.set(0.9,0.9,1);sp.visible=false;this.scene.add(sp);return sp;});
  this.beamMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{k:{value:0}},
   polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
   vertexShader:'varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   // q.y: 0 at the bumper, 1 far ahead. Brightest a few metres out, feathered at the sides.
   fragmentShader:'varying vec2 q;uniform float k;void main(){float x=abs(q.x-0.5)*2.0;float w=mix(0.35,1.0,q.y);float side=1.0-smoothstep(0.35*w,w,x);float along=smoothstep(0.0,0.12,q.y)*(1.0-smoothstep(0.35,1.0,q.y));gl_FragColor=vec4(vec3(1.0,0.86,0.62)*k*side*along*0.22,1.0);}'});
  const geo=new THREE.PlaneGeometry(9,26);geo.rotateX(-Math.PI/2);geo.translate(0,0,13);
  this.beam=new THREE.Mesh(geo,this.beamMat);this.beam.frustumCulled=false;this.beam.visible=false;this.beam.matrixAutoUpdate=false;this.scene.add(this.beam);
 }
 loadSurface(name){
  const t=new THREE.TextureLoader().load(`assets/prototype/${name}_color.jpg`);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,this.engine.capabilities.getMaxAnisotropy());return t;
 }
 makeEnvironment(){
  // Cheap, static sky reflection: the period look, not glossy real-time mirrors.
  const c=document.createElement('canvas');c.width=128;c.height=64;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,64);grad.addColorStop(0,'#7294bf');grad.addColorStop(.48,'#d7e0df');grad.addColorStop(.52,'#8c897e');grad.addColorStop(1,'#414035');g.fillStyle=grad;g.fillRect(0,0,128,64);
  const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;
  const p=new THREE.PMREMGenerator(this.engine);this.envTarget=p.fromEquirectangular(t);this.scene.environment=this.envTarget.texture;p.dispose();t.dispose();
 }
 makeSky(){
  const u=this.uniforms;
  this.skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{
   top:{value:new THREE.Color()},bottom:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()},sunColour:{value:new THREE.Color()},
   night:u.amNight,time:u.amClock,wet:u.amWet,amShadowTint:u.amShadowTint,amHighTint:u.amHighTint,amSat:u.amSat,amContrast:u.amContrast},
   vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   // Deeper zenith, a pale haze band at the horizon, a sun glow and a few stars.
   fragmentShader:`varying vec3 d;uniform vec3 top,bottom,sunDir,sunColour;uniform float night,time,wet;
   float hh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
   float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
   float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=0.5;}return s;}
   float h1(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
   void main(){vec3 ray=normalize(d);float y=max(ray.y,0.0);
    vec3 c=mix(bottom,top*0.92,pow(y,0.45));
    c=mix(c,bottom*1.08,exp(-y*14.0)*0.6);
    float sun=max(dot(ray,sunDir),0.0);
    c+=sunColour*(pow(sun,4500.0)*1.4+pow(sun,48.0)*0.12+pow(sun,5.0)*0.06*(1.0-y));
    // Cumulus: fbm on a cloud deck projected from the eye, drifting east, lit
    // from the sun side (one extra fbm tap toward the sun), fading into the
    // horizon haze. Rain closes the deck to a grey overcast.
    float cloudA=0.0;
    if(ray.y>0.0){
     vec2 p=ray.xz/(ray.y+0.06)*0.55+vec2(time*0.004,time*0.0015);
     float n=fbm(p), cover=mix(0.52,0.2,wet);
     float dens=smoothstep(cover,cover+0.28,n);
     float ln=fbm(p+sunDir.xz*0.12);
     float lit=clamp(0.62+(n-ln)*3.2,0.25,1.15);
     float lum=dot(top,vec3(.2126,.7152,.0722))+dot(bottom,vec3(.2126,.7152,.0722));
     vec3 base=mix(bottom*0.78,vec3(lum*0.5),0.4)*mix(1.0,0.75,wet);
     vec3 lift=bottom*1.05+sunColour*0.35*(1.0-wet*0.7);
     vec3 cc=mix(base,lift,lit)*(1.0-0.75*night)+vec3(0.05,0.035,0.025)*night;
     float fade=smoothstep(0.015,0.2,y);
     cloudA=dens*fade*mix(0.95,1.0,wet);
     c=mix(c,cc,cloudA);
    }
    vec3 cell=floor(ray*300.0);float st=step(0.9988,h1(cell))*smoothstep(0.05,0.35,y)*night;
    c+=vec3(0.55,0.6,0.7)*st*(0.3+0.5*h1(cell+3.0))*(1.0-cloudA);
    // Town glow under a night sky: sodium light scattered in the low haze.
    c+=vec3(0.12,0.08,0.05)*night*exp(-y*9.0);
    gl_FragColor=vec4(c,1.0);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(4000,24,12),this.skyMaterial);this.sky.frustumCulled=false;
  // Drawn after the opaque world so early depth rejects every covered pixel: the
  // cumulus fbm then only runs where sky is actually visible.
  this.sky.renderOrder=10;this.scene.add(this.sky);
 }
 resize(){
  const dpr=Math.min(window.devicePixelRatio||1,this.maxDpr)*this.scale,w=Math.max(1,Math.round(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.round(this.canvas.clientHeight*dpr));
  if(this.canvas.width!==w||this.canvas.height!==h)this.engine.setSize(w,h,false);
  this.aspect=w/h;
 }
 upload(b){
  if(b.finish)b.finish();
  const n=b.v.length/9,p=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3);
  for(let i=0;i<n;i++)for(let j=0;j<3;j++){p[i*3+j]=b.v[i*9+j];nor[i*3+j]=b.v[i*9+3+j];col[i*3+j]=linear(b.v[i*9+6+j]);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(p,3));geometry.setAttribute('normal',new THREE.BufferAttribute(nor,3));geometry.setAttribute('color',new THREE.BufferAttribute(col,3));
  if(b.uv?.length)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(b.uv),2));
  if(b.rect?.length)geometry.setAttribute('atlasRect',new THREE.BufferAttribute(new Float32Array(b.rect),4));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(b.i),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const bytes=Object.values(geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0)+geometry.index.array.byteLength;
  const h={geometry,count:b.i.length,bytes,min:b.min.slice(),max:b.max.slice(),nodes:[],frame:-1,used:0};
  this.handles.add(h);this.gpuBytes+=bytes;return h;
 }
 free(h){if(!h||!this.handles.has(h))return;h.geometry.dispose();for(const n of h.nodes){this.scene.remove(n);n.material.dispose();n.customDepthMaterial?.dispose();}this.gpuBytes-=h.bytes;h.count=0;h.nodes=[];this.handles.delete(h);}
 blankIndices(h,start,count){if(!h?.count)return;h.geometry.index.array.fill(0,start,Math.min(start+count,h.count));h.geometry.index.needsUpdate=true;}
 texture(image,opts={}){
  const t=new THREE.Texture(image);t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(opts.aniso||4,this.engine.capabilities.getMaxAnisotropy());
  // Supply only independent atlas mips. Never let a far roof sample an adjacent tile.
  // Each level halves the previous one with high-quality smoothing (H2): a single
  // drawImage from full size straight to 1/16 aliases brick into shimmer.
  if(opts.maxLevel!==undefined){
   let prev=image;
   for(let l=0;l<=opts.maxLevel;l++){const c=document.createElement('canvas');c.width=Math.max(1,image.width>>l);c.height=Math.max(1,image.height>>l);const g=c.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(prev,0,0,c.width,c.height);t.mipmaps.push(c);prev=c;}
   t.generateMipmaps=false;
  }
  t.needsUpdate=true;this.textureBytes+=image.width*image.height*4*4/3;return t;
 }
 setEnvironment(e){this.env=e;}
 setGameState(G){this.game=G;this.time=G.time||0;}
 visible(h){
  if(!h?.count)return false;
  // Include off-camera casters. Three then culls colour and shadow passes separately.
  const dx=Math.max(h.min[0]-this.eye[0],0,this.eye[0]-h.max[0]),dz=Math.max(h.min[2]-this.eye[2],0,this.eye[2]-h.max[2]);
  return (this.shadows&&dx*dx+dz*dz<180*180)||aabbInFrustum(this.planes,h.min,h.max);
 }
 // The six lit streetlights nearest the car: a partial selection, no sort, no arrays.
 pickPoles(x,z){
  const poles=this.game.world?.poles||[],best=this.nearPoles,d=this._poleD;best.length=0;d.length=0;
  for(let i=0;i<poles.length;i++){
   const p=poles[i];if(p.kind!=='streetlight'||p.dead)continue;
   const q=(p.x-x)**2+(p.z-z)**2;if(best.length===6&&q>=d[5])continue;
   let k;if(best.length<6){best.push(p);d.push(q);k=best.length-1;}else k=5;
   while(k>0&&d[k-1]>q){best[k]=best[k-1];d[k]=d[k-1];k--;}best[k]=p;d[k]=q;
  }
 }
 begin(pos,yaw,pitch,fov,opts){
  this._start=performance.now();this.resize();this.frame++;for(const n of this.active)n.visible=false;this.active.length=0;
  const u=this.uniforms;
  this.eye=pos;u.amEye.value.fromArray(pos);u.amClock.value=this.time;
  if(opts?.world)this.camWorld.set(opts.world);else m4.compose(this.camWorld,...pos,yaw,pitch,0);
  this.camera.matrix.fromArray(this.camWorld);this.camera.matrixWorldNeedsUpdate=true;
  this.camera.fov=fov*180/Math.PI;this.camera.aspect=this.aspect;this.camera.near=opts?.near||0.4;this.camera.far=9000;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  this.vp.set(_m4.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).elements);extractFrustum(this.planes,this.vp);
  const e=this.env,s=this.skyMaterial.uniforms;this.sky.position.fromArray(pos);
  const power=Math.max(e.sun[0],e.sun[1],e.sun[2]),night=1-Math.min(1,power*3);
  // Look: day -> golden (low sun) -> night.
  const dirY=e.lightDir[1]/Math.hypot(e.lightDir[0],e.lightDir[1],e.lightDir[2]);
  const gold=(1-night)*(1-Math.min(1,Math.max(0,(dirY-0.08)/0.3)));
  const L=this._look||(this._look=[0,0,0,[0,0,0],[0,0,0],0,0,0]);
  for(let i=0;i<8;i++){
   const a=LOOK.day[i],b=LOOK.gold[i],c=LOOK.night[i];
   if(Array.isArray(a))for(let j=0;j<3;j++)L[i][j]=lerp(lerp(a[j],b[j],gold),c[j],night);
   else L[i]=lerp(lerp(a,b,gold),c,night);
  }
  this.engine.toneMappingExposure=L[2];
  u.amShadowTint.value.fromArray(L[3]);u.amHighTint.value.fromArray(L[4]);u.amSat.value=L[5];u.amContrast.value=L[6];
  srgb(s.top.value,e.sky);srgb(s.bottom.value,e.fog);s.sunDir.value.fromArray(e.lightDir).normalize();srgb(s.sunColour.value,e.sun);
  srgb(this.scene.fog.color,e.fog);this.scene.fog.density=e.fogDensity*1.55*L[7];
  u.amSunDir.value.copy(s.sunDir.value);
  // Haze toward the sun: fog colour pushed toward the sun's hue, by how strong it is.
  srgb(_c,e.sun,power>0?1/power:0);u.amSunFog.value.copy(this.scene.fog.color).lerp(_c.multiply(this.scene.fog.color).multiplyScalar(1.6),Math.min(1,power)*0.8);
  u.amNight.value=night;u.amWet.value=Math.min(1,Math.max(0,this.game?.weather?.wet||0));
  srgb(this.sun.color,e.sun,power>0?1/power:0);this.sun.intensity=power*L[1];
  srgb(this.hemi.color,e.sky);srgb(this.hemi.groundColor,e.ground);this.hemi.intensity=L[0];
  // Period-style blue ambient fill keeps roads readable without a fake second sun.
  this.hemi.color.lerp(NIGHT_SKY,night);this.hemi.groundColor.lerp(NIGHT_GROUND,night);
  // Sun and shadow camera share a direction. Snap the centre in LIGHT space.
  const dir=s.sunDir.value;this._target.fromArray(pos);this._target.y-=2;
  this._sunRight.crossVectors(UP,dir).normalize();this._sunUp.crossVectors(dir,this._sunRight).normalize();
  const texel=176/this.sun.shadow.mapSize.x;
  for(const axis of [this._sunRight,this._sunUp]){const d=this._target.dot(axis);this._target.addScaledVector(axis,Math.round(d/texel)*texel-d);}
  this.sun.target.position.copy(this._target);this.sun.position.copy(this._target).addScaledVector(dir,260);
  this.sun.shadow.intensity=Math.min(1,Math.max(0,(dir.y-.015)/.12));
  this.sun.shadow.autoUpdate=this.shadows&&power>0.02;this.sun.visible=true;
  this.engine.shadowMap.enabled=this.shadows;
  const v=this.game?.veh;
  if(v){
   _f.set(Math.sin(v.yaw),0,Math.cos(v.yaw));_r.set(Math.cos(v.yaw),0,-Math.sin(v.yaw));
   // D4: the headlight shadow map only renders while the headlights are on.
   const lights=night>0.02;
   const hw=Math.min(0.66,(v.spec.wid||1.7)*0.37);
   for(let i=0;i<2;i++){const l=this.headlights[i];l.position.set(v.x,v.bodyY+.7,v.z).addScaledVector(_f,v.spec.len*.5+.05).addScaledVector(_r,(i?1:-1)*hw);
    const gl=this.lampGlow[i];gl.position.copy(l.position).addScaledVector(_f,0.12);gl.visible=night>0.05;gl.material.opacity=Math.min(1,night*1.2);l.target.position.copy(l.position).addScaledVector(_f,40);l.target.position.y-=1.4;l.intensity=night*38;l.shadow.autoUpdate=this.shadows&&lights;}
   // Road wash ahead of the car, laid in the car's heading on the ground under it.
   this.beam.visible=night>0.05;this.beamMat.uniforms.k.value=night;
   if(this.beam.visible){const gy=(v.y??v.bodyY)+0.06;_m4.makeRotationY(v.yaw).setPosition(v.x+_f.x*(v.spec.len*.5),gy,v.z+_f.z*(v.spec.len*.5));this.beam.matrix.copy(_m4);this.beam.matrixWorldNeedsUpdate=true;}
   if(this.frame%30===1)this.pickPoles(v.x,v.z);
   for(let i=0;i<6;i++){const l=this.streetlights[i],p=this.nearPoles[i];l.intensity=p&&!p.dead?night*42:0;if(p)l.position.set(p.x,p.y+5.5,p.z);}
  }
  this.scene.environmentIntensity=0.3*(1-night)+0.018;
 }
 makeNode(h,opts,role){
  const mat=opts.unlit?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:role==='car'?.52:role==='water'?.32:.96,metalness:role==='car'?.12:0});
  mat.defaultAttributeValues={...mat.defaultAttributeValues,atlasRect:[0,0,0,0]};
  mat.map=opts.tex||null;mat.alphaTest=opts.tex?0.35:0;mat.side=THREE.FrontSide;
  const uniforms={...this.uniforms,amFogMul:{value:1}};extend(mat,role,uniforms);
  const node=new THREE.Mesh(h.geometry,mat);node.matrixAutoUpdate=false;node.userData={role,uniforms,tex:opts.tex||null,cm:[-1,-1,-1]};
  // Leaf cards antialias their cut-out through MSAA coverage instead of a hard alpha test.
  if(!opts.unlit&&(role==='world'||role==='object'))mat.alphaToCoverage=true;
  if(opts.tex||(!opts.unlit&&(role==='world'||role==='object'))){const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:opts.tex||null,alphaTest:opts.tex?.35:0});depth.defaultAttributeValues={...depth.defaultAttributeValues,atlasRect:[0,0,0,0]};extend(depth,'depth',uniforms);node.customDepthMaterial=depth;}
  this.scene.add(node);return node;
 }
 draw(h,model,opts={}){
  opts=opts||{};
  // The sky dome and the flat cloud layer are drawn by the sky shader (makeSky).
  if(!h?.count||opts.sky||opts.clouds)return;
  if(h.frame!==this.frame){h.frame=this.frame;h.used=0;}
  const i=h.used++,role=opts.water?'water':opts.material||'object';let n=h.nodes[i];
  if(!n||n.userData.role!==role||n.userData.tex!==(opts.tex||null)||!!n.material.isMeshBasicMaterial!==!!opts.unlit){
   if(n){this.scene.remove(n);n.material.dispose();n.customDepthMaterial?.dispose();}
   n=this.makeNode(h,opts,role);h.nodes[i]=n;
  }
  const blend=opts.additive?THREE.AdditiveBlending:THREE.NormalBlending;if(n.material.blending!==blend){n.material.blending=blend;n.material.needsUpdate=true;}
  n.visible=true;n.matrix.fromArray(model);n.matrixWorldNeedsUpdate=true;
  // D10: convert the colour multiplier only when it changes (no THREE.Color per draw).
  const cm=opts.colorMul||WHITE,last=n.userData.cm;
  if(last[0]!==cm[0]||last[1]!==cm[1]||last[2]!==cm[2]){last[0]=cm[0];last[1]=cm[1];last[2]=cm[2];n.material.color.setRGB(cm[0],cm[1],cm[2],THREE.SRGBColorSpace);}
  const alpha=opts.alpha??1,transparent=alpha<1;n.material.opacity=alpha;
  if(n.material.transparent!==transparent){n.material.transparent=transparent;n.material.needsUpdate=true;}
  n.material.depthWrite=!transparent;n.userData.uniforms.amFogMul.value=opts.fogMul||1;
  n.castShadow=!opts.unlit&&!opts.water&&opts.fogMul!==.28&&alpha>.98;n.receiveShadow=!opts.unlit;
  n.material.shadowSide=THREE.BackSide;this.active.push(n);
 }
 end(){
  this.engine.render(this.scene,this.camera);
  this.stats.draws=this.engine.info.render.calls;this.stats.tris=this.engine.info.render.triangles;
  this.stats.submitMs=performance.now()-this._start;
  const now=performance.now();if(this._last&&now-this._last<250)this.timing.push(now-this._last);this._last=now;
  if(this.timing.length>600)this.timing.shift();
 }
 // D7: a second renderer (the menu turntable) gives back its GPU context, shadow
 // maps, PMREM target and surface textures when it is no longer needed.
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const h of [...this.handles])this.free(h);
  this.envTarget?.dispose();for(const k of ['amAsphalt','amGrass','amConcrete'])this.uniforms[k].value?.dispose();
  this.sky?.geometry.dispose();this.skyMaterial?.dispose();
  this.sun.shadow.map?.dispose();for(const l of this.headlights)l.shadow.map?.dispose();
  this.engine.dispose();this.engine.forceContextLoss();
 }
 report(){const t=[...this.timing].sort((a,b)=>a-b);return {renderer:'Three.js r170',frames:t.length,medianMs:t[Math.floor(t.length*.5)],p95Ms:t[Math.floor(t.length*.95)],...this.stats,
  geometryMB:Math.round(this.gpuBytes/1048576),textureEstimateMB:Math.round(this.textureBytes/1048576),geometries:this.engine.info.memory.geometries,programs:this.engine.info.programs.length,shadowMap:this.sun.shadow.mapSize.x};}
}
