#!/usr/bin/env node
// Privacy scan: fails when anything private would reach the public repo or the
// public build. Hard rule 6 of the refinement plan (B-14).
//
//   node tools/qa/privacy-scan.mjs --dir=<public build out>   scan a built tree
//   node tools/qa/privacy-scan.mjs --git                      scan this worktree's tracked paths
//   node tools/qa/privacy-scan.mjs --worktrees                scan `git ls-files` of every wt-* worktree
//   options: --ledger=<STORY-LEDGER.md> --names=<private-names.txt> --json
//
// What fails:
//   paths   references/, CODEX-*.md, CHARACTER-*, docs/qa/story-pass-*,
//           STORY-LEDGER, roadmap.json, assets/radio/* (except README and the
//           examples; playlist.json only while it lists no tracks), tom_* and
//           plate_* images, HEIC/HEIF photos
//   photos  any image whose EXIF names a camera (Make/Model) or carries GPS
//   names   any private surname: the ledger's "Private names" section, the
//           proper names in its "Sensitive, keep OUT" subsection, and the lines
//           of the private names file (outside git, in the private folder)
//   sec. 3  any string from the ledger's section 3 ("Do not reintroduce"):
//           quoted phrases, acronyms, each bullet's lead clause and every
//           later clause of four words or more (bracketed corrections skipped)
// The ledger and the names file are read at scan time and never copied: the
// output names a rule, a count and a path category (the top-level folder),
// never a file name and never the private string it matched.
// With no ledger found the scan fails closed (exit 2).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, dflt = null) => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return dflt;
  return a.includes('=') ? a.slice(name.length + 3) : true;
};

// ---------------------------------------------------------------- path rules
// Shared with tools/build-public.mjs, which leaves every one of these out.
export const PATH_RULES = [
  { id: 'references', re: /(^|\/)references(\/|$)/ },
  { id: 'codex', re: /(^|\/)CODEX-[^/]*\.md$/ },
  { id: 'character', re: /(^|\/)CHARACTER-[^/]*$/ },
  { id: 'story-pass', re: /(^|\/)docs\/qa\/story-pass-/ },
  { id: 'ledger', re: /STORY-LEDGER/ },
  { id: 'roadmap', re: /(^|\/)roadmap\.json$/ },
  { id: 'tom-photo', re: /(^|\/)tom_[^/]*\.(png|jpe?g|webp|gif|heic|heif|tiff?)$/i },
  { id: 'plate', re: /(^|\/)plate_[^/]*\.(png|jpe?g|webp|gif|heic|heif|tiff?)$/i },
  { id: 'phone-photo', re: /\.(heic|heif)$/i },
];
const RADIO_OK = /^assets\/radio\/(README\.md|[^/]*\.example\.[^/]+|playlist\.json)$/;

/** The rule a relative path breaks, or null. `readFile` lets the radio rule look inside playlist.json. */
export function pathViolation(rel, readFile = null) {
  rel = rel.split(path.sep).join('/');
  for (const r of PATH_RULES) if (r.re.test(rel)) return r.id;
  if (/^assets\/radio\//.test(rel)) {
    if (!RADIO_OK.test(rel)) return 'radio';
    if (rel.endsWith('playlist.json') && readFile) {
      try { const p = JSON.parse(readFile()); if (!Array.isArray(p.tracks) || p.tracks.length) return 'radio-playlist'; }
      catch { return 'radio-playlist'; }
    }
  }
  return null;
}

// ------------------------------------------------------------- ledger terms
const STOP = new Set(['The', 'This', 'That', 'Real', 'People', 'Default', 'Tom', 'Thomas', 'Tom\'s', 'Sensitive', 'Keep',
  'OUT', 'Thomas\'s', 'Game', 'Names', 'Name', 'Never', 'Only', 'And', 'But', 'His', 'Her', 'Their', 'They', 'Not']);
