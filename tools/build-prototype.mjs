// Build a portable static prototype; no install or bundler required.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'out','aylmer-2004-prototype'));
fs.mkdirSync(out,{recursive:true});
for(const file of ['prototype.html','glenwood-review.html','references.html','index.html','garage.html','style.css','cinematic.css','PROTOTYPE.md'])fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const dir of ['src','assets','vendor'])fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true,filter:src=>{
 const rel=path.relative(root,src).split(path.sep).join('/');
 return !rel.startsWith('assets/models/src')&&(!rel.startsWith('assets/radio/')||['assets/radio/README.md','assets/radio/playlist.json','assets/radio/playlist.example.json'].includes(rel));
}});
fs.mkdirSync(path.join(out,'docs'),{recursive:true});
for(const file of ['PROTOTYPE-SESSION-LOG.md','PROTOTYPE-BACKLOG.md','RADIO-2004-PLAN.md','GLENWOOD-PHOTO-PASS.md'])fs.copyFileSync(path.join(root,'docs',file),path.join(out,'docs',file));
fs.mkdirSync(path.join(out,'tools'),{recursive:true});fs.copyFileSync(path.join(root,'tools/serve.mjs'),path.join(out,'tools/serve.mjs'));
fs.writeFileSync(path.join(out,'Start.command'),'#!/bin/zsh\ncd "$(dirname "$0")"\nprintf "Open http://localhost:8141/prototype.html in your browser.\\nKeep this window open while playing; Ctrl-C stops the server.\\n"\nnode tools/serve.mjs 8141\n',{mode:0o755});
console.log(`Portable prototype: ${out}`);
