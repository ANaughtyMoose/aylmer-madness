// Continuous summer lighting; calendar-clock.js owns date progression.
export const HOURS = { morning: 7, day: 13, dusk: 20.5, night: 0 };
export const wrapHour = h => ((h % 24) + 24) % 24;
const clamp = v => Math.max(0, Math.min(1, v));
const mix = (a,b,t) => a.map((x,i)=>x+(b[i]-x)*t);
const rgb = h => [h>>16&255,h>>8&255,h&255].map(v=>v/255);
const KEYS = [
  [0,0x101c36,0x19243a,0x121623,0x99b4e0,0],
  [4.5,0x15223c,0x354153,0x1c2330,0xe7a478,0],
  [5.5,0x516984,0xa58d7b,0x373a3e,0xffb979,0.38],
  [7,0x81a5cf,0xbac3c5,0x545340,0xffdeaa,0.82],
  [10,0x7ca7d7,0xc1ced6,0x68614e,0xfff1d6,1.05],
  [16,0x7da9d8,0xc2cdd2,0x69604d,0xffebce,1.05],
  [19,0x8fa6be,0xd0b8a0,0x655749,0xffca8d,0.80],
  [20.5,0x596985,0xb28a7e,0x3a3440,0xffa567,0.28],
  [21.5,0x1d2c4b,0x40455e,0x202532,0xff9b6a,0],
  [24,0x101c36,0x19243a,0x121623,0x99b4e0,0],
];
export function environmentAt(hour, day=0, record=null) {
  const local=wrapHour(hour);
  const parse=t=>{const [h,m]=String(t).split(':').map(Number);return h+m/60;};
  const rise=parse(record?.sunrise),set=parse(record?.sunset);
  // Map the recorded dawn/dusk to palette anchors; the night interval wraps.
  const valid=Number.isFinite(rise)&&Number.isFinite(set)&&set>rise;
  const h=valid ? (local>=rise&&local<=set ? 5.5+(local-rise)/(set-rise)*15 : wrapHour(20.5+((local-set+24)%24)/(24-set+rise)*9)) : local;
  let i=0; while(i<KEYS.length-2 && h>=KEYS[i+1][0])i++;
  const a=KEYS[i],b=KEYS[i+1],v=clamp((h-a[0])/(b[0]-a[0])),t=v*v*(3-2*v);
  // Approximate summer solar path at 45.4 N. World +z points south, +x east.
  const latitude=45.4*Math.PI/180, declination=(23.4-8*clamp(day/72))*Math.PI/180;
  const halfDay=Math.acos(-Math.tan(latitude)*Math.tan(declination));
  const angle=valid ? (local>=rise&&local<=set ? -halfDay+2*halfDay*(local-rise)/(set-rise) : halfDay+((local-set+24)%24)/(24-set+rise)*(2*Math.PI-2*halfDay)) : (h-13)*Math.PI/12;
  const sun=[-Math.cos(declination)*Math.sin(angle),
    Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos(angle),
    Math.sin(latitude)*Math.cos(declination)*Math.cos(angle)-Math.cos(latitude)*Math.sin(declination)];
  const intensity=(a[5]+(b[5]-a[5])*t)*clamp(sun[1]/.12);
  return {sky:mix(rgb(a[1]),rgb(b[1]),t),fog:mix(rgb(a[2]),rgb(b[2]),t),ground:mix(rgb(a[3]),rgb(b[3]),t),
    sun:mix(rgb(a[4]),rgb(b[4]),t).map(c=>c*intensity),lightDir:sun,fogDensity:0.00105,
    key:h<5.5||h>=21.5?'night':h<9?'morning':h>=19?'dusk':'day'};
}
export function clockText(h) { h=wrapHour(h);return `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor(h%1*60)).padStart(2,'0')}`; }
export function advanceClock(clock,dt,cycleSeconds,minutes=24,rate=1) {
  return ((clock + Math.max(0,dt)*cycleSeconds/(Math.max(1,minutes)*60)*rate)%cycleSeconds+cycleSeconds)%cycleSeconds;
}