// Ledger status labels, not content.
const ACR_STOP = new Set(['PLAN', 'USER', 'CONFIRMED', 'CURRENT', 'GAME', 'PROPOSAL', 'NEEDS', 'CONFIRMATION', 'HUD', 'OUT', 'WRONG', 'UNCONFIRMED', 'SUPERSEDED', 'APPROVED', 'FICTION']);
function sections(md) {
  const out = []; let cur = null;
  for (const line of md.split('\n')) {
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) { cur = { level: h[1].length, title: h[2], lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
}
/** Private names and section 3 strings, from the ledger text and the private names file text. */
export function ledgerTerms(ledgerMd, namesTxt = '') {
  const secs = sections(ledgerMd);
  const names = new Set();
  for (const s of secs.filter((x) => /private names?/i.test(x.title)))
    for (const l of s.lines) { const m = /^\s*[-*]\s+(.+?)\s*$/.exec(l); if (m) names.add(m[1].replace(/\*\*/g, '')); }
  for (const s of secs.filter((x) => /^sensitive/i.test(x.title)))
    for (const l of s.lines) for (const w of l.match(/\b[A-Z][a-zà-ÿ]{2,}\b/g) || []) if (!STOP.has(w)) names.add(w);
  for (const l of namesTxt.split('\n')) { const t = l.replace(/#.*$/, '').trim(); if (t) names.add(t); }
  const s3 = secs.find((x) => x.level === 2 && /^3\.\s/.test(x.title));
  const strings = new Set();
  if (s3) {
    const body = s3.lines.filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, ''));
    for (const b of body) {
      for (const m of b.matchAll(/"([^"]{3,})"|«\s*([^»]{3,}?)\s*»/g)) strings.add(m[1] || m[2]);
      for (const m of b.match(/\b[A-Z]{3,}\b/g) || []) if (!ACR_STOP.has(m)) strings.add(m);
      // Bracketed notes are the ledger's corrections (the true canon, e.g. who
      // really did it), not the forbidden thing, so clauses skip them.
      const clauses = b.replace(/\([^)]*\)/g, ' ').split(/[,;:."«»]| or | and /).map((c) => c.trim().replace(/\s+/g, ' ')).filter(Boolean);
      // The bullet's lead clause names the forbidden thing, so it counts from two words.
      clauses.forEach((t, k) => { if (t.split(' ').length >= (k === 0 ? 2 : 4)) strings.add(t); });
    }
  }
  return { names: [...names], strings: [...strings] };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
export function textMatchers({ names, strings }) {
  const nameRes = names.map((n, i) => ({ id: `private-name#${i + 1}`, re: new RegExp(`(?<![\\p{L}])${esc(n)}(?![\\p{L}])`, 'u') }));
  const strNorm = strings.map((s, i) => ({ id: /^[A-Z]{3,}$/.test(s) ? `section3-acronym#${i + 1}` : `section3#${i + 1}`, s, n: norm(s) }));
  return (text) => {
    const hits = [];
    const lines = text.split('\n');
    lines.forEach((line, k) => {
      for (const r of nameRes) if (r.re.test(line)) hits.push({ rule: r.id, line: k + 1 });
      for (const r of strNorm) {
        if (/^[A-Z]{3,}$/.test(r.s)) { if (new RegExp(`\\b${r.s}\\b`).test(line)) hits.push({ rule: r.id, line: k + 1 }); }
        else if (norm(line).includes(r.n)) hits.push({ rule: r.id, line: k + 1 });
      }
    });
    // clauses that wrap across lines
    const flat = norm(text);
    for (const r of strNorm) if (!/^[A-Z]{3,}$/.test(r.s) && flat.includes(r.n) && !hits.some((h) => h.rule === r.id)) hits.push({ rule: r.id, line: 0 });
    return hits;
  };
}

// ------------------------------------------------------------------- photos
function tiffCamera(buf, off) {
  // Returns true when IFD0 has Make (0x010F), Model (0x0110) or a GPS IFD (0x8825).
  if (off + 8 > buf.length) return false;
  const le = buf.toString('latin1', off, off + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = off + u32(off + 4);
  if (ifd + 2 > buf.length) return false;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > buf.length) break;
    const tag = u16(e);
    if (tag === 0x010f || tag === 0x0110 || tag === 0x8825) return true;
  }
  return false;
}
/** True when an image's EXIF names a camera or holds GPS: the mark of a real photograph. Headers only, nothing decoded. */
export function isCameraPhoto(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 4 < buf.length && buf[o] === 0xff) {
      const marker = buf[o + 1], len = buf.readUInt16BE(o + 2);
      if (marker === 0xda) break;
      if (marker === 0xe1 && buf.toString('latin1', o + 4, o + 10) === 'Exif\0\0' && tiffCamera(buf, o + 10)) return true;
      o += 2 + len;
    }
    return false;
  }
  if (buf.toString('latin1', 1, 4) === 'PNG') {
    let o = 8;
    while (o + 8 < buf.length) {
      const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
      if (type === 'eXIf' && tiffCamera(buf, o + 8)) return true;
      if (type === 'IEND') break;
      o += 12 + len;
    }
    return false;
  }
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    let o = 12;
    while (o + 8 < buf.length) {
      const type = buf.toString('latin1', o, o + 4), len = buf.readUInt32LE(o + 4);
      if (type === 'EXIF') { const s = buf.toString('latin1', o + 8, o + 14) === 'Exif\0\0' ? o + 14 : o + 8; if (tiffCamera(buf, s)) return true; }
      o += 8 + len + (len & 1);
    }
  }
  return false;
}

// --------------------------------------------------------------- the scans
const TEXT = /\.(js|mjs|cjs|json|html?|css|md|txt|svg|xml|csv|glsl|vert|frag|wgsl)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) { out.push({ rel: path.relative(base, p), link: true }); continue; }   // never followed
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ rel: path.relative(base, p) });
  }
  return out;
}

