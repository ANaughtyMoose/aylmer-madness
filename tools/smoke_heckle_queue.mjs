// Story lines play after the card, one at a time; heckles and street chatter
// never talk over them and do not spam a player who is sitting still.
// (Story audit major #7: every start/end friend line died under the mission
// card. Lead, 29 Sep: ~7 neighbour barks in 4 s in the driveway at spawn.)
//
//   node tools/smoke_heckle_queue.mjs
import fs from 'node:fs';
import { Heckle, GAP, SLOW_GAP, STORY_GAP, HUSH_TTL, HECKLES, JSON_TRIGGERS, storySeconds, ingestHeckles } from '../src/game/heckle.js';
import { DEFAULT_SETTINGS } from '../src/game/store.js';
import { NUITTIM_MISSION, CALL_LINES, HUSH as NUIT_HUSH } from '../src/game/setpieces/nuittim.js';
import { AMBIENT as PED_FALLBACK } from '../src/game/peds.js';
import { setRacingText } from '../src/game/racingtext.js';
import { ToastQueue, TOAST_MIN_MS } from '../src/game/hud.js';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  — ' + extra : '')); }
};
const run = (h, secs, G, onFrame) => { for (let i = 0; i < Math.round(secs * 60); i++) { h.update(1 / 60, G); onFrame && onFrame(h); } };
const fresh = (kmh = 50) => { const G = { settings: { ...DEFAULT_SETTINGS }, veh: { speedKmh: kmh } }; const h = new Heckle(); h.bind(G); return { h, G }; };

console.log('how long a line stays up');
ok(storySeconds('Salut') === 2.5, 'a one-word line gets the 2.5 s floor');
ok(Math.abs(storySeconds('un deux trois quatre cinq six sept huit neuf dix onze douze') - 3.6) < 1e-9, 'twelve words: 0.3 s each = 3.6 s');
ok(storySeconds('mot '.repeat(40)) === 5, 'a long line is capped at 5 s');

console.log('the card holds the queue');
{
  const { h, G } = fresh();
  h.line('Sayyad', 'Première ligne.', 3000, { group: 'friend' });
  h.line('Sayyad', 'Deuxième ligne.', 3000, { group: 'friend' });
  // A full-screen card is up: main.js's tick() does not run, so neither does
  // update(). Wall-clock time passes; the game clock does not.
  ok(!h.storyNow && h.pending.length === 2, 'said under the card: both lines wait, none is on screen');
  h.update(1 / 60, G);
  ok(h.storyNow && h.storyNow.text === 'Première ligne.', 'first tick after the card: the first line goes up');
  ok(h.live.length === 1, 'one bubble at a time');
}

console.log('one at a time, in order, with a breath between');
{
  const { h, G } = fresh();
  const lines = ['Un.', 'Deux trois quatre.', 'Cinq six sept huit neuf dix onze douze treize quatorze.'];
  for (const l of lines) h.line('Mike', l);
  const shown = [];
  let maxLive = 0;
  run(h, 20, G, (x) => {
    maxLive = Math.max(maxLive, x.live.length);
    if (x.storyNow && shown[shown.length - 1]?.text !== x.storyNow.text) shown.push({ text: x.storyNow.text, at: x.t });
  });
  ok(shown.map((s) => s.text).join('|') === lines.join('|'), 'all three, in order, none dropped');
  ok(maxLive === 1, 'never two bubbles at once');
  const d1 = shown[1].at - shown[0].at, d2 = shown[2].at - shown[1].at;
  ok(Math.abs(d1 - (storySeconds(lines[0]) + STORY_GAP)) < 0.05, `line 1 held ${storySeconds(lines[0])} s + gap`, d1.toFixed(2));
  ok(Math.abs(d2 - (storySeconds(lines[1]) + STORY_GAP)) < 0.05, `line 2 held ${storySeconds(lines[1])} s + gap`, d2.toFixed(2));
}

