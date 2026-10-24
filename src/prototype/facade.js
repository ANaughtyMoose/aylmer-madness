// Shader-drawn building detail for the prototype renderer (docs/design/VISUAL-PLAN.md
// rank 13 and 15). Everything here costs fragment ALU, not triangles:
//
//   HOUSE   brick at true course height (7.5 cm), three-tab shingles on roof
//           slopes, and "sized" decals: a window / garage-door panel whose
//           atlasRect is [widthM, heightM, -0.5, style] is drawn procedurally
//           (frame, sill, muntins, recessed glass with a parallax reveal,
//           curtains, shutters; sectional garage-door panels) instead of
//           stretching one photo over every size.
//   FACADE  non-house walls (world.js, prototype only) carry
//           atlasRect = [metres along wall, metres above footing,
//           -(kind*1000 + front*500 + height*10), wall length]; the shader draws
//           storefront glazing, sign bands, punched windows with sills, cornices,
//           metal cladding and loading doors from that.
//
// Glass sets amGlass, so the renderer's existing glass path makes it glossy by
// day and lights about half the rooms at night.
import {TILES} from '../game/materials_stub.js';
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const colour=name=>`vec3(${[16,8,0].map(n=>linear((TILES[name]>>n&255)/255).toFixed(5)).join(',')})`;