/** Scan a directory tree (a public build). Returns a list of findings; empty means it passes. */
export function scanDir(dir, terms) {
  const match = textMatchers(terms);
  const findings = [];
  for (const f of walk(dir)) {
    const rel = f.rel.split(path.sep).join('/');
    const abs = path.join(dir, f.rel);
    const pv = pathViolation(rel, () => fs.readFileSync(abs, 'utf8'));
    if (pv) { findings.push({ file: rel, rule: pv }); continue; }
    if (f.link) continue;
    if (IMAGE.test(rel)) { if (isCameraPhoto(fs.readFileSync(abs))) findings.push({ file: rel, rule: 'camera-photo' }); continue; }
    if (TEXT.test(rel)) for (const h of match(fs.readFileSync(abs, 'utf8'))) findings.push({ file: rel, rule: h.rule, line: h.line });
  }
  return findings;
}

/** Path rules over a worktree's tracked files. */
export function scanTracked(cwd) {
  const files = execFileSync('git', ['-C', cwd, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 27 }).split('\0').filter(Boolean);
  const findings = [];
  for (const rel of files) {
    const v = pathViolation(rel, () => fs.readFileSync(path.join(cwd, rel), 'utf8'));
    if (v) findings.push({ file: rel, rule: v });
  }
  return { files: files.length, findings };
}

export function findLedger(explicit) {
  const cands = [explicit, process.env.AYLMER_LEDGER, path.join(ROOT, 'docs/STORY-LEDGER.md'),
    path.resolve(ROOT, '../wt-qr-look/docs/STORY-LEDGER.md')].filter((x) => x && x !== true);
  return cands.find((p) => fs.existsSync(p)) || null;
}
export function namesFile(explicit) {
  if (explicit && explicit !== true) return explicit;
  const ref = path.resolve(process.env.CMP_REF_ROOT || path.join(ROOT, '../aylmer-madness'));
  return path.join(ref, 'references/privacy/private-names.txt');
}

/** The only part of a path the CLI prints: its top-level folder, or (root). */
export function pathCategory(rel) {
  const parts = String(rel).split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[0] + '/' : '(root)';
}

// ---------------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const json = !!arg('json', false);
  const dir = arg('dir'), wts = arg('worktrees', false), gitMode = arg('git', false);
  if (!dir && !wts && !gitMode) { console.error('usage: node tools/qa/privacy-scan.mjs --dir=<out> | --git | --worktrees [--ledger=<md>] [--names=<txt>] [--json]'); process.exit(2); }
  const report = { pass: true, scans: [] };
  if (dir && dir !== true) {
    const lp = findLedger(arg('ledger'));
    if (!lp) { console.error('privacy-scan: FAIL no STORY-LEDGER.md found (pass --ledger=); failing closed'); process.exit(2); }
    const nf = namesFile(arg('names'));
    const terms = ledgerTerms(fs.readFileSync(lp, 'utf8'), fs.existsSync(nf) ? fs.readFileSync(nf, 'utf8') : '');
    const findings = scanDir(path.resolve(dir), terms);
    report.scans.push({ kind: 'dir', target: path.resolve(dir), privateNames: terms.names.length, section3Strings: terms.strings.length, namesFile: fs.existsSync(nf), findings });
  }
  const trees = [];
  if (gitMode) trees.push(ROOT);
  if (wts) {
    const list = execFileSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    for (const m of list.matchAll(/^worktree (.+)$/gm)) if (/^wt-/.test(path.basename(m[1])) && fs.existsSync(m[1])) trees.push(m[1]);
  }
  for (const t of [...new Set(trees)]) {
    const r = scanTracked(t);
    report.scans.push({ kind: 'tracked', target: path.basename(t), files: r.files, findings: r.findings });
  }
  report.pass = report.scans.every((s) => !s.findings.length);
  // A finding's path can itself be private (a track name, an address, a photo
  // name), so neither the text output nor --json ever carries one: only the
  // rule, a count and the path category (the top-level folder).
  for (const s of report.scans) s.findings = s.findings.map((f) => ({ rule: f.rule, category: pathCategory(f.file) }));
  if (json) console.log(JSON.stringify(report, null, 1));
  else {
    for (const s of report.scans) {
      const extra = s.kind === 'dir' ? ` (${s.privateNames} private names, ${s.section3Strings} section 3 strings, names file ${s.namesFile ? 'found' : 'missing'})` : ` (${s.files} tracked files)`;
      console.log(`${s.findings.length ? 'FAIL' : 'ok  '}  ${s.kind} ${path.basename(s.target)}: ${s.findings.length} finding(s)${extra}`);
      const byRule = {};
      for (const f of s.findings) ((byRule[f.rule] ||= {})[f.category] = ((byRule[f.rule] || {})[f.category] || 0) + 1);
      for (const [rule, cats] of Object.entries(byRule))
        console.log(`    ${rule}: ${Object.entries(cats).map(([c, k]) => `${k} in ${c}`).join(', ')}`);
    }
    console.log(report.pass ? 'privacy-scan: pass' : 'privacy-scan: FAIL');
  }
  process.exit(report.pass ? 0 : 1);
}
