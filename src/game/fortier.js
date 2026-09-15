import { SVX, NSX } from './fortiercars.js';
import { buildWheel } from './cars.js';
import { Rival, collideRivals } from './race.js';
import { PLACES } from './places.js';
import { apronSpot } from './save.js';

export { SVX, NSX };
export const SARA_LINE="You're such a loooooser, Tom";
const CLAUDE=["Tabarnak, Tom! Ramène le char de Sara!", "Crisse de niaiseux! Arrête-toi!", "Câlisse, tu vas me le ramener, ce char-là!"];
export function installFortierMeshes(r, meshes){
  meshes.cars[NSX.id]=r.upload(NSX.buildBody());
  meshes.wheels[NSX.id]=r.upload(buildWheel(NSX));
}
// East staff car park authored by siteHeritage(), clear of the college footprint.
export function svxHome(){return {x:5632,z:-6824,yaw:Math.PI/2};}

// Separate from police heat and the active job: this encounter never replaces a mission.
export class FortierChase {
  constructor(){this.unit=null;this.subtitle=null;this.voiceActive=false;}
  stop(){this.unit=null;this.cancelVoice();if(this.subtitle)this.subtitle.hidden=true;}
  cancelVoice(){if(this.voiceActive && globalThis.speechSynthesis)globalThis.speechSynthesis.cancel();this.voiceActive=false;}
  speak(G,who,text){
    if(typeof document!=='undefined'){
      if(!this.subtitle){this.subtitle=document.createElement('div');this.subtitle.id='fortier-subtitle';
        this.subtitle.style.cssText='position:fixed;top:21%;left:50%;transform:translateX(-50%);max-width:650px;width:80%;padding:14px 20px;background:#111d26ed;color:#fff;border-left:4px solid #ffc94d;border-radius:8px;text-align:center;font:600 20px/1.4 system-ui;z-index:24;pointer-events:none';document.body.append(this.subtitle);}
      this.subtitle.textContent=who+' — '+text;this.subtitle.hidden=false;this.captionT=5;
    }
    this.cancelVoice();
    const synth=globalThis.speechSynthesis;
    if(!synth||!globalThis.SpeechSynthesisUtterance||G.settings?.audio===false)return;
    const vol=(G.settings?.volMaster??1)*(G.settings?.volEffects??1);if(!vol)return;
    const sara=who==='Sara';const lang=sara?'en-US':'fr-CA';
    const voices=synth.getVoices();
    const voice=voices.find(v=>v.lang===lang && (!sara||/female|zira|samantha|jenny|aria/i.test(v.name)))||voices.find(v=>v.lang===lang)||voices.find(v=>v.lang.startsWith(sara?'en':'fr'));
    // Split the vowel-heavy word so its rate and pitch can differ from the lead-in.
    const parts=sara?[["You're such a",1.05,1.25],['looooser',.55,1.6],['Tom',.85,1.15]]:[[text,1.12,.85]];
    this.voiceActive=true;
    for(const [words,rate,pitch] of parts){const u=new SpeechSynthesisUtterance(words);u.lang=lang;u.voice=voice||null;u.volume=vol;u.rate=rate;u.pitch=pitch;synth.speak(u);}
  }
  start(G){
    this.stop(); const v=G.veh;
    const back={x:v.x-Math.sin(v.yaw)*65,z:v.z-Math.cos(v.yaw)*65};
    const p=G.nav?.nearest(back.x,back.z)||back;
    this.unit=new Rival(NSX,{id:'claude_fortier',name:'Claude Fortier',phys:G.phys,skill:{cruise:63,cornerK:.52,minSpeed:7,gain:1.75,damp:.27,avoid:.65,band:{ahead:1,behind:1}}});
    this.unit.place(p.x,p.z,Math.atan2(v.x-p.x,v.z-p.z));this.unit.active=true;
    this.routeT=0;this.unseen=0;this.tauntT=5.5;this.line=0;this.returnT=0;
    G.hud?.toast('LA SVX DE SARA\nClaude arrive en NSX. Sème-le : 300 m pendant 12 secondes.',5000);
    this.speak(G,'Claude',CLAUDE[0]);
  }
  interact(G,garage){
    const p=G.parked?.svx,v=G.veh;
    if(!p||!v||Math.abs(v.vLong)>=3||Math.hypot(v.x-p.x,v.z-p.z)>6.5||G.repairOffer)return false;
    G.hud?.prompt('E — prendre la SVX de Sara Fortier');
    if(G.wantStart){G.wantStart=false;garage.earn('svx');G.hud?.prompt(null);G.swapCar('svx');G.autosave?.('svx-discovered');}
    return true;
  }
  update(dt,G){
    if(this.pending){this.pending=false;if(G.veh?.spec.id==='svx')this.start(G);}
    if(this.captionT>0){this.captionT-=dt;if(this.captionT<=0&&this.subtitle)this.subtitle.hidden=true;}
    if(G.settings?.audio===false)this.cancelVoice();
    const u=this.unit,v=G.veh;if(!u||!v)return;
    if(v.spec.id!=='svx'){this.stop();G.hud?.toast('Claude récupère la SVX. Sara lève les yeux au ciel.',3500);return;}
    const d=Math.hypot(u.x-v.x,u.z-v.z);
    this.routeT-=dt;
    if(this.routeT<=0){
      this.routeT=.9;
      const path=d<35?[[u.x,u.z],[v.x+Math.sin(v.yaw)*8,v.z+Math.cos(v.yaw)*8]]:G.nav?.route(u.x,u.z,v.x,v.z);
      if(path?.length>1)u.setPath(path);
    }
    u.finished=false;u.update(dt,G.phys,{traffic:G.traffic?.cars,band:1});
    collideRivals(v,u.veh);G.traffic?.collideBody?.(u.veh);
    this.unseen=d>300?this.unseen+dt:0;
    if(this.unseen>=12){this.stop();G.hud?.toast('Tu as semé Claude!\nLa SVX est maintenant dans ton garage.',4500);G.autosave?.('svx-escaped');return;}
    this.tauntT-=dt;
    if(this.tauntT<=0&&d<160){this.line++;this.tauntT=12;
      if(this.line%2)this.speak(G,'Sara',SARA_LINE);else this.speak(G,'Claude',CLAUDE[(this.line/2)%CLAUDE.length]);}
  }
  draw(G,drawCar){const u=this.unit;if(!u)return;const v=u.veh;
    drawCar(NSX,v.x,v.z,v.yaw,v.pitch,v.roll,v.spin,v.steer,null,0,v.bodyY,v.gh);}
}
