import assert from 'node:assert/strict';
import {environmentAt,advanceClock,clockText} from '../src/prototype/daylight.js';
import {readFileSync} from 'node:fs';
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
for(let day of [0,36,72])for(let h=0;h<24;h+=.05){const e=environmentAt(h,day);for(const k of ['sky','sun','ground','lightDir','fog'])check(e[k].every(Number.isFinite),`finite ${day} ${h} ${k}`);check(Math.abs(Math.hypot(...e.lightDir)-1)<1e-8,'unit sun');}
check(environmentAt(13).lightDir[1]>.8,'high summer sun at midday');
check(environmentAt(0).lightDir[1]<0,'sun below horizon at midnight');
check(environmentAt(7).lightDir[0]>0 && environmentAt(19).lightDir[0]<0,'sun moves east to west');
check(clockText(0)==='00:00'&&clockText(13.5)==='13:30'&&clockText(24)==='00:00','clock labels');
check(Math.abs(advanceClock(200,1440,600,24)-200)<1e-8,'full day wraps exactly');
check(advanceClock(200,100,600,24,0)===200,'fixed time');
const a=environmentAt(23.999),b=environmentAt(.001);check(a.sky.every((v,i)=>Math.abs(v-b.sky[i])<.001),'midnight continuity');
const html=readFileSync('prototype.html','utf8');check(html.includes('"./src/core/gl.js": "./src/prototype/renderer.js"'),'renderer override');
check(!readFileSync('index.html','utf8').includes('src/prototype/renderer.js'),'original entry stays original');
console.log(`${checks} checks passed: solar cycle, rollover, controls, entry isolation.`);
