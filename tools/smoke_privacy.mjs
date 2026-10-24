// The privacy fence holds:  node tools/smoke_privacy.mjs
// (B-14, refinement plan v2 hard rule 6.) Runs on fictional fixtures only, so it
// needs neither the real ledger nor the private folder:
//   1. a clean public tree passes
//   2. a planted references/ file, a planted private surname, a planted ledger
//      section 3 string, a radio file, a full playlist, a tom_ image and a
//      camera JPEG each make it fail
//   3. the CLI never prints the private string it matched, nor any file name
//      (only a rule, a count and a path category)
//   4. .gitignore carries the fence and build-public leaves the same list out
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerTerms, scanDir, pathViolation, isCameraPhoto } from './qa/privacy-scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// Fictional ledger: no real person is named anywhere in this file.
const LEDGER = `# Fixture ledger

## 1. Canon

### Sensitive, keep OUT of game text unless Thomas says otherwise

- The neighbour Quimbleton "kept odd hours". Real people.

## 2. Private names

- Zorblatt
- Vexmoor-Pell

## 3. Do not reintroduce

- The purple llama parade on the frozen canal (the parade was always green). Fixture, 1 Jan.
- A visit to the WXQZ clinic, in any form.
- Anything "très bizarre" said by the narrator.

## 4. Other
`;
const terms = ledgerTerms(LEDGER, '# comment line\nGlimfeather\n');

group('the ledger terms');
ok(['Zorblatt', 'Vexmoor-Pell', 'Quimbleton', 'Glimfeather'].every((n) => terms.names.includes(n)), 'private names from the section, the sensitive note and the names file', terms.names.join('|'));
ok(!terms.names.includes('Real') && !terms.names.includes('The'), 'no stop words taken as names');
ok(terms.strings.some((s) => /purple llama parade/.test(s)) && terms.strings.includes('WXQZ') && terms.strings.includes('très bizarre'), 'section 3 clauses, acronyms and quotes', terms.strings.join('|'));
ok(!terms.strings.some((s) => /Other/.test(s)), 'nothing taken from after section 3');
ok(terms.strings.includes('A visit to the WXQZ clinic'), 'a bullet\'s lead clause counts', terms.strings.join('|'));
ok(!terms.strings.some((s) => /always green/.test(s)), 'a bracketed correction (the true canon) is not a forbidden string', terms.strings.join('|'));

