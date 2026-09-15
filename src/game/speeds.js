import { CARS, finalizeCar } from './cars.js';
import './vehicles.js';
import './famouscars.js';
import './fortiercars.js';

// km/h, rounded road-test values or explicitly documented estimates. See docs/SPEEDS.md.
export const TOP_KMH={ranger:130,saturn:172,civic:185,sunfire:177,forester:171,
  sienna:180,cutlass:168,cavalier:185,caravan:158,bus:92,cart:24,schoolbus:90,
  cruiser:28,dbike:36,tempo:170,sicivic:215,crownvic:180,firebird:227,leone:180,svx:232};
export const speedFraction = c => Math.max(0,Math.min(1,c.topSpeed*3.6/325));
for(const c of CARS){
  if(TOP_KMH[c.id]==null) continue;
  // Retain the Ranger's existing thrust curve below the limiter.
  if(c.id==='ranger') { c.powerTopSpeed=c.topSpeed; c.steeringTopSpeed=c.topSpeed; }
  c.topSpeed=TOP_KMH[c.id]/3.6;
  c.speedCap=(c.id==='ranger'?130:c.id==='svx'?232:230)/3.6;
  finalizeCar(c);
}