console.log('the plot has the floor');
{
  const { h, G } = fresh();
  h.line('Margaret', 'Fais attention au char.');
  h.update(1 / 60, G);
  ok(h.say('Piéton', 'dive') === null, 'no heckle while a story line is up');
  ok(h.ambient('', 'Les maringouins sont pires cette année.') === null, 'no street chatter either');
  ok(h.line('', 'Une ligne de la rue.') === null, 'a speakerless line is chatter, not plot, and it waits its turn too');
  run(h, 6, G);
  ok(!h.storyBusy(), 'the line and its breath are over');
  ok(!!h.say('Piéton', 'dive'), 'then the town can talk again');
  h.line('Mike', 'Envoye, on y va.');
  h.update(1 / 60, G);
  ok(h.live.length === 1 && h.live[0].story, 'a story line takes the screen from a heckle bubble');
}

console.log('interruptible when the job moves on');
{
  const { h, G } = fresh();
  h.line('Sayyad', 'Au début de la job.', 0, { group: 'friend' });
  h.line('Sayyad', 'Encore une affaire.', 0, { group: 'friend' });
  h.line('Margaret', 'Une ligne de l’étape.', 0);
  h.update(1 / 60, G);
  h.cancel('friend');
  ok(!h.storyNow || h.storyNow.group !== 'friend', 'the friend line on screen is cut');
  ok(h.pending.every((p) => p.group !== 'friend') && h.pending.length === 1, 'queued friend lines are dropped, others stay');
  run(h, 1, G);
  ok(h.storyNow && h.storyNow.text.startsWith('Une ligne'), 'the stage line plays next');
  h.cancel();
  ok(!h.storyNow && !h.pending.length, 'cancel() with no group clears every story line');
}

console.log('a slow or stuck player is not spammed');
{
  const { h, G } = fresh(0);
  let n = 0;
  // Try to heckle every frame for 30 s: the parked-car bark, the stuck line...
  run(h, 30, G, (x) => { if (x.say('Voisin', 'parked') || x.say(null, 'dive')) n++; });
  ok(n <= Math.ceil(30 / SLOW_GAP) + 1, `sitting still: ${n} heckles in 30 s (at most one per ${SLOW_GAP} s)`);
  const m = fresh(60);
  let k = 0;
  run(m.h, 30, m.G, (x) => { if (x.say(null, 'dive')) k++; });
  ok(k > n && k <= Math.ceil(30 / GAP) + 1, `driving: ${k} in 30 s (one per ${GAP} s)`);
  const c = fresh(0);
  let a = 0;
  run(c.h, 30, c.G, (x) => { if (x.ambient('', 'Chatter ' + (a + 1))) a++; });
  ok(a <= Math.ceil(30 / SLOW_GAP) + 1, `street chatter shares the limiter: ${a} in 30 s`);
}

console.log('the menu clears it');
{
  const { h, G } = fresh();
  h.line('Mike', 'Une.'); h.line('Mike', 'Deux.');
  h.update(1 / 60, G);
  h.clear();
  ok(!h.storyNow && !h.pending.length && !h.live.length, 'clear() empties the screen and the queue');
}

// ---------------------------------------------------------------- B-08
// The scene hush, the chore lines and the swearing. (Julie, panel 12 Oct: a
// PASSANT gag landed between « Couchez-le sur le côté » and « Restez avec lui »;
// chore lines nobody yells at a truck; tabarnak in every heckle.)

const TEXT_DIR = new URL('../assets/text/', import.meta.url);
const readJson = (name) => JSON.parse(fs.readFileSync(new URL(name, TEXT_DIR), 'utf8'));

