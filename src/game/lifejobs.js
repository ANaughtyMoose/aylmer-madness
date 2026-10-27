import {STVINCENT_MISSION} from './setpieces/sauna.js';
import {RUSSELL_MISSION} from './setpieces/royal.js';
import {openMealShift} from './mealshift.js';
import {fragile} from './verbs.js';
import {PLACES} from './places.js';
import {heckle} from './heckle.js';
import {ToothHud,toothState} from './toothhud.js';
const close=(G)=>{G.mealShift?.close();G.mealShift=null;};

// ---------------------------------------------------------------- Margaret, the whole drive
//
// Tom, 6 Oct 2026: "work in Alanis Morissette's lyrics and my mom saying those
// to me the whole drive." The repo is public, so NO lyrics: song titles only,
// bent into Margaret's own sentences (a title plus a word or two, never a
// line of a song). She rides with the box on her lap, in English, and calls
// him Tom; the clinic staff speak French. DRAFT for Tom's approval.
//
// Two kinds of line. CADENCE plays in order, one every RIDE_EVERY seconds,
// whenever nothing else is talking. REACT lines answer the driving: a hit, a
// curb, air, speed, the crown cracking, the clock, the clinic in sight. A
// reaction to a hit cuts her off mid-sentence; the others wait their turn.
// All state is flat scalars on `m` (save.js keeps only those).
export const RIDE_EVERY=12;
export const MARGARET_RIDE={
  cadence:[
    'Seat belt. The crowns are on my lap. Go, Tom.',
    'Isn’t it ironic, Tom? The crown lady, late for Alanis.',
    'Hand in my pocket, Tom? No. Both hands on the wheel.',
    'I’m not the doctor, Tom. I just make him look good.',
    'All I really want is for you to signal. Once.',
    'Head over feet for porcelain, that’s your mother. Don’t laugh.',
    'You learn, Tom. Smooth is fast. Fast is not smooth.',
    'She’ll sing in my crowns. Thank U, Margaret. That’s me.',
    'Perfect. That’s the word. Keep it perfect, like the crowns.',
  ],
  react:{
    hit:['Hands clean, Tom! Hands on the wheel! Not the crowns!','I felt that one right through you, Tom. And me.'],
    curb:['That’s a curb, Tom. Curbs are uninvited. Go around them.'],
    air:['Wake up! Four wheels on the road, Tom. Four!'],
    speed:['You oughta know the limit, Tom. I can see the needle.'],
    crack:['Did something just crack? Don’t tell me. Just drive.'],
    pop:['Is that a crown coming loose on my lap? Tom. Tom!'],
    late:['Out is through, Tom. Just get there. Gently.'],
    later:['Fifteen seconds. Run the light. No. Don’t. Maybe.'],
    near:['Is that Dr Morin’s? So pure, so slow now. Park nice.'],
    clean:['No bumps? Who are you? Put my son back on.'],
  },
  // At the door, the assistant, in French.
  staff:['L’assistante','« C’est le fils à Margaret! Enfin. Le Dr Morin tourne en rond. »'],
};
// Each one-shot reaction gets a bit in m.mgOnce so it is said once a drive.
const ONCE=['curb','air','speed','crack','pop','late','later','near','clean','staff'];
export const RIDE_TUNE={hit:0.25,curb:0.35,airTicks:6,speedKmh:75,speedFor:1.5,late:45,later:15,near:130,staff:55,cleanFor:35,cool:3.5};

/**
 * One tick of Margaret. `s` is what the car did this tick:
 *   { dmg (since pickup), tol, curb, inAir, kmh, timeLeft, toClinic, dt }
 * Returns { say: [who, text, cut] | null, wince: force | 0, state } and moves
 * the scalars on `m`. Pure: no DOM, no heckle; tools/smoke_dental.mjs runs it.
 */