// One fixture tree per case under a fixed folder, rewritten in place on every
// run (never cleared: each case always writes the same files).
const BASE = path.join(os.tmpdir(), 'aylmer-smoke-privacy');
let T = BASE, n = 0;
const put = (rel, data) => { const p = path.join(T, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const clean = () => {
  T = path.join(BASE, String(++n));
  put('index.html', '<!doctype html><title>Jeu</title>');
  put('src/game/a.js', "export const line = 'Roule doucement sur le canal.';\n");
  put('assets/radio/playlist.json', '{"tracks":[]}');
  put('assets/radio/README.md', 'How to add your own music.');
};

// JPEG headers built by hand: SOI, APP1 Exif with a TIFF IFD0, then SOS.
function jpeg(withMake) {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(withMake ? 0x010f : 0x0112, 10); tiff.writeUInt16LE(2, 12); tiff.writeUInt32LE(4, 14); tiff.writeUInt32LE(0x41414141, 18);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}

group('the scan');
clean();
let f = scanDir(T, terms);
ok(f.length === 0, 'a clean public tree passes', JSON.stringify(f));

const plant = (name, rel, data, rule) => {
  clean(); put(rel, data);
  const got = scanDir(T, terms);
  ok(got.some((x) => x.rule.startsWith(rule)), name, JSON.stringify(got));
};
plant('a planted references file fails', 'references/notes.md', 'notes', 'references');
plant('a planted ledger surname fails', 'src/game/b.js', "const who = 'Vexmoor-Pell';\n", 'private-name');
plant('a surname from the names file fails', 'assets/text/c.json', '{"a":"Glimfeather a dit bonjour"}', 'private-name');
plant('a planted section 3 string fails', 'assets/text/d.json', '{"x":"the purple llama parade on the frozen canal"}', 'section3');
plant('a section 3 acronym fails', 'src/game/e.js', '// WXQZ\n', 'section3');
plant('a planted ledger copy fails', 'docs/STORY-LEDGER.md', 'x', 'ledger');
plant('a CODEX file fails', 'CODEX-CHARACTERS.md', 'x', 'codex');
plant('a radio track fails', 'assets/radio/song.mp3', 'x', 'radio');
plant('a full playlist fails', 'assets/radio/playlist.json', '{"tracks":[{"file":"x"}]}', 'radio-playlist');
plant('a tom_ image fails', 'assets/ui/tom_face.png', 'x', 'tom-photo');
plant('a plate_ image fails', 'assets/cars/plate_front.jpg', 'x', 'plate');
plant('a camera JPEG fails', 'assets/textures/wall.jpg', jpeg(true), 'camera-photo');
clean(); put('assets/textures/wall.jpg', jpeg(false));
ok(scanDir(T, terms).length === 0, 'a JPEG without camera EXIF passes');
ok(isCameraPhoto(jpeg(true)) && !isCameraPhoto(jpeg(false)), 'EXIF camera tag read from headers only');
ok(pathViolation('src/game/surnames.js') === null && pathViolation('docs/ROADMAP.md') === null, 'ordinary paths pass');
ok(pathViolation('assets/radio/playlist.example.json') === null && pathViolation('assets/radio/README.md') === null, 'radio README and examples pass');

group('the output keeps the secret');
clean(); put('src/game/b.js', "const who = 'Zorblatt';\n");
const lp = path.join(BASE, 'ledger.md'); fs.writeFileSync(lp, LEDGER);
const r = spawnSync(process.execPath, [path.join(here, 'qa/privacy-scan.mjs'), `--dir=${T}`, `--ledger=${lp}`, `--names=${path.join(T, 'none.txt')}`], { encoding: 'utf8' });
const outText = (r.stdout || '') + (r.stderr || '');
ok(r.status === 1, 'CLI exits 1 on a finding', `status ${r.status}`);
ok(!outText.includes('Zorblatt'), 'CLI never prints the matched name');
ok(/private-name#\d+: 1 in src\//.test(outText), 'CLI names the rule, a count and the path category', outText);
ok(!outText.includes('b.js'), 'CLI never prints the file name');
clean(); put('assets/radio/Secret Track Name.mp3', 'x'); put('assets/ui/tom_face.png', 'x'); put('references/places/12 Fixture Street.md', 'x');
const r2 = spawnSync(process.execPath, [path.join(here, 'qa/privacy-scan.mjs'), `--dir=${T}`, `--ledger=${lp}`, `--names=${path.join(T, 'none.txt')}`, '--json'], { encoding: 'utf8' });
const out2 = (r2.stdout || '') + (r2.stderr || '');
ok(r2.status === 1 && /"radio"/.test(out2) && /"tom-photo"/.test(out2) && /"references"/.test(out2), 'JSON output names each rule', out2);
ok(!/Secret Track|tom_face|Fixture Street/.test(out2), 'no radio, photo or address file name in the JSON output');

group('the fence');
const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
for (const line of ['references/', 'CODEX-*.md', 'CHARACTER-*', 'docs/qa/story-pass-*', 'docs/roadmap.json', 'docs/STORY-LEDGER.md'])
  ok(gi.includes(line), `.gitignore has ${line}`);
const bp = fs.readFileSync(path.join(root, 'tools/build-public.mjs'), 'utf8');
ok(/import \{ pathViolation \} from '\.\/qa\/privacy-scan\.mjs'/.test(bp), 'build-public leaves out the scan\'s own list');
// Untracking the ledger and roadmap.json is Tom's step (the delete guard refuses
// the index-only removal, and a merge that drops the ledger from the index also
// removes it from the disk of every worktree that takes the merge), so this is
// reported, not failed, until he has run it. See docs/qa/rf/B-14.md.
const tracked = spawnSync('git', ['-C', root, 'ls-files', 'docs/STORY-LEDGER.md', 'docs/roadmap.json'], { encoding: 'utf8' });
if (tracked.status === 0 && tracked.stdout.trim() === '') ok(true, 'the ledger and roadmap.json are not tracked');
else console.log('  note the ledger or roadmap.json is still tracked (Tom untracks it, see docs/qa/rf/B-14.md)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