// Helpers, appended to the shared fragment head.
export const FACADE_HEAD=`
float amBand(float x,float a,float b,float aa){return smoothstep(a-aa,a+aa,x)*(1.0-smoothstep(b-aa,b+aa,x));}
float amRectMask(vec2 p,vec2 lo,vec2 hi,vec2 aa){return amBand(p.x,lo.x,hi.x,aa.x)*amBand(p.y,lo.y,hi.y,aa.y);}
// Running-bond brick, 20 x 6.5 cm faces and 1 cm joints, p = (along, up) metres.
vec3 amBrick(vec2 p,vec3 base){
 float row=floor(p.y/0.075);
 vec2 c=vec2(p.x/0.205+0.5*mod(row,2.0)+amHash(vec2(row,3.0))*0.0,p.y/0.075);
 vec2 f=fract(c),e=min(f,1.0-f),aa=max(fwidth(c),vec2(1e-4));
 float face=smoothstep(0.03-aa.x,0.03+aa.x,e.x)*smoothstep(0.07-aa.y,0.07+aa.y,e.y);
 float r=amHash(floor(c)+vec2(7.0,1.0));
 vec3 b=base*(0.84+0.3*r)*mix(vec3(1.0),vec3(1.06,0.95,0.9),step(0.8,amHash(floor(c)+2.0)));
 vec3 mortar=mix(vec3(0.46,0.44,0.40),base,0.25);
 vec3 col=mix(mortar,b,face);
 // Far away the joints are sub-pixel: settle on the average instead of moire.
 return mix(col,mix(mortar,base,0.86),smoothstep(0.25,0.6,aa.y));
}
// One window, drawn in its own panel. lp metres from the panel's bottom-left,
// sz = panel size, fr = frame colour, style 0 double-hung, 1 picture (3 lights),
// 2 small single. Returns rgb; sets glass (0/1) and alpha (0 = cut away).
vec3 amWindowPane(vec2 lp,vec2 sz,vec3 fr,float style,float seed,out float glass,out float alpha){
 vec2 aa=max(fwidth(lp),vec2(1e-4));
 glass=0.0;alpha=1.0;
 float sill=0.12;
 // Sill: a projecting lighter ledge with its shadow line, under the frame.
 if(lp.y<sill){
  if(lp.y<0.045||lp.x<0.02||lp.x>sz.x-0.02){alpha=0.0;return fr;}
  return fr*mix(0.62,1.08,smoothstep(0.045,0.08,lp.y));
 }
 vec2 q=lp-vec2(0.0,sill);vec2 s=vec2(sz.x,sz.y-sill);
 float f=0.075;
 vec2 g=q-f,gs=s-2.0*f;
 // Recess: the far jamb and the head show as a strip whose width follows the view angle.
 vec3 V=normalize(amWorld-amEye);vec3 T=normalize(vec3(-amNormal.z,0.0,amNormal.x));
 float dn=max(0.08,-dot(V,amNormal));
 float rx=clamp(dot(V,T)/dn*0.11,-0.3,0.3),ry=clamp(V.y/dn*0.11,-0.3,0.3);
 float inGlass=amRectMask(g,vec2(0.0),gs,aa);
 if(inGlass<0.5){
  // frame, with a thin darker line where it meets the wall
  float edge=min(min(q.x,s.x-q.x),min(q.y,s.y-q.y));
  return fr*mix(0.72,1.0,smoothstep(0.0,0.018,edge));
 }
 vec3 col;
 // reveal (inner jamb, sill board, head) in the frame colour, shaded
 float rev=0.0,shadeR=1.0;
 if(rx>0.0&&g.x>gs.x-rx){rev=1.0;shadeR=0.8;}
 if(rx<0.0&&g.x<-rx){rev=1.0;shadeR=0.8;}
 if(ry>0.0&&g.y>gs.y-ry){rev=1.0;shadeR=0.55;}
 if(ry<0.0&&g.y<-ry){rev=1.0;shadeR=1.0;}
 if(rev>0.5)return fr*shadeR;
 // muntins / meeting rail
 float bar=0.0,w=0.035;
 if(style<0.5){bar=amBand(g.y,gs.y*0.5-w,gs.y*0.5+w,aa.y);}
 else if(style<1.5){float t=gs.x/3.0;bar=max(amBand(g.x,t-w,t+w,aa.x),amBand(g.x,2.0*t-w,2.0*t+w,aa.x));}
 if(bar>0.5)return fr*0.92;
 // Glass: sky reflection gradient, darker under the head, and what is behind it.
 float lv=g.y/max(gs.y,0.01),lu=g.x/max(gs.x,0.01);
 col=mix(vec3(0.09,0.10,0.115),vec3(0.24,0.27,0.30),smoothstep(0.1,1.0,lv));
 col*=mix(1.0,0.55,smoothstep(0.7,1.0,lv));
 glass=1.0;
 // Curtains or a blind in about half the rooms: soft fabric, not glass.
 float k=amHash(vec2(seed,floor(amWorld.y/2.6)+3.0));
 if(k<0.28){ // side curtains
  float c=max(smoothstep(0.22,0.18,lu),smoothstep(0.78,0.82,lu));
  vec3 cloth=mix(vec3(0.78,0.72,0.60),vec3(0.62,0.56,0.62),amHash(vec2(seed,9.0)));
  cloth*=0.85+0.15*sin(g.x*60.0);
  if(c>0.5){glass=0.35;col=cloth*0.55;}
 } else if(k<0.5){ // half-drawn blind
  if(lv>0.62){glass=0.35;col=vec3(0.80,0.78,0.72)*(0.5+0.1*step(0.5,fract(g.y*22.0)));}
 }
 return col;
}
// Sectional garage door: 4 rows of raised panels, some with a window row on top.
vec3 amGarageDoor(vec2 lp,vec2 sz,vec3 base,float seed,out float glass){
 glass=0.0;
 vec2 aa=max(fwidth(lp),vec2(1e-4));
 float edge=min(min(lp.x,sz.x-lp.x),sz.y-lp.y);
 if(edge<0.09)return vec3(0.93,0.92,0.88)*mix(0.7,1.0,smoothstep(0.0,0.03,edge));
 vec2 q=lp-vec2(0.09,0.0);vec2 s=sz-vec2(0.18,0.09);
 float rows=4.0,cols=max(2.0,floor(s.x/0.62+0.5));
 vec2 c=vec2(q.x/s.x*cols,q.y/s.y*rows);vec2 f=fract(c);
 float seam=1.0-amBand(fract(c.y+0.5)-0.5,-0.012*rows/s.y,0.012*rows/s.y,aa.y*rows/s.y);
 float windowsRow=step(0.5,amHash(vec2(seed,4.0)));
 if(windowsRow>0.5&&c.y>3.0){
  float wx=amBand(f.x,0.12,0.88,aa.x*cols/s.x),wy=amBand(f.y,0.25,0.75,aa.y*rows/s.y);
  if(wx*wy>0.5){glass=1.0;return vec3(0.06,0.07,0.085);}
 }
 // raised panel: lit top bevel, shaded bottom bevel
 float px=amBand(f.x,0.1,0.9,aa.x*cols/s.x),py=amBand(f.y,0.18,0.82,aa.y*rows/s.y);
 float bev=px*py;
 float lit=mix(1.0,mix(0.86,1.07,smoothstep(0.3,0.75,f.y)),1.0-bev);
 return base*lit*mix(0.7,1.0,seam);
}
// Three-tab shingles. p = (along the eave, up the slope) metres.
vec3 amShingle(vec2 p,vec3 base,vec3 grain){
 float row=floor(p.y/0.143);
 float off=amHash(vec2(row,1.7))*0.33;
 vec2 c=vec2((p.x+off)/0.333,p.y/0.143);vec2 f=fract(c),aa=max(fwidth(c),vec2(1e-4));
 float slot=smoothstep(0.012-aa.x,0.012+aa.x,min(f.x,1.0-f.x))+step(0.55,f.y);
 float tab=amHash(floor(c)+vec2(5.0,2.0));
 vec3 col=base*(0.82+0.3*tab)*mix(vec3(1.0),grain,0.35);
 // shadow line under the butt of the course above, and in the slots
 col*=mix(0.55,1.0,smoothstep(0.0,0.14+aa.y,f.y));
 col*=mix(0.62,1.0,clamp(slot,0.0,1.0));
 return mix(col,base*mix(vec3(1.0),grain,0.35)*0.92,smoothstep(0.2,0.5,aa.y));
}
// Blank sign-band colours: painted fascias typical of Principale in 2004.
vec3 amSignColour(float h){
 return h<0.2?vec3(0.36,0.06,0.05):h<0.4?vec3(0.06,0.17,0.10):h<0.6?vec3(0.05,0.08,0.20):h<0.8?vec3(0.72,0.66,0.52):vec3(0.06,0.06,0.06);
}
`;

