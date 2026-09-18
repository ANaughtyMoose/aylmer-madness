import { clockText } from './daylight.js';
const A=window.AYLMER,opt=window.AYLMER_VISUAL;
const panel=document.createElement('details');panel.id='visual-tools';
panel.innerHTML=`<summary>AYLMER · ÉTÉ 2004 <span style="opacity:.6">/ prototype visuel</span><time>13:00</time></summary><div class="visual-body">
<p>La même ville, le même Ranger. Une nouvelle lumière.</p>
<label>Heure <input aria-label="Heure" type="range" min="0" max="23.99" step=".05" value="13" id="visual-hour"></label>
<div class="row"><button data-hour="6.5">Matin</button><button data-hour="13">Midi</button><button data-hour="19.5">Soir</button><button data-hour="0">Nuit</button></div>
<label>Une journée <select id="visual-day"><option value="12">12 minutes</option><option value="24" selected>24 minutes</option><option value="48">48 minutes</option></select></label>
<label>Défilement <select id="visual-rate"><option value="1">Normal</option><option value="0">Heure fixe</option><option value="24">Accéléré · 24×</option></select></label>
<label>Ombres <input aria-label="Ombres" type="checkbox" checked id="visual-shadows"></label>
<div class="row"><button data-place="home">Fraser</button><button data-place="principale">Principale</button><button data-place="marina">Marina</button><button id="visual-report">Mesurer les performances</button></div>
<output id="visual-output"></output><p><a href="references.html" target="_blank">Références Midtown Madness 2 ↗</a> · <a href="index.html" target="_blank">Version originale ↗</a></p></div>`;
document.body.append(panel);
const get=id=>panel.querySelector(id);
get('#visual-day').value=opt.dayMinutes;
get('#visual-day').onchange=e=>{opt.dayMinutes=+e.target.value;localStorage.setItem('visual-options',JSON.stringify({dayMinutes:opt.dayMinutes}));};
get('#visual-rate').onchange=e=>opt.clockRate=+e.target.value;
get('#visual-shadows').onchange=e=>{if(A.G.renderer)A.G.renderer.shadows=e.target.checked;};
function hour(h){A.visualClock(h);get('#visual-hour').value=h;A.render();}
get('#visual-hour').oninput=e=>{opt.clockRate=0;get('#visual-rate').value='0';hour(+e.target.value);};
for(const b of panel.querySelectorAll('[data-hour]'))b.onclick=()=>hour(+b.dataset.hour);
const locations={home:[932.9,143.9],principale:[-448,477],marina:[-730,1000]};
for(const b of panel.querySelectorAll('[data-place]'))b.onclick=async()=>{
 if(!A.G.veh)return;
 const {PLACES}=await import('../game/places.js');
 const p=b.dataset.place==='home'?PLACES.home:b.dataset.place==='marina'?PLACES.marina:PLACES.principale;
 const [x,z]=p?[p.x,p.z]:locations[b.dataset.place];const r=A.G.world.nearestRoad(x,z);A.teleport(r.x,r.z,r.yaw);A.cinema.hide();A.story.finish();A.pause(false);panel.open=false;document.querySelector('#gl').focus();
};
get('#visual-report').onclick=()=>{
 const r=A.G.renderer;if(!r?.report)return;const q=r.report();
 get('#visual-output').textContent=`${q.frames} images · médiane ${q.medianMs?.toFixed(1)} ms · p95 ${q.p95Ms?.toFixed(1)} ms\n${q.draws} appels · ${Math.round(q.tris/1000)}k triangles (avec ombres)\nGéométrie ${q.geometryMB} Mo · ${q.programs} programmes\n${innerWidth}×${innerHeight} · rendu ${r.canvas.width}×${r.canvas.height}`;
};
// Readable status is also used by the browser checks; no game state mutation.
setInterval(()=>{panel.hidden=A.G.mode!=='drive'||A.cinema.active;const h=A.visualClock();panel.querySelector('time').textContent=clockText(h||0);if(document.activeElement!==get('#visual-hour'))get('#visual-hour').value=h;},300);