console.log('the scene hush');
{
  const { h, G } = fresh();
  ok(!!h.say('Piéton', 'dive'), 'before the hush the town talks');
  ok(h.live.length === 1 && !h.live[0].story, 'a heckle bubble is up');
  h.hush('test');
  ok(h.hushed && h.hushReasons().join() === 'test', 'hush() raises the flag');
  ok(h.live.length === 0, 'raising it takes the heckle bubble down');
  run(h, GAP + 0.1, G, (x) => x.hush('test'));
  ok(h.say('Piéton', 'dive') === null, 'no heckle while hushed');
  ok(h.ambient('', 'Les maringouins sont pires cette année.') === null, 'no street chatter while hushed');
  ok(h.line('', 'Une ligne de la rue.') === null, 'a speakerless line is chatter: hushed too');
  h.line('Mike', 'He’s breathing.');
  h.update(1 / 60, G);
  ok(h.storyNow && h.storyNow.text === 'He’s breathing.', 'story lines still play under the hush');
  run(h, 6, G, (x) => x.hush('test'));
  ok(h.hushed, 'kept up by the scene, the hush holds');
  run(h, HUSH_TTL + 0.05, G);
  ok(!h.hushed, `nobody refreshes it: it lapses after ${HUSH_TTL} s on its own`);
  ok(!!h.say('Piéton', 'dive'), 'then the town talks again');
  h.hush('a'); h.hush('b', 30);
  h.unhush('a');
  ok(h.hushed && h.hushReasons().join() === 'b', 'unhush(reason) lifts only that reason');
  h.unhush();
  ok(!h.hushed, 'unhush() lifts them all');
  h.hush('c', 30); h.clear();
  ok(!h.hushed, 'the menu (clear) lifts it');
  h.hush('d', 30); h.reset();
  ok(!h.hushed, 'a new game (reset) lifts it');
}

