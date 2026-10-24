// The public game files, and nothing private:  node tools/build-public.mjs [--out=<dir>]
// Copies index.html, the two stylesheets, src/ and assets/ into out/ (or --out).
// Leaves out every path tools/qa/privacy-scan.mjs fails on (references/, CODEX-*,
// CHARACTER-*, the ledger, roadmap.json, the private radio library, tom_* and
// plate_* images, phone photos), plus the model sources. Then scan the result:
//   node tools/qa/privacy-scan.mjs --dir=<out>
import fs from 'node:fs';
import path from 'node:path';
import { pathViolation } from './qa/privacy-scan.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = outArg ? path.resolve(outArg.slice(6)) : path.join(root, 'out');
fs.mkdirSync(out, { recursive: true });
let skipped = 0;
for (const file of ['index.html', 'style.css', 'cinematic.css', 'opening.css']) fs.copyFileSync(path.join(root, file), path.join(out, file));
function copy(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (rel === 'assets/models/src' || rel === 'assets/radio') continue;
    if (e.isSymbolicLink()) { skipped++; continue; }   // never followed into a private tree
    if (e.isDirectory()) { if (pathViolation(rel + '/')) { skipped++; continue; } copy(rel); continue; }
    if (pathViolation(rel)) { skipped++; continue; }
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.copyFileSync(path.join(root, rel), path.join(out, rel));
  }
}
copy('src'); copy('assets');
// The game fetches the empty default playlist; only the stub ships, never the library.
fs.mkdirSync(path.join(out, 'assets/radio'), { recursive: true });
const pl = path.join(root, 'assets/radio/playlist.json');
if (!pathViolation('assets/radio/playlist.json', () => fs.readFileSync(pl, 'utf8'))) fs.copyFileSync(pl, path.join(out, 'assets/radio/playlist.json'));
else { fs.writeFileSync(path.join(out, 'assets/radio/playlist.json'), '{\n  "tracks": []\n}\n'); skipped++; }
console.log(`Public game files prepared in ${path.relative(root, out) || out} (${skipped} private path(s) left out).`);
