// The English version, and the French it falls back to:  node tools/smoke_lang.mjs
//
// Thomas, 2026-09-07: the English copy must be easy to get and hard to read.
// The hard-to-read half is CSS (style.css, `.photocopy`) and no node suite can
// see it; this checks the half it can:
//   1. both languages are offered, French first, and the switch takes 'en'
//   2. in English, every key the legend and the menu use resolves to a string
//      that is not the key itself — the photocopy is illegible, not blank
//   3. anything the English table lacks falls through to the French, never to
//      the raw key (that is what the real exam did too)
//   4. back to French, every string is the French one again
//   5. the erratum and the switch button exist in both languages
import { t, setLang, getLang, languages, KEYMAP } from '../src/game/i18n.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

const MENU = ['menu.continue', 'menu.new', 'menu.load', 'menu.options', 'menu.garageview',
  'menu.pickstart', 'menu.pickstart.hint', 'menu.english', 'menu.erratum',
  'save.hint', 'save.none', 'opt.title', 'opt.lang', 'pause.title', 'k.recover', 'k.tow'];

group('the switch');
const langs = languages();
ok(langs.length === 2 && langs[0][0] === 'fr' && langs[1][0] === 'en', 'two languages, French first', JSON.stringify(langs));
ok(setLang('fr') === 'fr' && getLang() === 'fr', 'starts French');
const fr = {};
for (const k of MENU) fr[k] = t(k);
for (const r of KEYMAP) fr[r.label] = t(r.label);
ok(Object.values(fr).every((v) => v && !/^[a-z]+\.[a-z.]+$/.test(v)), 'every French string resolves');

group('the photocopy');
ok(setLang('en') === 'en' && getLang() === 'en', 'the switch takes en');
ok(setLang('klingon') === 'fr', 'and nothing else');
setLang('en');
let same = 0, raw = 0;
for (const k of Object.keys(fr)) {
  const v = t(k);
  if (v === k) raw++;
  if (v === fr[k]) same++;
}
ok(raw === 0, 'no key comes back raw in English');
ok(same <= 3, 'the English strings are actually different from the French (' + same + ' identical)');
ok(t('k.recover') !== fr['k.recover'] && /route|road/i.test(t('k.recover')), 'T is translated, badly: ' + t('k.recover'));
ok(t('menu.new').includes('EMBARK'), 'a calque where it counts: ' + t('menu.new'));
ok(t('not.a.key.anywhere') === 'not.a.key.anywhere', 'an unknown key is still the key');
ok(t('toast.slang.on') === fr['toast.slang.on'] || t('toast.slang.on') !== 'toast.slang.on', 'a French-only key falls through to French, never raw');
ok(/pis/.test(t('menu.erratum')) && /French|fran/i.test(t('menu.erratum')), 'the erratum points at the French copy');

group('and back');
setLang('fr');
ok(Object.keys(fr).every((k) => t(k) === fr[k]), 'French is exactly what it was');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
