// Separate prototype storage even if someone opens both versions on one origin.
// storage-ns.js does the prefixing (and ?review=<name> / ?audioReview=1); when
// the browser blocks site data it hands the game a session-only Map so the page
// still boots, and we say so on screen instead of showing a blank page.
import { installStorageNamespace } from '../game/storage-ns.js';
const info=installStorageNamespace({base:'aylmer2004.prototype.',reviewBase:'aylmer2004.review.',audioPrefix:'aylmer2004.audio-review.',memoryFallback:true});
let storage=null;try{storage=window.localStorage;}catch{storage=null;}
if(info.blocked){
 const note=document.createElement('div');note.id='storage-blocked';note.setAttribute('role','status');
 note.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:10000;background:#2b2118;color:#fff;border:1px solid #c98a3a;border-radius:8px;padding:10px 14px;font:14px system-ui';
 note.textContent='Ce navigateur bloque le stockage du site : le jeu démarre, mais rien ne sera sauvegardé après la fermeture de la page. (Site data is blocked: the game runs, but nothing is kept.)';
 const close=document.createElement('button');close.type='button';close.textContent='OK';close.style.marginLeft='12px';close.onclick=()=>note.remove();note.append(close);
 (document.body||document.documentElement).append(note);
}
window.AYLMER_VISUAL={dayMinutes:24,clockRate:1};
try {
 let saved={};try{saved=JSON.parse(storage?.getItem('visual-options')||'{}')||{};}catch{saved={};}
 if([12,24,48].includes(saved.dayMinutes))window.AYLMER_VISUAL.dayMinutes=saved.dayMinutes;
 const calendar=await import('../game/calendar.js');
 await calendar.loadSummer();
 await import('../main.js');
 await import('./panel.js');
} catch(e) {
 const error=document.createElement('pre');error.style.cssText='position:fixed;inset:20px;z-index:10000;background:#18202b;color:#fff;padding:24px;white-space:pre-wrap';error.textContent='Le prototype n’a pas démarré.\n'+e.stack;document.body.append(error);console.error(e);
}