export function margaretCue(m,s){
  const R=MARGARET_RIDE,T=RIDE_TUNE,dt=s.dt||0;
  const once=(k)=>!((m.mgOnce||0)&(1<<ONCE.indexOf(k)));
  const mark=(k)=>{m.mgOnce=(m.mgOnce||0)|(1<<ONCE.indexOf(k));};
  m.mgCool=Math.max(0,(m.mgCool||0)-dt);
  m.mgT=(m.mgT==null?4:m.mgT)-dt;
  const hitD=Math.max(0,s.dmg-(m.mgDmg||0));
  m.mgDmg=Math.max(m.mgDmg||0,s.dmg);
  const prevState=m.mgState||0;
  const state=toothState(s.dmg,s.tol);
  m.mgState=state;
  const curbUp=s.curb>T.curb&&(m.mgCurb||0)<=T.curb;
  m.mgCurb=s.curb||0;
  m.mgAir=s.inAir?(m.mgAir||0)+1:0;
  m.mgFast=s.kmh>T.speedKmh?(m.mgFast||0)+dt:0;
  m.mgClean=hitD>0||curbUp?0:(m.mgClean||0)+(s.kmh>15?dt:0);
  const out={say:null,wince:hitD>T.hit?Math.min(1,0.25+hitD/4):0,state};
  const pick=(k,cut=false)=>{
    const pool=R.react[k];
    const i=k==='hit'?(m.mgHits=(m.mgHits||0)+1)-1:0;
    if(k!=='hit')mark(k);
    m.mgCool=T.cool;m.mgT=Math.max(m.mgT,RIDE_EVERY*0.6);
    out.say=['Margaret',pool[i%pool.length],cut];
    return out;
  };
  // The tooth just got worse: that is the line, whatever else happened.
  if(state>prevState&&state>=4&&state<5&&once('pop'))return pick('pop',true);
  if(state>prevState&&state>=2&&state<4&&once('crack'))return pick('crack',true);
  if(hitD>T.hit&&m.mgCool<=0)return pick('hit',true);
  if(curbUp&&once('curb')&&m.mgCool<=0)return pick('curb',true);
  if(m.mgAir>=T.airTicks&&once('air'))return pick('air',true);
  if(m.mgCool>0)return out;
  if(s.toClinic!=null&&s.toClinic<T.staff&&once('staff')){mark('staff');m.mgCool=T.cool;out.say=[R.staff[0],R.staff[1],false];return out;}
  if(s.toClinic!=null&&s.toClinic<T.near&&once('near'))return pick('near');
  if(s.timeLeft!=null&&s.timeLeft<T.later&&once('later'))return pick('later');
  if(s.timeLeft!=null&&s.timeLeft<T.late&&once('late'))return pick('late');
  if(m.mgFast>=T.speedFor&&once('speed'))return pick('speed');
  if(m.mgClean>=T.cleanFor&&once('clean'))return pick('clean');
  if(m.mgT<=0&&(m.mgLine||0)<R.cadence.length){
    m.mgT=RIDE_EVERY;
    out.say=['Margaret',R.cadence[m.mgLine=(m.mgLine||0)+1,m.mgLine-1],false];
  }
  return out;
}

const audioOf=()=>(typeof window!=='undefined'&&window.AYLMER&&window.AYLMER.audio)||null;
function toothOpen(G){G.toothHud?.close();G.toothHud=new ToothHud({audio:audioOf()});return G.toothHud;}
function toothClose(G,opts){G.toothHud?.close(opts);G.toothHud=null;}
function toothEnd(G,m,tol){
  if(!G.toothHud)return;
  const v=G.veh||{},c=PLACES.morin;
  const broke=!!(m&&m.mgBroke)||Math.max(0,(v.damage||0)-((m&&m.fragileStart)||0))>tol||((m&&m.fragileAir)||0)>45;
  const there=!!c&&Math.hypot(v.x-c.x,v.z-c.z)<30;
  if(!broke&&there)G.toothHud.done();
  toothClose(G,broke?{shatter:true}:{delivered:there});
}