console.log('1,000 simulated seconds of the Nuit du Tim');
{
  const { h, G } = fresh();
  h.pools = ingestHeckles(readJson('heckles.json'));
  const toasts = [];
  const emits = [];      // { t, kind, text, hushed, scene }
  G.heckle = h;
  // The real HUD queue: one toast at a time, 2.5 s floor each. `toasts` logs
  // the moment each one actually comes up, which is what the transcript sees.
  const q = new ToastQueue(1, { minMs: TOAST_MIN_MS });
  G.hud = { toasts: q, toast: (text, ms) => q.push(text, ms) };
  let shownTop = null;
  const pumpToasts = () => {
    q.step(h.t * 1000);
    const top = q.texts()[0] || null;
    if (top && top !== shownTop) toasts.push({ t: h.t, text: top, cycle: cycles });
    shownTop = top;
  };
  G.veh = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, vLong: 0, speedKmh: 0, reset() {} };
  const SCENE = new Set(['call', 'watch', 'stranger', 'walk', 'school', 'home']);
  const triggers = [...Object.keys(HECKLES), ...JSON_TRIGGERS];
  const street = ['Le camion de vidanges est passé de bonne heure ce matin.', 'Y’a une file au comptoir jusqu’à porte, j’te dis.'];
  const dt = 1 / 60;
  let frame = 0, sceneFrames = 0, attempts = 0;
  var cycles = 0;
  // Try every trigger and some street talk every frame: the worst town there is.
  const shout = (scene) => {
    const hushedNow = h.hushed;
    for (const k of triggers) {
      attempts++;
      const r = h.say(null, k);
      if (r) emits.push({ t: h.t, kind: 'heckle', text: r, hushed: hushedNow, scene });
    }
    for (const line of street) {
      attempts++;
      const r = h.line('', line + ' ' + frame);
      if (r) emits.push({ t: h.t, kind: 'ambient', text: r, hushed: hushedNow, scene });
    }
  };
  while (h.t < 1000) {
    const m = { stages: NUITTIM_MISSION.build() };
    for (const st of m.stages) {
      if (!SCENE.has(st.kind)) {
        // A drive leg between scenes: the town is allowed its say.
        // A backlog in the toast slot as the leg ends (the new-job toasts, the
        // last job's FINI card): the scene's own toasts come up late.
        for (let k = 0; k < 6; k++) G.hud.toast(`NOUVELLE JOB ${cycles}.${st.kind}.${k}`, 3000);
        for (let i = 0; i < 4 * 60; i++) { frame++; shout(false); pumpToasts(); h.update(dt, G); }
        continue;
      }
      if (st.onEnter) st.onEnter(G, m, st);
      for (let i = 0; i < 90 * 60; i++) {
        frame++;
        G.veh.speedKmh = st.kind === 'walk' || st.kind === 'home' ? 10 : 0;
        if (st.kind === 'walk' || st.kind === 'home') G.veh.z += (10 / 3.6) * dt;
        if (frame % 60 === 0) G.wantStart = true;
        const r = st.onTick(G, m, st, dt);
        sceneFrames++;
        shout(true);
        pumpToasts();
        h.update(dt, G);
        if (r === 'done' || h.t >= 1000) break;
      }
      if (st.onExit) st.onExit(G, m, st);
      if (h.t >= 1000) break;
      if (st.kind === 'call') {
        // The stage is over but its toasts may not be: drive on with the
        // town shouting, the way the Tim leg does.
        for (let i = 0; i < 40 * 60 && q.texts().length + q.pending.length; i++) {
          frame++; shout(false); pumpToasts(); h.update(dt, G);
        }
      }
    }
    NUITTIM_MISSION.cleanup(G, m);
    cycles++;
  }
  const inHush = emits.filter((e) => e.hushed);
  const inScene = emits.filter((e) => e.scene);
  ok(h.t >= 1000 && cycles >= 2, `${Math.round(h.t)} s simulated, ${cycles} passes through the night, ${sceneFrames} scene frames`);
  ok(inHush.length === 0, `0 heckles or street lines while the hush is up (${attempts} attempts, ${h.hushDropped} eaten)`, inHush.slice(0, 3).map((e) => e.text).join(' / '));
  ok(inScene.length === 0, '0 during any scene stage', inScene.slice(0, 3).map((e) => e.text).join(' / '));
  ok(emits.length > 0, `the drive legs still get the town (${emits.length} lines)`);
  const call = toasts.filter((x) => /^Centre antipoison:/.test(x.text));
  // Each pass through the night: from its first poison-control toast to its last.
  let between = 0;
  for (let c = 0; c < cycles; c++) {
    const mine = call.filter((x) => x.cycle === c);
    if (!mine.length) continue;
    const a = mine[0].t, b = mine[mine.length - 1].t;
    between += emits.filter((e) => e.t >= a && e.t <= b).length;
  }
  ok(call.length >= CALL_LINES.filter((l) => l[0] === 'Centre antipoison').length * 2, `${call.length} poison-control toasts seen`);
  ok(between === 0, '0 street lines between the first and the last poison-control toast');
  for (let i = 0; i < 120 * 60 && q.texts().length + q.pending.length; i++) { pumpToasts(); h.update(dt, G); }
  ok(!h.hushed, 'once cleanup() has run and the last scene toast is gone, the street is free');
  h.hush(NUIT_HUSH);
  run(h, HUSH_TTL + 0.05, G);
  ok(!h.hushed, 'a night that stops ticking (fail, quit) frees the street within a second');
}

// Every sacre the panel would hear as a swear, minced ones included.
const SWEAR = /(tabarn\w*|tabarou\w*|c[âa]li[sc]\w*|\b[oh]?ostie?\b|\bhostie\b|\b[ae]sti\w*|\bsti\b|sacr[ae]m\w*|\bcriss\w*|\bchrist\b|ciboir\w*|viarge|torrieu|bapt[êe]me|maudit\w*|chier|calvaire|calvince|cibole|sapristi|mosus|tabaslak)/i;
const TABARNAK = /tabarn/i;

