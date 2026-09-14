import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'public');
fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','style.css','cinematic.css'])fs.copyFileSync(path.join(root,file),path.join(out,file));
function copy(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(rel==='assets/models/src'||rel==='assets/radio')continue;if(e.isDirectory())copy(rel);else{fs.mkdirSync(path.dirname(path.join(out,rel)),{recursive:true});fs.copyFileSync(path.join(root,rel),path.join(out,rel));}}}
copy('src');copy('assets');
fs.mkdirSync(path.join(out,'assets/radio'),{recursive:true});
fs.copyFileSync(path.join(root,'assets/radio/playlist.json'),path.join(out,'assets/radio/playlist.json'));
console.log('Public game files prepared.');
