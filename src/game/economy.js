// The wiring for the money loop: the mechanic's screen, the Kijiji key, the
// modifier layer that puts the parts you bought on the car you are driving, and
// the watcher that hands over a famous car the moment you have deserved it.
//
// main.js gets ONE block for all of this (see the end of that file) because
// three other agents are editing it this wave. Everything substantial is here,
// in game/upgrades.js, in game/kijiji.js and in game/famouscars.js.
//
// The one thing worth knowing before reading on: the upgrade layer never
// touches a spec. Every frame this module checks whether G.veh.spec is the
// derived spec the current parts imply and, if it is not, swaps it — which is
// also how it survives enterDrive() and swapCar() rebuilding the Vehicle
// without either of them knowing this file exists. Rivals and traffic build
// their own Vehicles from the untouched CARS entries and are never tuned.
import { buildCarBody } from './cars.js';
import { restoreDamage } from './damage.js';
import {
  PARTS, BOARD, tuned, tunedSound, canFit, fit, priceOf, measure, bodyPrice, PAINT,
  PAINT_PRICE, PAINT_LABEL, BODY_LABEL, partsMul, isStock,
  NORM, loadMechanic, normSay,
} from './upgrades.js';
import { FAMOUS, JUMPS, OWNERS, RUMOURS, watchJumps, claimFamous, jumpsFound } from './famouscars.js';
import * as kijiji from './kijiji.js';

// Where Norm works. Both are places.js keys that damage.js already treats as
// garages, so « U » and the repair E live on the same forecourt. The sign over
// the bay on chemin d'Aylmer still says « & Fils »; the sons have not spoken to
// him since 1996.
const SHOPS = [
  { place: 'norm', name: 'Garage Norm Lafleur & Fils', line: 'chemin d’Aylmer, la baie en arrière' },
  { place: 'gas', name: 'Norm, en dépannage', line: 'à la Petro-Canada' },
];
const SHOP_RADIUS = 30;

const money = (n) => Math.round(n).toLocaleString('fr-CA') + ' $';
const secs = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ',') + ' s');
const kmh = (v) => Math.round(v) + ' km/h';
const metres = (v) => v.toFixed(1).replace('.', ',') + ' m';
const gee = (v) => v.toFixed(2).replace('.', ',') + ' g';

// ---------------------------------------------------------------- chrome

