// Separate prototype storage even if someone opens both versions on one origin.
const realStorage=window.localStorage;
const prefix='aylmer2004.prototype.';
const storage={
 getItem:k=>realStorage.getItem(prefix+k),setItem:(k,v)=>realStorage.setItem(prefix+k,v),removeItem:k=>realStorage.removeItem(prefix+k),
 key:i=>Object.keys(realStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)??null,
 get length(){return Object.keys(realStorage).filter(k=>k.startsWith(prefix)).length;},
 clear(){for(const k of Object.keys(realStorage))if(k.startsWith(prefix))realStorage.removeItem(k);}
};
Object.defineProperty(window,'localStorage',{value:storage,configurable:true});
window.AYLMER_VISUAL={dayMinutes:24,clockRate:1};
try {
 const saved=JSON.parse(storage.getItem('visual-options')||'{}');
 if([12,24,48].includes(saved.dayMinutes))window.AYLMER_VISUAL.dayMinutes=saved.dayMinutes;
 await import('../main.js');
 await import('./panel.js');
} catch(e) {
 const error=document.createElement('pre');error.style.cssText='position:fixed;inset:20px;z-index:10000;background:#18202b;color:#fff;padding:24px;white-space:pre-wrap';error.textContent='Le prototype n’a pas démarré.\n'+e.stack;document.body.append(error);console.error(e);
}