export const LIFE_MISSIONS=[{
  // Margaret is Tom's mother, a dental technician at Dr Morin's (real). Tom,
  // 6 Oct 2026: she finished the work at home, ran late, and Tom rushed it to
  // the cabinet; it was Alanis Morissette's (true, if before 2004; she told
  // all his friends). Crowns, not « teeth », per the canon rule (smoke_canon).
  // Timed and fragile: the GPS route from 299 Fraser is
  // 2.4 km, and 190 s asks a 45 km/h average door to door, the old poutine
  // pace (tools/timers.mjs). Ten points of new damage cracks the work.
  // Spoken: Margaret in English, Dr Morin in French; narration in French.
  // Tom, 6 Oct: she talks the whole drive (MARGARET_RIDE above), and a tooth
  // in the corner shows the crowns taking the damage (toothhud.js).
  id:'margaretdental',title:'La boîte du Dr Morin',giver:'home',timeOfDay:'day',
  brief:'Ta mère a fini les couronnes à la maison, mais elle est en retard. Tu conduis, elle tient la boîte. Le Dr Morin attend au cabinet, sur Principale. Vite, mais doucement : c’est du travail fin.',
  build(){
    const breakWhy='Le Dr Morin ouvre la boîte, regarde ta mère, pis te regarde. « On recommence lundi, Margaret. »';
    const tol=10;
    const [load,go]=fragile({
      from:'home',to:'morin',tolerance:tol,time:120,// W6-CURFEW re-pace: 2.4 km, pace 85 s (s1-timers 115, was 190)
      loadText:'Ta mère pis la boîte - 299 Fraser',loadSub:'Arrête-toi (S) dans l’entrée, pis E pour la faire embarquer.',loadHint:'Ta mère t’attend sur le perron, la boîte dans les mains.',
      holdText:'E - ta mère embarque',loadToast:'Ta mère s’assoit, la boîte sur les genoux. « You drive. My hands are for porcelain. »',
      text:'Cabinet du Dr Morin - Principale',sub:'Le chrono roule, mais doux sur le W pis le S. Pas de coups, pas de trottoirs, pas de sauts.',
      hint:'Le cabinet gris sur Principale, près du British. Tab pour la carte.',
      money:40,toast:'Le Dr Morin ouvre la boîte. « Parfait. Margaret, t’as des doigts en or. » +40 $',
      failWhy:'Le Dr Morin est parti dîner. Ta mère te regarde. Longtemps.',
      airWhy:breakWhy,
    });
    // fragile() fails a break with the stage's failWhy, which the runner also
    // shows when the clock runs out; keep the two failures apart.
    const tick=go.onTick,enter=go.onEnter;
    return [
      {...load,at:'home',radius:20},
      {...go,at:'morin',radius:16,
        onEnter(G,m){
          enter(G,m);
          m.mgT=4;m.mgLine=0;m.mgOnce=0;m.mgDmg=0;m.mgState=0;m.mgHits=0;m.mgCool=0;m.mgClean=0;m.mgFast=0;m.mgAir=0;m.mgCurb=0;
          toothOpen(G);
        },
        onTick(G,m,st,dt){
          const r=tick(G,m,{...st,failWhy:breakWhy},dt);
          const v=G.veh||{},clinic=PLACES.morin;
          const dmg=Math.max(0,(v.damage||0)-(m.fragileStart||0));
          const cue=margaretCue(m,{dmg,tol,curb:v.curb||0,inAir:!!v.inAir,kmh:v.speedKmh||0,
            timeLeft:m.timeLeft,toClinic:clinic?Math.hypot(v.x-clinic.x,v.z-clinic.z):null,dt});
          const th=G.toothHud;
          if(r&&r.fail)m.mgBroke=1;
          if(th){th.set(r&&r.fail?5:Math.min(4,cue.state));if(cue.wince)th.wince(cue.wince);}
          if(cue.say&&!(r&&r.fail)){
            const [who,text,cut]=cue.say;
            if(cut)heckle.cancel?.('margaret');
            else if(heckle.storyBusy?.())return r;
            heckle.line(who,text.startsWith('«')?text:`« ${text} »`,3400,{group:'margaret'});
          }
          return r;
        },
        // Every end of this stage comes through here (missionCleanup runs it
        // on a fail or a quit too): a break leaves the shattered tooth up for
        // a beat, a delivery gets a little hop.
        onExit(G,m){toothEnd(G,m,tol);},
      },
    ];
  },
  cleanup(G,m){toothEnd(G,m,10);}
},{
  // Bring Zahra to Sol for the blackberry soda (Tom, 28 Sept).
  id:'solerrand',title:'Un arrêt chez Sol',giver:'sayyad',timeOfDay:'day',
  brief:'Zahra veut sa liqueur aux mûres de chez Sol, le magasin d’aliments naturels à gauche du PFK, au 195 Principale. Tu l’amènes.',
  build(){return [
    {text:'Chez Sol, avec Zahra',sub:'À gauche du PFK. Arrête-toi, puis E.',hint:'Cherche l’enseigne verte avec le soleil doré.',at:'sol',radius:18,hold:true,toast:'Zahra prend la liqueur aux mûres. Elle prend toujours la liqueur aux mûres.'},
    {text:'Ramène Zahra au 75 Denise-Friend',sub:'Retour chez elle, puis E.',hint:'Leur maison verte, avec le porche rouge.',at:'sayyad',radius:18,hold:true,money:15,toast:'Sayyad te donne 15 $ pour avoir amené sa sœur. La liqueur coûtait 2 $. Le gaz, plus que ça.'}
  ];}
},STVINCENT_MISSION,RUSSELL_MISSION];