const CSS = `
#mecano{position:fixed;inset:0;z-index:60;overflow:auto;color:#e8e6e0;
  background:linear-gradient(160deg,#20262c,#0d1114 65%);font:13px/1.6 Helvetica,Arial,sans-serif}
#mecano .wrap{max-width:940px;margin:0 auto;padding:22px 24px 48px}
#mecano h2{font:800 26px/1.1 Helvetica,Arial,sans-serif;letter-spacing:1px;margin:0}
#mecano .sub{opacity:.6;font-size:12px;letter-spacing:.6px;margin-top:4px}
#mecano .top{display:flex;align-items:flex-start;gap:16px;border-bottom:2px solid #c8102e;padding-bottom:12px}
#mecano .top .cash{margin-left:auto;text-align:right}
#mecano .top .cash b{display:block;font-size:22px;color:#ffc94d}
#mecano button{font:700 12px Helvetica,Arial,sans-serif;padding:7px 13px;border:0;border-radius:5px;
  background:#c8102e;color:#fff;cursor:pointer;letter-spacing:.4px}
#mecano button.ghost{background:#2c343b;color:#cfd4d8}
#mecano button:disabled{background:#2a2f34;color:#6c757c;cursor:default}
#mecano .cols{display:flex;gap:22px;margin-top:16px;align-items:flex-start;flex-wrap:wrap}
#mecano .parts{flex:1 1 460px;min-width:340px}
#mecano .sheet{flex:0 0 300px;background:#161c21;border:1px solid #2c343b;border-radius:8px;padding:14px 16px}
#mecano .row{display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #232a30}
#mecano .row .txt{flex:1}
#mecano .row .nm{font-weight:700;letter-spacing:.3px}
#mecano .row .lv{font-size:11px;color:#8fd39a}
#mecano .row .nx{font-size:11.5px;opacity:.75}
#mecano .row .pr{white-space:nowrap;font-weight:700;color:#ffc94d}
#mecano .pips{display:inline-flex;gap:3px;margin-left:8px;vertical-align:middle}
#mecano .pips i{width:13px;height:5px;border-radius:2px;background:#39424a;display:block}
#mecano .pips i.on{background:#8fd39a}
#mecano .sheet h3{font:800 12px Helvetica,Arial,sans-serif;letter-spacing:1.4px;margin:0 0 10px;color:#9aa4ad}
#mecano .st{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dotted #2c343b}
#mecano .st u{text-decoration:none;opacity:.7}
#mecano .st b{font-weight:700}
#mecano .up{color:#8fd39a}
#mecano .down{color:#e2705f}
#mecano .swatches{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
#mecano .swatches button{width:34px;height:26px;padding:0;border:2px solid #39424a;border-radius:4px}
#mecano .swatches button.on{border-color:#ffc94d;box-shadow:0 0 0 2px rgba(255,201,77,.25)}
#mecano .st s{opacity:.45;font-size:11.5px}
#mecano .note{font-size:11.5px;opacity:.62;margin-top:10px;font-style:italic}
#mecano .norm{background:#161c21;border-left:3px solid #c8102e;border-radius:0 6px 6px 0;
  padding:10px 14px;margin:14px 0 0;font-size:13.5px;line-height:1.55}
#mecano .norm b{display:block;font-size:10.5px;letter-spacing:1.6px;color:#9aa4ad;margin-bottom:4px}
#mecano .norm.bad{border-left-color:#e2705f;color:#f0c9c2}
#mecano .board{font-size:11px;opacity:.55;margin-top:12px;line-height:1.7}
#mecano .no{color:#e2705f;font-size:11px}
#econprompt{position:fixed;bottom:calc(22% - 66px);left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.55);padding:7px 15px;border-radius:20px;font:14px Helvetica,Arial,sans-serif;
  color:#ffc94d;white-space:nowrap;z-index:5;pointer-events:none}
#econprompt.hidden{display:none}
#moment{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 50% 38%,rgba(18,24,30,.985),rgba(3,5,7,1));
  color:#fff;font:15px/1.75 Helvetica,Arial,sans-serif;text-align:center;padding:24px}
#moment .card{max-width:640px}
#moment .kicker{color:#ffc94d;font:800 12px Helvetica,Arial,sans-serif;letter-spacing:4px}
#moment .paint{width:120px;height:5px;border-radius:3px;margin:18px auto 0}
#moment h1{font:800 34px/1.1 Helvetica,Arial,sans-serif;letter-spacing:2px;margin:12px 0 6px}
#moment .car{color:#8fd39a;font-weight:700;letter-spacing:.6px;margin-bottom:16px}
#moment p{white-space:pre-wrap;opacity:.88}
#moment .key{margin-top:22px;opacity:.5;font-size:12px;letter-spacing:2px}
#moment.hidden{display:none}
`;

