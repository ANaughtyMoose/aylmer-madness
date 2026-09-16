// A small, deterministic corridor-and-timing game, independent of driving.
export class MealShift {
  constructor() { this.x=450;this.y=440;this.time=0;this.served=[0,0,0];this.cool=0;this.message='Approche un lit. Trois bouchées par personne.'; }
  get beds(){return [{x:220,y:110},{x:680,y:220},{x:220,y:330}];}
  get chairs(){return [0,1].map(i=>({x:450+Math.sin(this.time*.75+i*2)*155,y:170+i*145}));}
  ready(i){return Math.sin(this.time*1.6+i*1.7)>.1;}
  get done(){return this.served.every(n=>n>=3);}
  step(dt,ctl={}) {
    this.time+=dt;this.cool=Math.max(0,this.cool-dt);
    const dx=ctl.x||0,dy=ctl.y||0,k=Math.max(1,Math.hypot(dx,dy));
    this.x=Math.max(170,Math.min(730,this.x+dx/k*160*dt));
    this.y=Math.max(60,Math.min(450,this.y+dy/k*160*dt));
    if(this.cool===0&&this.chairs.some(c=>Math.hypot(c.x-this.x,c.y-this.y)<35)){
      this.y=Math.min(450,this.y+40);this.cool=.9;this.message='Oups! Laisse passer le fauteuil. Reprends ton plateau.';
    }
    if(ctl.feed&&this.cool===0){
      const i=this.beds.findIndex((b,j)=>this.served[j]<3&&Math.hypot(b.x-this.x,b.y-this.y)<85);
      if(i<0)this.message='Rapproche-toi d’un lit qui attend son repas.';
      else if(!this.ready(i)){this.message='Attends le signal vert : la personne prend son temps.';this.cool=.25;}
      else{this.served[i]++;this.cool=.55;this.message=this.served[i]===3?'Repas terminé. Merci, Tom!':'Une bouchée à la fois. Ça va bien.';}
    }
  }
}

export function openMealShift() {
  const state=new MealShift();
  if(typeof document==='undefined')return {state,draw(){},hide(){},close(){}};
  const el=document.createElement('section');el.id='mealshift';
  el.style.cssText='position:fixed;inset:0;z-index:90;background:#11252c;color:#f5efd9;display:grid;place-content:center;padding:20px;font:18px system-ui';
  el.innerHTML='<h1 style="margin:0">Hôpital St. Vincent — le service du repas</h1><p>WASD / flèches : marcher · Espace : une bouchée au signal vert · Échap : pause · Retour arrière : quitter</p><canvas width="900" height="500" style="max-width:92vw;max-height:65vh;background:#9faea5"></canvas><p role="status"></p>';
  document.body.append(el);const g=el.querySelector('canvas').getContext('2d');
  return {state,hide(){el.style.visibility='hidden';},close(){el.remove();},draw(){
    el.style.visibility='visible';
    g.fillStyle='#afbbb1';g.fillRect(0,0,900,500);g.fillStyle='#d8d8bd';g.fillRect(310,0,280,500);
    g.font='18px system-ui';g.textAlign='center';
    state.beds.forEach((b,i)=>{g.fillStyle='#f1efdd';g.fillRect(b.x-65,b.y-40,130,80);g.fillStyle='#56786e';g.fillRect(b.x-50,b.y-28,65,56);g.fillStyle='#d9b99b';g.beginPath();g.arc(b.x+34,b.y,20,0,Math.PI*2);g.fill();g.fillStyle=state.served[i]>=3?'#385948':state.ready(i)?'#245e3a':'#8e5826';g.fillText(state.served[i]>=3?'Merci!':`${state.served[i]}/3 · ${state.ready(i)?'Prêt':'Patience'}`,b.x,b.y-52);});
    state.chairs.forEach(c=>{g.fillStyle='#26383e';g.fillRect(c.x-26,c.y-23,9,46);g.fillRect(c.x+17,c.y-23,9,46);g.fillStyle='#3f6790';g.fillRect(c.x-17,c.y-20,34,40);g.fillStyle='#d0b99f';g.beginPath();g.arc(c.x,c.y-4,12,0,Math.PI*2);g.fill();});
    g.fillStyle='#294457';g.beginPath();g.arc(state.x,state.y,15,0,Math.PI*2);g.fill();g.fillStyle='#eee5c8';g.fillRect(state.x-18,state.y-24,36,12);g.fillStyle='#946e4b';g.fillRect(state.x-12,state.y-22,24,8);
    el.querySelector('[role=status]').textContent=`${state.served.reduce((a,b)=>a+b,0)}/9 bouchées · ${state.message}`;
  }};
}
