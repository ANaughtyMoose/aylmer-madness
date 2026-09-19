// Local files stay in this browser's IndexedDB. No media upload or API key.
const DB='aylmer2004-local-radio-v1';
let urls=[];
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function savedFiles(files){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',files?'readwrite':'readonly'),s=tx.objectStore('files');let result;
 const q=files?s.put(files,'playlist'):s.get('playlist');q.onsuccess=()=>result=q.result;
 tx.oncomplete=()=>resolve(files||result||[]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export function audioFiles(files){return Array.from(files).filter(f=>/\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name));}
function install(radio,files){
 const old=urls;urls=files.map(f=>URL.createObjectURL(f));
 radio.useLocalTracks(files.map((f,i)=>({file:urls[i],title:f.name.replace(/\.[^.]+$/,''),artist:'Audio local'})));
 for(const u of old)URL.revokeObjectURL(u);
}
export async function mountLocalRadio(panel,radio){
 const section=document.createElement('section');section.className='local-radio';
 section.innerHTML=`<hr><strong>Radio / enregistrements personnels</strong><p>MP3, M4A, OGG, WAV : musique, pubs ou émission complète. Les fichiers restent sur cet appareil.</p><label>Choisir les fichiers <input type="file" id="radio-files" accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac" multiple></label><div class="row"><button id="radio-local-play">Écouter</button><button id="radio-local-next">Suivant</button><button id="radio-local-stop">Arrêter</button></div><output id="radio-local-status">Aucun fichier local chargé.</output><output id="radio-local-playing"></output>`;
 panel.querySelector('.visual-body').append(section);
 const status=section.querySelector('output');let count=0;
 function describe(extra=''){status.textContent=`${count} fichier${count>1?'s':''} · lecture dans l’ordre choisi. ${extra}`;}
 try{const files=await savedFiles();if(files.length){install(radio,files);count=files.length;describe('Prêt.');}}catch{status.textContent='Le stockage local est indisponible ; les fichiers peuvent être lus pour cette session.';}
 section.querySelector('input').onchange=async e=>{
  const files=audioFiles(e.target.files);if(!files.length){status.textContent='Choisis au moins un fichier audio compatible.';return;}
  install(radio,files);count=files.length;describe('Prêt.');
  try{await savedFiles(files);describe('Conservés dans ce navigateur.');}catch{describe('Lecture possible, mais stockage plein ou indisponible : recharger les fichiers à la prochaine session.');}
 };
 section.querySelector('#radio-local-play').onclick=()=>{if(count){radio.audio.start();radio.audio.resume();radio.suspended=false;radio.tune('tape');describe('Lecture.');}else status.textContent='Choisis d’abord un MP3 ou un autre fichier audio.';};
 section.querySelector('#radio-local-next').onclick=()=>{if(count){radio.tune('tape');radio.next();}};
 section.querySelector('#radio-local-stop').onclick=()=>{radio.wantOn=false;radio.suspend();describe('Arrêté.');};
 setInterval(()=>{
  if(radio.playbackError)status.textContent=radio.playbackError;
  const el=radio.tape?.el;
  section.querySelector('#radio-local-playing').textContent=el&&radio.localTape ? `${el.paused?'Pause':'Lecture'} · ${Math.floor(el.currentTime)} s · ${radio.tape.list[radio.tape.idx]?.title||''}` : '';
 },500);
}
