// Three.js adapter for Aylmer's existing immediate-mode renderer API.
// The simulation, world builders, coordinates, car meshes and collisions stay original.
import {SIDING_GLSL} from './siding.js';
import * as THREE from '../../vendor/prototype/three.module.min.js';
import { m4, extractFrustum, aabbInFrustum } from '../core/math.js';
export const WHITE = new Float32Array([1,1,1]);
const linear = v => v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
const color = a => new THREE.Color().setRGB(...a,THREE.SRGBColorSpace);
const VARY = 'varying vec4 amRect; varying vec3 amWorld; varying vec3 amNormal;';
const MAP = `#ifdef USE_MAP
 vec2 amUV=vMapUv;
 if(amRect.z>0.0)amUV=amRect.xy+fract(vMapUv)*amRect.zw;
 vec4 sampledDiffuseColor=textureGrad(map,amUV,dFdx(vMapUv)*(amRect.z>0.0?amRect.zw:vec2(1.0)),dFdy(vMapUv)*(amRect.z>0.0?amRect.zw:vec2(1.0)));
 if(amRect.z>0.0)sampledDiffuseColor.a=1.0;
 ${SIDING_GLSL}
 diffuseColor*=sampledDiffuseColor;
 #endif`;
function extend(material,role,uniforms) {
 material.customProgramCacheKey=()=>`aylmer2004-${role}-v1`;
 material.onBeforeCompile=s=>{
  Object.assign(s.uniforms,uniforms);
  s.vertexShader=VARY+'\nattribute vec4 atlasRect;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   amRect=atlasRect;amWorld=(modelMatrix*vec4(position,1.0)).xyz;
   amNormal=normalize(mat3(modelMatrix)*normal);`);
  s.fragmentShader=VARY+'\nuniform vec3 amEye; uniform sampler2D amAsphalt,amGrass,amConcrete; uniform float amClock,amFogMul;\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',MAP);
  if(role==='world')s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   // Only upward-facing ground receives projected grain; cars/signs use other roles.
   float up=smoothstep(0.72,0.95,amNormal.y)*(1.0-step(0.001,amRect.z));
   float grass=step(vColor.r*1.25,vColor.g)*step(vColor.b*1.3,vColor.g);
   float road=(1.0-step(0.095,max(vColor.r,max(vColor.g,vColor.b))))*(1.0-grass);
   float concrete=step(0.30,vColor.r)*step(0.30,vColor.g)*(1.0-step(0.60,vColor.r))*(1.0-grass);
   vec3 a=texture2D(amAsphalt,amWorld.xz/5.0).rgb;
   vec3 g=texture2D(amGrass,amWorld.xz/5.5).rgb;
   vec3 c=texture2D(amConcrete,amWorld.xz/4.0).rgb;
   diffuseColor.rgb*=mix(vec3(1),vec3(clamp(dot(a,vec3(.2126,.7152,.0722))/.058,0.65,1.45)),road*up*0.4);
   diffuseColor.rgb*=mix(vec3(1),vec3(clamp(dot(g,vec3(.2126,.7152,.0722))/.14,0.65,1.35)),grass*up*0.45);
   diffuseColor.rgb*=mix(vec3(1),vec3(clamp(c.r/.48,0.7,1.25)),concrete*up*0.6);`);
  if(role==='water')s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   normal=normalize(normal+vec3(sin(amWorld.x*0.23+amClock)*0.08,0.0,cos(amWorld.z*0.3-amClock*0.7)*0.08));`);
  // Fade shadow coverage before reaching the small, high-resolution shadow volume.
  s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replace(
   'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
   'mix(getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ),1.0,smoothstep(48.0,72.0,distance(amWorld.xz,amEye.xz)))'));
  s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',THREE.ShaderChunk.fog_fragment.replace('fogDensity * fogDensity','fogDensity * fogDensity * amFogMul * amFogMul'));
 };
}
export class Renderer {
 constructor(canvas) {
  this.isPrototype=true;this.materialAtlas='atlas.real';this.canvas=canvas;this.scale=0.85;this.maxDpr=1.5;
  this.engine=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
  this.gl=this.engine.getContext();this.engine.outputColorSpace=THREE.SRGBColorSpace;
  this.engine.toneMapping=THREE.ACESFilmicToneMapping;this.engine.toneMappingExposure=1.05;
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
   l.shadow.camera.near=0.3;this.scene.add(l,l.target);this.headlights.push(l);
  }
  this.streetlights=Array.from({length:6},()=>{const l=new THREE.PointLight(0xffc577,0,24,1.5);this.scene.add(l);return l;});
  this.frame=0;this.handles=new Set();this.active=[];this.gpuBytes=0;this.textureBytes=0;
  this.stats={draws:0,tris:0};this.timing=[];this._last=0;this.time=0;this.shadows=true;
  this.eye=[0,0,0];this.vp=m4.create();this.view=m4.create();this.proj=m4.create();this.camWorld=m4.create();this.planes=new Float32Array(24);
  this.uniforms={amEye:{value:new THREE.Vector3()},amClock:{value:0},amFogMul:{value:1},
   amAsphalt:{value:this.loadSurface('asphalt')},amGrass:{value:this.loadSurface('grass')},amConcrete:{value:this.loadSurface('concrete')}};
  this._sunRight=new THREE.Vector3();this._sunUp=new THREE.Vector3();this._target=new THREE.Vector3();
  this.makeSky();this.makeEnvironment();this.resize();
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
  this.skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{
   top:{value:new THREE.Color()},bottom:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3()},sunColour:{value:new THREE.Color()}},
   vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`varying vec3 d;uniform vec3 top,bottom,sunDir,sunColour;void main(){vec3 ray=normalize(d);float h=pow(max(ray.y,0.0),0.55);vec3 c=mix(bottom,top,h);float sun=max(dot(ray,sunDir),0.0);c+=sunColour*(pow(sun,4500.0)*1.2+pow(sun,22.0)*0.07);gl_FragColor=vec4(c,1.0);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(4000,24,12),this.skyMaterial);this.sky.frustumCulled=false;this.sky.renderOrder=-10;this.scene.add(this.sky);
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
  if(opts.maxLevel!==undefined){
   for(let l=0;l<=opts.maxLevel;l++){const c=document.createElement('canvas');c.width=Math.max(1,image.width>>l);c.height=Math.max(1,image.height>>l);c.getContext('2d').drawImage(image,0,0,c.width,c.height);t.mipmaps.push(c);}
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
 begin(pos,yaw,pitch,fov,opts){
  this._start=performance.now();this.resize();this.frame++;for(const n of this.active)n.visible=false;this.active.length=0;
  this.eye=pos;this.uniforms.amEye.value.fromArray(pos);this.uniforms.amClock.value=this.time;
  if(opts?.world)this.camWorld.set(opts.world);else m4.compose(this.camWorld,...pos,yaw,pitch,0);
  this.camera.matrix.fromArray(this.camWorld);this.camera.matrixWorldNeedsUpdate=true;
  this.camera.fov=fov*180/Math.PI;this.camera.aspect=this.aspect;this.camera.near=opts?.near||0.4;this.camera.far=9000;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  this.vp.set(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).elements);extractFrustum(this.planes,this.vp);
  const e=this.env,s=this.skyMaterial.uniforms;this.sky.position.fromArray(pos);
  s.top.value.copy(color(e.sky));s.bottom.value.copy(color(e.fog));s.sunDir.value.fromArray(e.lightDir).normalize();s.sunColour.value.copy(color(e.sun));
  this.scene.fog.color.copy(color(e.fog));this.scene.fog.density=e.fogDensity;
  const power=Math.max(...e.sun),night=1-Math.min(1,power*3);
  this.sun.color.copy(color(e.sun.map(v=>power>0?v/power:0)));this.sun.intensity=power*2.5;
  this.hemi.color.copy(color(e.sky));this.hemi.groundColor.copy(color(e.ground));this.hemi.intensity=2.1;
  // Period-style blue ambient fill keeps roads readable without a fake second sun.
  this.hemi.color.lerp(new THREE.Color(0x637da6),night);this.hemi.groundColor.lerp(new THREE.Color(0x343c50),night);
  // Sun and shadow camera share a direction. Snap the centre in LIGHT space.
  const dir=s.sunDir.value;this._target.fromArray(pos);this._target.y-=2;
  this._sunRight.crossVectors(new THREE.Vector3(0,1,0),dir).normalize();this._sunUp.crossVectors(dir,this._sunRight).normalize();
  const texel=176/this.sun.shadow.mapSize.x;
  for(const axis of [this._sunRight,this._sunUp]){const d=this._target.dot(axis);this._target.addScaledVector(axis,Math.round(d/texel)*texel-d);}
  this.sun.target.position.copy(this._target);this.sun.position.copy(this._target).addScaledVector(dir,260);
  this.sun.shadow.intensity=Math.min(1,Math.max(0,(dir.y-.015)/.12));
  this.sun.shadow.autoUpdate=this.shadows&&power>0.02;this.sun.visible=true;
  this.engine.shadowMap.enabled=this.shadows;
  const v=this.game?.veh;
  if(v){
   const f=new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw)),right=new THREE.Vector3(Math.cos(v.yaw),0,-Math.sin(v.yaw));
   this.headlights.forEach((l,i)=>{l.position.set(v.x,v.bodyY+.72,v.z).addScaledVector(f,v.spec.len*.5+.15).addScaledVector(right,(i?1:-1)*.6);l.target.position.copy(l.position).addScaledVector(f,40);l.target.position.y-=1.4;l.intensity=night*38;});
   if(this.frame%30===1){this.nearPoles=(this.game.world?.poles||[]).filter(p=>p.kind==='streetlight'&&!p.dead).sort((a,b)=>(a.x-v.x)**2+(a.z-v.z)**2-(b.x-v.x)**2-(b.z-v.z)**2).slice(0,6);}
   this.streetlights.forEach((l,i)=>{const p=this.nearPoles?.[i];l.intensity=p&&!p.dead?night*30:0;if(p)l.position.set(p.x,p.y+5.5,p.z);});
  }
  this.scene.environmentIntensity=0.3*(1-night)+0.018;
 }
 makeNode(h,opts,role){
  const mat=opts.unlit?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:role==='car'?.52:role==='water'?.32:.96,metalness:role==='car'?.12:0});
  mat.defaultAttributeValues={...mat.defaultAttributeValues,atlasRect:[0,0,0,0]};
  mat.map=opts.tex||null;mat.alphaTest=opts.tex?0.35:0;mat.side=THREE.FrontSide;
  const uniforms={...this.uniforms,amFogMul:{value:1}};extend(mat,role,uniforms);
  const node=new THREE.Mesh(h.geometry,mat);node.matrixAutoUpdate=false;node.userData={role,uniforms,tex:opts.tex||null};
  if(opts.tex){const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:opts.tex,alphaTest:.35});depth.defaultAttributeValues={...depth.defaultAttributeValues,atlasRect:[0,0,0,0]};extend(depth,'depth',uniforms);node.customDepthMaterial=depth;}
  this.scene.add(node);return node;
 }
 draw(h,model,opts={}){
  opts=opts||{};
  if(!h?.count||opts.sky)return;
  if(h.frame!==this.frame){h.frame=this.frame;h.used=0;}
  const i=h.used++,role=opts.water?'water':opts.material||'object';let n=h.nodes[i];
  if(!n||n.userData.role!==role||n.userData.tex!==(opts.tex||null)||!!n.material.isMeshBasicMaterial!==!!opts.unlit){
   if(n){this.scene.remove(n);n.material.dispose();n.customDepthMaterial?.dispose();}
   n=this.makeNode(h,opts,role);h.nodes[i]=n;
  }
  n.visible=true;n.matrix.fromArray(model);n.matrixWorldNeedsUpdate=true;n.material.color.copy(color(opts.colorMul||WHITE));
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
 report(){const t=[...this.timing].sort((a,b)=>a-b);return {renderer:'Three.js r170',frames:t.length,medianMs:t[Math.floor(t.length*.5)],p95Ms:t[Math.floor(t.length*.95)],...this.stats,
  geometryMB:Math.round(this.gpuBytes/1048576),textureEstimateMB:Math.round(this.textureBytes/1048576),geometries:this.engine.info.memory.geometries,programs:this.engine.info.programs.length,shadowMap:this.sun.shadow.mapSize.x};}
}