// House surfaces (building role, inside the atlas branch, after sampling).
export const HOUSE_GLSL=`
 // Brick walls: true-scale courses instead of the stretched photograph.
 if(amRect.z>0.0 && amRect.y<0.1 && amRect.x>0.16 && amRect.x<0.655 && abs(amNormal.y)<0.35){
  vec3 base=amRect.x<0.33?${colour('brick_red')}:(amRect.x<0.49?${colour('brick_brown')}:${colour('brick_buff')});
  float m=amCellMetres(amRect);
  vec2 p=vMapUv.y>500.0?vec2(vMapUv.x*m,(1000.0-vMapUv.y)*m):vec2(dot(amWorld.xz,vec2(-amNormal.z,amNormal.x)),amWorld.y);
  vec3 grain=clamp(sampledDiffuseColor.rgb/max(base,vec3(0.02)),vec3(0.8),vec3(1.2));
  sampledDiffuseColor.rgb=amBrick(p,base)*mix(vec3(1.0),grain,0.15);
 }
 // Yellow clapboard and cedar shakes: lapped courses at true size, not the
 // photograph stretched to 2.4 m boards (the "very weird" Principale house).
 if(amRect.z>0.0 && amRect.y>0.3 && amRect.y<0.34 && (amRect.x<0.01 || amRect.x>0.82) && abs(amNormal.y)<0.35){
  bool cedar=amRect.x>0.82;
  vec3 base=cedar?${colour('cedar')}:${colour('clapboard_yellow')};
  float m=amCellMetres(amRect);
  vec2 p=vMapUv.y>500.0?vec2(vMapUv.x*m,(1000.0-vMapUv.y)*m):vec2(dot(amWorld.xz,vec2(-amNormal.z,amNormal.x)),amWorld.y);
  float course=p.y/(cedar?0.19:0.15),ph=fract(course),aa=max(fwidth(course),0.012);
  vec3 c=base*mix(0.78,1.0,smoothstep(0.0,aa+0.03,min(ph,1.0-ph)));
  if(cedar){
   float row=floor(course),x=p.x/0.24+amHash(vec2(row,1.0)),j=fract(x);
   c*=mix(0.72,1.0,smoothstep(0.0,0.05+fwidth(x),min(j,1.0-j)))*(0.85+0.3*amHash(vec2(floor(x),row)));
  }
  vec3 grain=clamp(sampledDiffuseColor.rgb/max(base,vec3(0.02)),vec3(0.85),vec3(1.15));
  sampledDiffuseColor.rgb=mix(c,base,smoothstep(0.3,0.7,aa))*mix(vec3(1.0),grain,0.12);
 }
 // Roof slopes: three-tab shingle courses running level along the eave.
 if(amRect.z>0.0 && amRect.y>0.3 && amRect.y<0.34 && amRect.x>0.33 && amRect.x<0.82 && amNormal.y>0.25){
  float sn=length(amNormal.xz);
  if(sn>0.15){
   vec3 base=amRect.x<0.49?${colour('shingle_dark')}:(amRect.x<0.655?${colour('shingle_brown')}:${colour('shingle_grey')});
   vec2 t=normalize(vec2(-amNormal.z,amNormal.x));
   vec3 grain=clamp(sampledDiffuseColor.rgb/max(base,vec3(0.02)),vec3(0.75),vec3(1.3));
   // Asphalt shingle as it really weathers: charcoal, brown, or a grey that has
   // gone slightly green. Never the pale grey a strong sun makes of a flat tile.
   if(amRect.x>0.655)base=vec3(0.052,0.056,0.050);
   sampledDiffuseColor.rgb=amShingle(vec2(dot(amWorld.xz,t),amWorld.y/sn),base*0.8,grain);
  }
 }
 // Sized decals from houses.js: [widthM, heightM, -0.5, style].
 if(amRect.z<-0.25 && amRect.z>-0.75){
  float cellU=floor(vMapUv.x*4.0);
  bool garage=vMapUv.y>0.742;
  float u0=cellU*0.25+0.00390625;
  vec2 lp=vec2((vMapUv.x-u0)/0.2421875,((garage?0.98828125:0.73828125)-vMapUv.y)/0.2421875);
  float gl=0.0,al=1.0;float seed=amHash(floor(amWorld.xz*0.25)+0.5);
  if(garage){
   sampledDiffuseColor.rgb=amGarageDoor(lp*amRect.xy,amRect.xy,vec3(0.90,0.89,0.85),seed,gl);
  } else {
   float shut=floor(amRect.w+0.01);
   vec3 fr=fract(amRect.w)>0.25?vec3(0.36,0.25,0.17):vec3(0.93,0.92,0.88);
   float W=amRect.x,tot=shut>0.5?W*1.9:W;
   vec2 p=vec2(lp.x*tot-(tot-W)*0.5,lp.y*amRect.y);
   if(p.x<0.0||p.x>W){
    // louvred shutter
    vec3 sc=shut<1.5?vec3(0.07,0.16,0.10):shut<2.5?vec3(0.05,0.05,0.05):shut<3.5?vec3(0.30,0.07,0.06):vec3(0.08,0.12,0.24);
    float x=p.x<0.0?-p.x:p.x-W;
    if(p.y<0.16||x<0.03||x>(tot-W)*0.5-0.02){al=0.0;}
    sampledDiffuseColor.rgb=sc*mix(0.7,1.1,smoothstep(0.2,0.8,fract(p.y*14.0)));
   } else {
    float style=cellU>0.5?(cellU>1.5?2.0:1.0):0.0;
    if(W>1.9)style=1.0;
    sampledDiffuseColor.rgb=amWindowPane(p,amRect.xy,fr,style,seed+cellU,gl,al);
   }
  }
  sampledDiffuseColor.a=al;amGlass=gl;
 }
 // Porch lamp beside the front door: a small lantern, lit on most houses after dark.
 if(amRect.z<-0.75 && amRect.z>-0.85){
  vec2 lp=vec2(fract(vMapUv.x*4.0),0.0);
  float cellU=floor(vMapUv.x*4.0);
  lp=vec2((vMapUv.x-(cellU*0.25+0.00390625))/0.2421875,(0.73828125-vMapUv.y)/0.2421875);
  float on=step(amHash(floor(amWorld.xz*0.5)+1.3),0.72);
  bool glassL=lp.x>0.18&&lp.x<0.82&&lp.y>0.16&&lp.y<0.8;
  sampledDiffuseColor.rgb=glassL?mix(vec3(0.55,0.52,0.42),vec3(1.0,0.86,0.62),amNight*on):vec3(0.05);
  sampledDiffuseColor.a=1.0;
  if(glassL)amGlow=amNight*amNight*on*vec3(1.0,0.72,0.42)*2.2;
 }
`;