function inject() {
  if (document.getElementById('economy-css')) return;
  const s = document.createElement('style');
  s.id = 'economy-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function div(id, cls) {
  let e = document.getElementById(id);
  if (e) return e;
  e = document.createElement('div');
  e.id = id;
  if (cls) e.className = cls;
  document.body.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- install

export function installEconomy(env) {
  const { G, hud, audio, PLACES, OWNER, carById, curbSpot } = env;
  inject();
  // The famous cars and the Tempo need a driveway of their own or « Remettre
  // les chars chez eux » would put them at (0, 0).
  Object.assign(OWNER, OWNERS);

  const prompt = div('econprompt', 'hidden');
  const moment = div('moment', 'hidden');

  // ---- the modifier layer ------------------------------------------------
  // One derived spec per (car, parts) pair, kept until the parts change. Built
  // lazily because tuned() allocates and this runs sixty times a second.
  let cache = { key: '', spec: null, sound: null };
  function wanted() {
    const base = carById(G.carId);
    // rawMods, not modsFor: this runs sixty times a second and a stock car
    // should not allocate a record just to be told it is stock.
    const mods = G.garage ? G.garage.rawMods(G.carId) : null;
    const key = G.carId + ':' + JSON.stringify(mods);
    if (cache.key !== key) {
      cache = { key, spec: tuned(base, mods), sound: tunedSound(base.sound, mods) };
    }
    return cache;
  }

  // Put the parts on the car. Called every frame: enterDrive() and swapCar()
  // both build a Vehicle straight off the CARS entry and neither knows about
  // this file, so this is where a freshly-built car gets its camshaft back.
  function retune() {
    if (!G.veh) return false;
    const w = wanted();
    if (G.veh.spec === w.spec) return false;
    G.veh.spec = w.spec;
    if (audio && audio.setEngineProfile) audio.setEngineProfile(w.sound);
    return true;
  }

  // A repaint is the one upgrade the renderer has to be told about: the body
  // colour is baked into the vertex colours at upload time.
  function repaint(id) {
    if (!G.renderer || !G.meshes || !G.meshes.cars) return;
    const spec = tuned(carById(id), G.garage.modsFor(id));
    G.meshes.cars[id] = G.renderer.upload(buildCarBody(spec));
  }

  // ---- the moment --------------------------------------------------------

  function showMoment(f) {
    const spec = carById(f.id);
    moment.innerHTML = `<div class="card">
      <div class="kicker">CHAR DÉBLOQUÉ</div>
      <h1>${f.title}</h1>
      <div class="car">${spec.name}</div>
      <p>${f.card}</p>
      <div class="paint" style="background:#${spec.body.toString(16).padStart(6, '0')}"></div>
      <div class="key">ESPACE / E / clic</div></div>`;
    moment.classList.remove('hidden');
    if (audio && audio.chime) audio.chime(true);
  }
  const hideMoment = () => { moment.classList.add('hidden'); };

  // Park a car that has just changed hands at its owner's kerb, the way
  // main.js's own newlyUnlocked() loop does for the lent cars.
  function deliver(id, quiet = false) {
    if (id === G.carId || !G.parked || G.parked[id]) return;
    const key = OWNER[id] === 'usedlot' ? 'home' : OWNER[id];
    const p = PLACES[key] || PLACES.home;
    let slot = (OWNER[G.carId] === OWNER[id]) ? 1 : 0;
    for (const other of Object.keys(G.parked)) if (OWNER[other] === OWNER[id]) slot++;
    G.parked[id] = curbSpot(p, slot);
    if (!quiet) {
      hud.toast(`${carById(id).name}\nil t’attend au ${p.label}`, 3200);
    }
  }

  // ---- the shop ----------------------------------------------------------

  const shopEl = div('mecano', 'hidden');
  shopEl.style.display = 'none';
  let shopOpen = false, shopName = '', before = null;
  // One greeting and one rumour per visit, and whatever Norm last said about
  // the work — kept out of paintShop() so a repaint does not restart him.
  let visit = 0, said = '', shopSub = '';
  loadMechanic();

  // measure() drives a Vehicle through four full tests; on a busy machine that
  // is a noticeable pause. Keyed on the parts that change a number, so choosing
  // a paint colour repaints the panel without running the bench again.
  let bench = { key: '', out: null };
  function benchFor(id, mods, spec) {
    const key = id + ':' + PARTS.map((p) => mods[p.id]).join('.');
    if (bench.key !== key) bench = { key, out: measure(spec) };
    return bench.out;
  }

  // One line of the work order. `val` and `prev` are the raw measurements —
  // formatting happens here so the comparison is done on numbers, which is the
  // bug this shape exists to make impossible.
  function statRow(label, val, prev, fmt, better) {
    if (val == null) return `<div class="st"><u>${label}</u><span><b>—</b></span></div>`;
    let was = '';
    // Compared on the PRINTED value, not the raw one: a rounding-width wobble in
    // the measurement is not a change the customer paid for.
    if (prev != null && fmt(prev) !== fmt(val)) {
      const good = better === 'down' ? val < prev : val > prev;
      was = `<s>${fmt(prev)}</s> <b class="${good ? 'up' : 'down'}">▸</b> `;
    }
    return `<div class="st"><u>${label}</u><span>${was}<b>${fmt(val)}</b></span></div>`;
  }

  function sheetHTML(now, prev) {
    return `<h3>FICHE TECHNIQUE</h3>
      ${statRow('0 &agrave; 100 km/h', now.zeroTo100, prev && prev.zeroTo100, secs, 'down')}
      ${statRow('Vitesse max', now.top, prev && prev.top, kmh, 'up')}
      ${statRow('Freinage 100&ndash;0', now.brake, prev && prev.brake, metres, 'down')}
      ${statRow('Courbe (rayon 40 m)', now.corner, prev && prev.corner, kmh, 'up')}
      <div class="note">Chiffres pris sur le banc, pas dans le stationnement.</div>`;
  }

  // What money will never buy. Sits under the work order because the shop is
  // the one screen where you are already thinking about what you are chasing.
  function earnHTML() {
    const rows = FAMOUS.map((f) => {
      const got = G.garage.has(f.id);
      const extra = f.id === 'firebird' ? ` (${jumpsFound(G.garage)}/${JUMPS.length})` : '';
      return `<div class="st"><u>${carById(f.id).name}</u>
        <span class="${got ? 'up' : ''}">${got ? 'À TOI' : f.need + extra}</span></div>`;
    }).join('');
    return `<h3 style="margin-top:18px">ÇA S’ACHÈTE PAS</h3>${rows}
      <div class="note">Quatre chars que tout le monde en ville connaît. Y a pas de prix dessus.</div>`;
  }

  // Norm's line for this repaint: whatever he just said about the work, or the
  // state of the thing you drove in on, or hello.
  function normBlock(damage, brokeFor) {
    if (said) return `<div class="norm"><b>${NORM.name}</b>${said}</div>`;
    if (brokeFor) return `<div class="norm bad"><b>${NORM.name}</b>${normSay('broke', visit + brokeFor.length)}</div>`;
    if (damage >= 60) return `<div class="norm bad"><b>${NORM.name}</b>${normSay('wrecked', visit)}</div>`;
    return `<div class="norm"><b>${NORM.name}</b>${normSay('greetings', visit)}</div>`;
  }

  function paintShop() {
    const id = G.carId;
    const base = carById(id);
    const mods = G.garage.modsFor(id);
    const spec = tuned(base, mods);
    const wallet = G.wallet;
    const now = benchFor(id, mods, spec);
    const damage = G.veh ? G.veh.damage : 0;

    const rows = PARTS.map((p) => {
      const lv = mods[p.id];
      const maxed = lv >= p.levels.length;
      const r = canFit(base, mods, p.id, wallet);
      const pips = p.levels.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const nx = maxed ? '<span class="lv">Rien de plus à faire.</span>'
        : `<span class="nx">${p.levels[lv].label}</span>`;
      return `<div class="row"><div class="txt">
        <div class="nm">${p.name}<span class="pips">${pips}</span></div>
        ${lv ? `<div class="lv">Posé : ${p.levels[lv - 1].label}</div>` : `<div class="lv" style="color:#8a939b">D’origine. ${p.blurb}</div>`}
        <div>${nx}</div>
        ${!maxed && !r.ok ? `<div class="no">${r.why}</div>` : ''}
      </div>
      <div class="pr">${maxed ? '' : money(r.price)}</div>
      <button data-fit="${p.id}" ${maxed || !r.ok ? 'disabled' : ''}>${maxed ? 'AU BOUTTE' : 'POSER'}</button></div>`;
    }).join('');

    const bodyCost = bodyPrice(base, damage);
    const canBody = damage > 0 && wallet.can(bodyCost);
    const paintCost = Math.round(PAINT_PRICE * partsMul(base) / 5) * 5;
    const nowHex = mods.paint == null ? base.body : mods.paint;
    const swatches = PAINT.map((c) =>
      `<button data-paint="${c.hex}" title="${c.name} — ${money(paintCost)}"
        class="${c.hex === nowHex ? 'on' : ''}"
        style="background:#${c.hex.toString(16).padStart(6, '0')}"></button>`).join('');

    // Somebody Norm would refuse today: the cheapest thing he sells that you
    // still cannot pay for.
    const brokeFor = PARTS.map((p) => canFit(base, mods, p.id, wallet))
      .find((r) => !r.ok && /manque/.test(r.why || '')) || null;

    shopEl.innerHTML = `<div class="wrap">
      <div class="top">
        <div><h2>${shopName.toUpperCase()}</h2>
          <div class="sub">${shopSub} &middot; ${base.name}${isStock(mods) ? '' : ' &middot; modifié'}</div></div>
        <div class="cash"><b>${money(wallet.value)}</b>
          <button class="ghost" data-act="close">Fermer (Échap)</button></div>
      </div>
      ${normBlock(damage, brokeFor && brokeFor.why)}
      <div class="cols">
        <div class="parts">${rows}
          <div class="row"><div class="txt">
            <div class="nm">Débosselage</div>
            <div class="lv" style="color:#8a939b">${damage > 0
              ? BODY_LABEL + '. ' + Math.round(damage) + ' % de dommage.'
              : 'Y a rien à débosseler. Ton char est droit.'}</div>
          </div><div class="pr">${damage > 0 ? money(bodyCost) : ''}</div>
          <button data-act="body" ${canBody ? '' : 'disabled'}>REDRESSER</button></div>
          <div class="row"><div class="txt">
            <div class="nm">Job de peinture</div>
            <div class="lv" style="color:#8a939b">${PAINT_LABEL}. Au fusil, porte ouverte. Choisis une couleur.</div>
            <div class="swatches">${swatches}</div>
          </div><div class="pr">${money(paintCost)}</div></div>
        </div>
        <div class="sheet">${sheetHTML(now, before)}${earnHTML()}</div>
      </div>
      <div class="board"><b>Norm fait ça aussi, demande-lui :</b> ${BOARD.join(' &middot; ')}.</div>
      <div class="board" style="opacity:.42">« ${RUMOURS[visit % RUMOURS.length]} »</div>
    </div>`;
    before = now;
    shopEl.onclick = onShopClick;
  }

  function onShopClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const id = G.carId, base = carById(id), mods = G.garage.modsFor(id);
    if (b.dataset.act === 'close') { closeShop(); return; }
    if (b.dataset.fit) {
      const r = fit(base, mods, b.dataset.fit, G.wallet);
      if (!r.ok) return;
      G.garage.setMods(id, mods);
      retune();
      if (audio && audio.wrench) audio.wrench();
      said = normSay('work', visit + r.level, b.dataset.fit);
      hud.toast(`Posé — ${money(r.price)}\n${carById(id).name}`, 2200);
      paintShop();
      if (G.autosave) G.autosave('upgrade');
      return;
    }
    if (b.dataset.act === 'body') {
      const cost = bodyPrice(base, G.veh ? G.veh.damage : 0);
      if (!G.wallet.spend(cost)) return;
      if (G.veh && G.veh.spec.id === id) { G.veh.repair(); G.health[id] = 0; }
      else G.health[id] = 0;
      G.repairHints.h25 = false; G.repairHints.h60 = false;
      hud.setRepairHint(null);
      said = normSay('work', visit, 'carrosserie');
      hud.toast(`Redressé — ${money(cost)}\nDroit comme en 1988.`, 2400);
      paintShop();
      if (G.autosave) G.autosave('bodywork');
      return;
    }
    if (b.dataset.paint) {
      const cost = Math.round(PAINT_PRICE * partsMul(base) / 5) * 5;
      const hex = Number(b.dataset.paint);
      if (mods.paint === hex) return;
      if (!G.wallet.can(cost)) { hud.toast(`Il te manque ${Math.round(cost - G.wallet.value)} $`, 1800, true); return; }
      G.wallet.spend(cost);
      mods.paint = hex;
      G.garage.setMods(id, mods);
      cache.key = '';
      retune();
      repaint(id);
      const name = (PAINT.find((c) => c.hex === hex) || {}).name || '';
      said = normSay('work', visit, 'peinture');
      hud.toast(`Peinturé — ${money(cost)}\n${name}`, 2400);
      paintShop();
      if (G.autosave) G.autosave('paint');
    }
  }

  function openShop(shop) {
    shopName = shop ? shop.name : 'Le mécanicien';
    shopSub = shop ? shop.line : 'chez vous';
    before = null;
    said = '';
    visit++;
    shopOpen = true;
    shopEl.style.display = 'block';
    shopEl.classList.remove('hidden');
    paintShop();
    if (audio) { audio.engine(0, 0); audio.skid(0); }
  }
  function closeShop() {
    shopOpen = false;
    shopEl.style.display = 'none';
    shopEl.classList.add('hidden');
  }

  /** The shop you are parked on the forecourt of, or null. */
  function shopAt() {
    const v = G.veh;
    if (!v || Math.abs(v.vLong) > 1.5) return null;
    for (const s of SHOPS) {
      const p = PLACES[s.place];
      if (!p) continue;
      const dx = v.x - p.x, dz = v.z - p.z;
      if (dx * dx + dz * dz < SHOP_RADIUS * SHOP_RADIUS) return s;
    }
    return null;
  }

  // ---- Kijiji ------------------------------------------------------------

  function openKijiji() {
    kijiji.open({
      garage: G.garage, wallet: G.wallet, done: G.done,
      // `deal` is { flaw, inspected, rebate }. A car you did not put on the
      // hoist arrives with whatever is wrong with it already on the clock —
      // which is the twenty-five dollars you saved, and then some.
      onBuy: (id, deal = {}) => {
        deliver(id, true);
        const p = PLACES[OWNER[id] === 'usedlot' ? 'home' : OWNER[id]] || PLACES.home;
        const flaw = deal.flaw;
        if (flaw && flaw.damage) {
          G.health[id] = Math.max(G.health[id] || 0, flaw.damage);
          if (G.veh && G.veh.spec.id === id) restoreDamage(G.veh, G.health[id]);
        }
        hud.toast(`VENDU — ${carById(id).name}\nIl t’a finalement rappelé.\n`
          + `Le char t’attend au ${p.label}.`
          + (deal.rebate ? `\n(${money(deal.rebate)} de moins grâce au rapport)` : ''), 3600);
        if (flaw && flaw.damage) {
          hud.toast(deal.inspected
            ? `Tu le savais : ${flaw.text}`
            : `Personne l’a inspecté.\n${flaw.text}`, 4200, !deal.inspected);
        }
        if (audio && audio.chime) audio.chime(true);
        if (G.autosave) G.autosave('kijiji');
      },
      onClose: () => {},
    });
    if (audio) { audio.engine(0, 0); audio.skid(0); }
  }

  // ---- the frame ---------------------------------------------------------

  // Neither screen pauses the game — that is main.js's business and this agent
  // gets one hook. So both of them require a stopped car to open, and both shut
  // themselves if the car starts rolling while they are up: holding W behind a
  // modal is the one way a shop screen could put you in the river.
  const ROLLING = 3;

  function pulse() {
    if (!G.veh || G.mode !== 'drive') { prompt.classList.add('hidden'); return; }
    retune();
    if (Math.abs(G.veh.vLong) > ROLLING && (shopOpen || kijiji.isOpen())) {
      closeShop();
      kijiji.close();
      hud.toast('Ton char roule.', 1400, true);
    }

    // A jump you have not landed before.
    const j = watchJumps(G.veh, G.garage);
    if (j) {
      const n = jumpsFound(G.garage);
      hud.toast(`SAUT TROUVÉ — ${j.label}\n${n}/${JUMPS.length}`, 2800);
      if (audio && audio.blip) audio.blip(980, 0.12, 'triangle', 0.18);
    }

    // ...and anything you have just deserved.
    for (const f of claimFamous(G.garage, G.done)) {
      deliver(f.id, true);
      G.garage.seen.add(f.id);          // main.js's own toast stays out of the way
      showMoment(f);
      if (G.autosave) G.autosave('famous:' + f.id);
    }

    // The forecourt prompt. Silent while a mission, a repair or the moment card
    // owns the screen — those keys belong to somebody else.
    if (G.mission || momentVisible() || shopOpen || kijiji.isOpen()) {
      prompt.classList.add('hidden');
      return;
    }
    const s = shopAt();
    prompt.textContent = s
      ? `U  —  ${s.name}     ·     K  —  Kijiji`
      : 'K  —  Kijiji';
    prompt.classList.toggle('hidden', !s && !nearHint());
  }

  const momentVisible = () => !moment.classList.contains('hidden');
  // Where the « K » hint is worth the HUD space: the family computer at 299
  // Fraser, and the gravel at Ti-Guy's where you are already looking at prices.
  const HINT_AT = ['home', 'usedlot'];
  function nearHint() {
    const v = G.veh;
    if (!v) return false;
    return HINT_AT.some((k) => {
      const p = PLACES[k];
      return p && Math.hypot(v.x - p.x, v.z - p.z) < 30;
    });
  }

  // Own rAF loop rather than a line inside main.js's tick(): the block main.js
  // gives this agent is one import and one call, and a second rAF costs a few
  // microseconds a frame.
  function loop() {
    try { pulse(); } catch (e) { console.warn('economy', e); }
    requestAnimationFrame(loop);
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

  // A headless test drives the sim through AYLMER.step() with no rAF at all,
  // so the same pulse rides along with it.
  if (env.api && typeof env.api.step === 'function') {
    const step = env.api.step.bind(env.api);
    env.api.step = (dt) => { const r = step(dt); try { pulse(); } catch (e) { console.warn('economy', e); } return r; };
  }

  // ---- keys --------------------------------------------------------------

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (kijiji.isOpen()) { kijiji.close(); e.preventDefault(); return; }
      if (shopOpen) { closeShop(); e.preventDefault(); return; }
    }
    if (momentVisible() && ['Space', 'KeyE', 'Enter', 'Escape'].includes(e.code)) {
      hideMoment(); e.preventDefault(); return;
    }
    if (G.mode !== 'drive' || shopOpen || kijiji.isOpen() || momentVisible()) return;
    if (e.code !== 'KeyK' && e.code !== 'KeyU') return;
    if (G.veh && Math.abs(G.veh.vLong) > 1.5) {
      hud.toast('Arrête-toi d’abord.', 1400);
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyK') { openKijiji(); e.preventDefault(); return; }
    if (e.code === 'KeyU') {
      const s = shopAt();
      if (s) openShop(s);
      else hud.toast('Norm Lafleur est su’ l’chemin d’Aylmer,\nla baie en arrière du Canadian Tire. Stationne-toi là.', 2600);
      e.preventDefault();
    }
  });
  window.addEventListener('pointerdown', () => { if (momentVisible()) hideMoment(); });

  // ---- what the tests poke at -------------------------------------------

  const api = {
    openShop: () => openShop(shopAt() || SHOPS[0]),
    closeShop, openKijiji, closeKijiji: kijiji.close,
    shopAt, retune, deliver, repaint,
    mods: () => G.garage.modsFor(G.carId),
    fit: (partId) => {
      const base = carById(G.carId), mods = G.garage.modsFor(G.carId);
      const r = fit(base, mods, partId, G.wallet);
      if (r.ok) { G.garage.setMods(G.carId, mods); retune(); }
      return r;
    },
    measure: (id = G.carId) => measure(tuned(carById(id), G.garage.modsFor(id))),
    price: (partId) => priceOf(carById(G.carId), partId, G.garage.modsFor(G.carId)[partId]),
    jumps: () => JUMPS.map((j) => ({ ...j, got: G.garage.hasFeat(j.feat) })),
    famous: () => FAMOUS.map((f) => ({ id: f.id, need: f.need, got: G.garage.has(f.id) })),
    grant: (id) => { const f = FAMOUS.find((q) => q.id === id); if (f) { G.garage.earn(id); deliver(id, true); showMoment(f); } },
    moment: () => momentVisible(),
  };
  if (env.api) env.api.economy = api;
  return api;
}