console.log('swearing: at most one heckle in four');
{
  const rows = readJson('heckles.json').heckles;
  const pools = {};
  for (const r of rows) (pools['heckles.json ' + r.trigger] = pools['heckles.json ' + r.trigger] || []).push(r.fr);
  for (const k of Object.keys(HECKLES)) pools['heckle.js ' + k] = HECKLES[k];
  let all = 0, sw = 0, tab = 0;
  const over = [], tabOver = [];
  for (const [k, lines] of Object.entries(pools)) {
    const n = lines.filter((l) => SWEAR.test(l)).length;
    const t = lines.filter((l) => TABARNAK.test(l)).length;
    all += lines.length; sw += n; tab += t;
    if (n > lines.length / 4) over.push(`${k} ${n}/${lines.length}`);
    if (t > 1) tabOver.push(`${k} ${t}`);
  }
  const share = sw / all;
  ok(share <= 0.25, `swear words in ${sw} of ${all} heckles across both files (${(share * 100).toFixed(1)}%)`);
  ok(over.length === 0, 'no single pool swears in more than one line in four', over.join(', '));
  ok(tab <= all / 4 && tabOver.length === 0, `tabarnak in ${tab} of ${all}, at most once per pool`, tabOver.join(', '));
}

// The chore lines the panel read out (Julie, 6 and 12 Oct) and their siblings:
// errands told to somebody in the house or the car, not something the street
// says as a truck goes by. Pinned as written on fix/look-on-qr at 36dc188.
const CHORES = [
  "Ferme le boyau d'arrosage, tu vas vider le puits!",
  'Passe donc la souffleuse à feuilles sur le patio avant qui mouille.',
  "Y annonce quarante avec l'humidité aujourd'hui, rentre le chien.",
  'Les maringouins sortent, mets du Off si tu restes sur le perron.',
  "Mets tes espadrilles si tu veux m'aider à désherber l'entrée.",
  'Va chercher deux trois canettes de ginger ale dans le frigidaire du garage.',
  "Rentrez les vélos dans remise avant qu'il fasse nuit noire.",
  "Prends-moi un paquet de Export 'A' pis deux gratteux de la Saint-Jean.",
  "Tu devrais louer la cassette avant que quelqu'un d'autre parte avec.",
  "Attends-moi dans l'auto avec l'air climatisé, j'en ai pour deux minutes.",
  "Mets ton cadenas su' ton bicycle si tu rentres dans le dep.",
  'Prends une boîte de beignes au miel pour la pause de midi.',
  "Oublie pas de remettre de la crème solaire su' ton nez.",
  'Ramassez vos canettes avant que le sauveteur ferme la cabane.',
  'Va chercher un cornet double au stand de crème à glace.',
  "Fais sécher ta serviette su' branche de cèdre.",
  "Vérifie les amarres, y'annonce du vent d'ouest pour l'après-midi.",
  "Mets ta veste de flottaison si tu montes su' le zodiak.",
  "Mets-toi à l'ombre du gros saule pleureur pour manger ton sandwich.",
];
const norm = (s) => String(s).replace(/[’‘]/g, "'").trim();
// A new chore written the same way: an errand verb up front, told to "tu".
const CHORE_SHAPE = /^(Ferme|Passe donc|Va chercher|Rentre[sz]?|Prends(-moi)?|Attends-moi|Oublie pas|Ramassez|Fais sécher|Vérifie|Tu devrais|Mets(-toi)?)\b/i;

console.log('the chore lines');
{
  const amb = readJson('ambient.json');
  const lines = [...amb.ambient.map((r) => r.line), ...PED_FALLBACK.map((r) => r.line)].map(norm);
  const pinned = CHORES.filter((c) => lines.includes(norm(c)));
  const shaped = lines.filter((l) => CHORE_SHAPE.test(l));
  ok(pinned.length * 2 <= CHORES.length, `chore lines down from ${CHORES.length} to ${pinned.length} (at least half gone)`, pinned.join(' / '));
  ok(shaped.length * 2 <= CHORES.length, `${shaped.length} lines left that open like a chore`, shaped.join(' / '));
  ok(!PED_FALLBACK.some((r) => CHORE_SHAPE.test(norm(r.line))), 'the peds.js fallback carries no chore');
  // The police radio rides in the same file and racingtext.js reads it from
  // there. Sixty lines on 36dc188; cutting chores must not cost one of them.
  const T = setRacingText(null, amb, null);
  ok(amb.police.length === 60 && T.police.length === 60, `police radio: ${T.police.length} lines through racingtext.js, unchanged`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