// Non-house walls (world.js, prototype only). Runs in the colour stage, so
// diffuseColor already holds the wall paint.
export const FACADE_GLSL=`
 // kind 5: plain masonry on hand-built models (299 Fraser): brick courses only.
 if(amRect.z<-4500.0 && amRect.z>-5500.0 && abs(amNormal.y)<0.3){
  vec2 t=normalize(vec2(-amNormal.z,amNormal.x));
  diffuseColor.rgb=amBrick(vec2(dot(amWorld.xz,t),amWorld.y),diffuseColor.rgb*1.08);
 }
 if(amRect.z<-500.0 && amRect.z>-4500.0 && abs(amNormal.y)<0.3){
  float code=-amRect.z,kind=floor(code/1000.0+0.001);
  float rest=code-kind*1000.0,front=step(499.0,rest),H=(rest-front*500.0)/10.0;
  float s=amRect.x,h=amRect.y,L=amRect.w;
  vec2 aa=max(fwidth(vec2(s,h)),vec2(1e-4));
  vec3 wall=diffuseColor.rgb;
  float seed=amHash(vec2(floor(L*3.1),floor(H*7.0))+floor(amWorld.xz/40.0));
  float gl=0.0;
  bool redBrick=wall.r>wall.g*1.35&&kind!=2.0;
  vec3 col=wall;
  if(kind==2.0){
   // metal cladding: vertical ribs, a block base course
   float rib=fract(s/0.3);col=wall*mix(0.82,1.05,smoothstep(0.0,0.2,rib)*smoothstep(0.5,0.3,rib)+0.3*step(0.5,rib));
   if(h<1.0)col=vec3(0.52,0.51,0.48)*(0.9+0.1*step(0.04,fract(h/0.2))*step(0.02,fract(s/0.4+0.5*floor(h/0.2))));
  } else if(redBrick){
   col=amBrick(vec2(s,h),wall*1.1);
  } else {
   // split-face block or panel joints, quiet
   col=wall*mix(0.9,1.0,smoothstep(0.0,0.02+aa.y,min(fract(h/0.4),1.0-fract(h/0.4))*0.4));
  }
  // grounding: base course and contact darkening
  col*=mix(0.7,1.0,smoothstep(0.0,0.9,h));
  // cornice / parapet coping
  if(h>H-0.32)col=mix(vec3(0.34,0.33,0.31),vec3(0.78,0.76,0.72),step(H-0.1,h))*(kind==1.0?1.0:0.8);
  else if(h>H-0.5)col*=0.72;
  float storefront=kind==1.0&&front>0.5?1.0:0.0;
  float groundTop=storefront>0.5?min(3.6,H-0.6):0.0;
  if(storefront>0.5&&s>0.45&&s<L-0.45&&h<groundTop){
   float n=max(1.0,floor((L-0.9)/2.6+0.5)),bw=(L-0.9)/n;
   float bs=(s-0.45)/bw,bi=floor(bs),bf=fract(bs)*bw;
   float door=step(abs(bi-floor(n*0.5)),0.1);
   if(h<0.45&&door<0.5)col=vec3(0.18,0.17,0.16)*(0.9+0.2*amNoise(vec2(s*4.0,h*9.0)));
   else if(h<2.75){
    float mull=min(bf,bw-bf);
    if(mull<0.06)col=vec3(0.11,0.10,0.09);
    else if(abs(h-2.3)<0.04)col=vec3(0.11,0.10,0.09);
    else if(door>0.5&&h<2.26&&mull<0.14)col=vec3(0.11,0.10,0.09);
    else{
     // glass with a glimpse of a lit shop floor
     float lv=h/2.75;
     col=mix(vec3(0.16,0.17,0.18),vec3(0.36,0.40,0.44),smoothstep(0.1,1.0,lv));
     // the shop behind the glass: shelving and goods, seen as soft bands
     if(door<0.5&&h<2.0){float sh=fract(h/0.5+0.5*floor(bs));col=mix(col,vec3(0.30,0.24,0.18)*(0.6+0.8*amHash(floor(vec2(s*1.5,h*2.0)))),0.5*step(0.55,sh)*step(0.25,1.0-lv));}
     // shops keep their lights on by day: a little of it shows through the glass
     amGlow=vec3(0.075,0.068,0.052)*smoothstep(1.0,0.1,lv)*(1.0-0.5*door);
     // a soft diagonal sky reflection, and the lit shop floor behind the glass
     col+=vec3(0.05,0.055,0.06)*smoothstep(0.35,0.5,fract((s*0.8+h)*0.18))*smoothstep(0.75,0.6,fract((s*0.8+h)*0.18));
     col+=vec3(0.10,0.085,0.06)*smoothstep(0.55,0.0,lv)*(1.0-door);
     // big panes: a dimmer glow at night, brighter toward the shop floor
     gl=mix(0.55,0.8,smoothstep(1.0,0.2,lv));
    }
   } else if(h>2.9&&h<groundTop-0.05){
    // blank sign band with a light border
    vec3 sc=amSignColour(seed);
    float bd=min(min(h-2.9,groundTop-0.05-h),min(s-0.45,L-0.45-s));
    col=bd<0.05?vec3(0.8,0.78,0.72):sc*(0.9+0.1*amNoise(vec2(s*2.0,h*6.0)));
    // pre-LED backlit box sign: a dim glow in its own colour on most shops
    float mx=max(max(sc.r,sc.g),max(sc.b,0.05)),sat=(mx-min(min(sc.r,sc.g),sc.b))/mx;
    if(bd>=0.05)amGlow=amNight*amNight*step(0.3,fract(seed*7.3))*step(0.3,sat)*(sc/mx)*0.06;
   } else if(h>=2.75&&h<=2.9)col=vec3(0.11,0.10,0.09);
  } else if(kind==2.0){
   // loading doors on the street wall and on long side walls
   float ns=floor(L/13.0);
   if((front>0.5||L>18.0)&&ns>=1.0){
    float pitch=L/ns,ls=mod(s,pitch)-pitch*0.5;
    float dh=min(4.2,H-1.2);
    if(abs(ls)<1.9&&h<dh){
     col=abs(ls)>1.75||h>dh-0.12?vec3(0.2,0.2,0.2):vec3(0.72,0.72,0.70)*mix(0.78,1.0,smoothstep(0.0,0.3,fract(h/0.11)));
     if(h<0.05)col*=0.5;
    } else if(abs(ls-2.9)<0.5&&h<2.1&&front>0.5){
     col=abs(ls-2.9)>0.44||h>2.04?vec3(0.15):vec3(0.35,0.42,0.5)*0.8;
    }
   }
   // clerestory band high on the wall
   if(H>5.5&&h>H-1.7&&h<H-0.9&&s>0.6&&s<L-0.6&&(front>0.5||seed>0.5)){
    float m=fract(s/1.2);col=m<0.05?vec3(0.2):vec3(0.07,0.08,0.09);gl=m<0.05?0.0:1.0;
   }
  }
  // Punched windows: every floor above a storefront, and all floors elsewhere.
  float firstFloor=storefront>0.5?groundTop+0.35:0.0;
  if(kind!=2.0&&h>firstFloor&&h<H-0.55&&s>0.7&&s<L-0.7&&L>2.8){
   float fh=3.0,ff=floor((h-firstFloor)/fh),fy=h-firstFloor-ff*fh;
   float wn=max(1.0,floor((L-1.4)/(kind==4.0?3.0:2.6))),pitch=(L-1.4)/wn;
   float ws=mod(s-0.7,pitch)-pitch*0.5;
   float ww=min(kind==3.0?1.3:1.2,pitch*0.55),wy0=0.95,wy1=min(2.45,fh-0.3);
   bool entrance=front>0.5&&kind!=1.0&&ff<0.5&&abs(s-L*0.5)<1.1;
   if(entrance){
    if(h<2.4)col=abs(s-L*0.5)>1.0||h>2.32?vec3(0.12,0.11,0.1):(abs(s-L*0.5)<0.03?vec3(0.12):vec3(0.07,0.08,0.09));
    gl=abs(s-L*0.5)<1.0&&h<2.32?1.0:0.0;
   } else if(h+0.0<H-0.55&&firstFloor+ff*fh+wy1<H-0.4){
    if(abs(ws)<ww*0.5+0.09&&fy>wy0-0.13&&fy<wy0){
     col=vec3(0.80,0.78,0.73)*mix(0.6,1.0,smoothstep(wy0-0.13,wy0-0.07,fy)); // sill
    } else if(abs(ws)<ww*0.5+0.07&&fy>wy1&&fy<wy1+0.16&&redBrick){
     col=vec3(0.66,0.63,0.57); // stone lintel
    } else if(abs(ws)<ww*0.5&&fy>wy0&&fy<wy1){
     float fx=ww*0.5-abs(ws),fyy=min(fy-wy0,wy1-fy);
     if(min(fx,fyy)<0.07)col=vec3(0.86,0.85,0.81)*mix(0.7,1.0,smoothstep(0.0,0.02,min(fx,fyy)));
     else if(abs(fy-(wy0+wy1)*0.5)<0.03)col=vec3(0.86,0.85,0.81);
     else{
      float lv=(fy-wy0)/(wy1-wy0);
      col=mix(vec3(0.09,0.10,0.115),vec3(0.24,0.27,0.30),smoothstep(0.1,1.0,lv))*mix(1.0,0.55,smoothstep(0.75,1.0,lv));
      float k=amHash(vec2(floor((s-0.7)/pitch),ff)+seed*13.0);
      if(k<0.3&&lv>0.6){col=vec3(0.78,0.76,0.7)*0.5;}
      else gl=1.0;
     }
    }
   }
  }
  diffuseColor.rgb=col;amGlass=max(amGlass,gl);
 }
`;
