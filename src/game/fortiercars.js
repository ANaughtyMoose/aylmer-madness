import { CARS, finalizeCar, buildCarBody, tToZ } from './cars.js';
import { rgb } from '../core/mesh.js';
import { UNLOCKS } from './garage.js';
import { OWNER } from './save.js';

// Hand-shaped early-1990s coupes. Colour/year remain provisional pending Tom's photos.
const coupe = {
  style: 'coupe', noTraffic: true, seats: 1, wheelR: .32, wheelW: .21,
  seatY: .94, seatZ: .20, seatX: .40, clearance: .17,
  steerMax: .53, hbGrip: .42, hbYaw: 1.25, roofK: .78, tuck: .04,
  glassSide: [.28,.65], glassTop: [[.20,.36],[.57,.75]],
  belt: [[0,.78],[.22,.94],[.68,.94],[1,.70]],
  plan: [[0,.74],[.05,.86],[.2,.89],[.8,.89],[.94,.83],[1,.73]],
  cladding: {rocker:.10,bumper:.26,tRear:.025,tFront:.97,color:0x34383c},
  sound: {f0:45,span:260,sub:.35,o2g:.5,cut0:350,cutSpan:2700,gain:.9,type1:'sawtooth',type2:'triangle',rattle:0,rattleFrom:0},
};
export const SVX = finalizeCar({ ...coupe,
  id:'svx', name:'1992 Subaru SVX', who:"Sara Fortier's", whoDe:'de Sara Fortier', hidden:true,
  body:0xc5c8c5, len:4.625,wid:1.77,h:1.30,wheelbase:2.61,overhangF:1.03,
  topSpeed:232/3.6,speedCap:232/3.6,accel:5.15,brake:10,grip:1.04,mass:1640,aero:.00028,awd:1.15,
  flavour:'Le six à plat de Sara. Vitres dans les vitres, quatre roues motrices. Claude tient à savoir où tu vas avec.',
  top:[[0,.79],[.05,.87],[.18,.89],[.23,1.01],[.36,1.27],[.42,1.30],[.55,1.30],[.61,1.22],[.75,.94],[.9,.80],[1,.60]],
  drive:{gears:[2.79,1.55,1,.69],final:3.90,tyre:.648,idle:700,redline:6500,shiftAt:6100,shiftTime:.23},
});
SVX.buildBody = () => {
  const b=buildCarBody(SVX);
  // The unmistakable window-within-a-window, following the greenhouse taper.
  for(const side of [-1,1]) {
    b.box(side*.724,1.075,tToZ(SVX,.47),.024,.026,1.18,rgb(0x171e25));
    b.box(side*.724,1.16,tToZ(SVX,.59),.025,.18,.028,rgb(0x171e25));
  }
  b.box(0,.79,tToZ(SVX,.01),1.46,.12,.035,rgb(0x9c2730));
  return b;
};
export const NSX = finalizeCar({...coupe,
  id:'claude_nsx',name:'1991 Acura NSX',who:'Claude Fortier',body:0xb52922,
  len:4.405,wid:1.81,h:1.17,wheelbase:2.53,overhangF:.93,
  topSpeed:270/3.6,speedCap:270/3.6,accel:6.8,brake:11.5,grip:1.12,mass:1365,aero:.00025,
  seatY:.88,seatZ:.28,
  top:[[0,.77],[.04,.84],[.26,.84],[.32,1.07],[.39,1.17],[.56,1.17],[.66,.87],[.9,.70],[1,.52]],
  glassTop:[[.27,.39],[.56,.67]],glassSide:[.34,.63],
  drive:{gears:[3.07,1.95,1.4,1.03,.77],final:4.06,tyre:.635,idle:800,redline:8000,shiftAt:7400,shiftTime:.16},
});
NSX.buildBody=()=>{
  const b=buildCarBody(NSX), red=rgb(NSX.body);
  b.box(0,.97,tToZ(NSX,.06),1.65,.075,.22,red);
  for(const s of [-1,1]){
    b.box(s*.66,.88,tToZ(NSX,.06),.075,.21,.13,red);
    b.box(s*.60,.745,tToZ(NSX,.86),.35,.035,.35,rgb(0x8d231e));
    b.box(s*.883,.70,tToZ(NSX,.29),.024,.22,.36,rgb(0x202326));
    // Two visibly seated occupants, Claude on the left, Sara on the right.
    b.box(s*.38,1.02,.26,.22,.23,.21,rgb(0xe3b596));
    b.box(s*.38,1.15,.24,.235,.07,.23,rgb(s>0?0x42372f:0x785334));
  }
  return b;
};
CARS.push(SVX);
UNLOCKS.svx={kind:'famous',who:'Sara Fortier',need:'Trouve les clés',needEn:'Find the keys'};
OWNER.svx='heritage';
