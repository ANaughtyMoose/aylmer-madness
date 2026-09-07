// Gas. A half-tank in the opener, 84,9 ¢ the litre at the Petro-Canada (the
// flavour lines have said so since before there was a gauge), and the only
// thing that makes the envelope go DOWN on a day you did nothing wrong. Over a
// summer of doing everything once it costs about $250 — a quarter of what the
// jobs bring in — which is the number the plan's budget table wants.
//
// The tank belongs to the car, not the player: a friend's car comes with what
// is in it, and nobody fills a car they are lending you. Bikes and the golf
// cart have no tank and burn nothing.

export const PRICE = 0.849;          // $/L, regular, July 2004
export const RESERVE = 6;            // litres: the light comes on
export const FILL_HOLD = 2.2;        // seconds stopped on the forecourt before the pump runs
export const JERRYCAN = { litres: 5, price: 10 };   // « un gars te vend un bidon »
export const LEND_FRACTION = 0.6;    // what is in a friend's tank when you take it

// Litres. Real tanks, rounded; anything not listed gets a guess from its mass.
export const TANK = {
  ranger: 62, saturn: 47, civic: 45, sunfire: 57, forester: 60, sienna: 79,
  cavalier: 57, cutlass: 60, caravan: 76, f250: 72, bus: 300, schoolbus: 230,
  cart: 0, cruiser: 0, dbike: 0,
};
// L/100 km at a steady cruise. The 2.3 Ranger is thirsty for what it is.
export const BURN = {
  ranger: 12.5, saturn: 7.5, civic: 7.0, sunfire: 8.5, forester: 10.0, sienna: 11.0,
  cavalier: 8.5, cutlass: 11.0, caravan: 12.0, f250: 17.0, bus: 45.0, schoolbus: 35.0,
};

export function tankOf(spec) {
  if (!spec) return 0;
  if (TANK[spec.id] != null) return TANK[spec.id];
  return spec.mass > 2500 ? 200 : 55;
}
export function burnOf(spec) { return (spec && BURN[spec.id]) || 10; }
export function hasTank(spec) { return tankOf(spec) > 0; }

/**
 * A new game or a load. `G.fuel` is the current car's litres (what save.js
 * carries); `G.fuelBy` remembers every car you have driven this session so
 * swapping back does not refill for free.
 */
export function initFuel(G, save) {
  G.fuelBy = {};
  const spec = G.veh && G.veh.spec;
  const tank = tankOf(spec);
  let litres = save && Number.isFinite(save.fuel) ? Math.max(0, Math.min(tank || 200, save.fuel)) : null;
  if (litres == null) litres = tank * 0.5;   // « un demi-réservoir »
  G.fuel = tank > 0 ? litres : 0;
  if (spec) G.fuelBy[spec.id] = G.fuel;
  G.fuelT = 0;
  G.fuelWarned = false;
  return G;
}

/** Leaving one car for another. Called with the specs, before the swap lands. */
export function onSwap(G, fromSpec, toSpec) {
  if (!G.fuelBy) G.fuelBy = {};
  if (fromSpec) G.fuelBy[fromSpec.id] = G.fuel;
  const tank = tankOf(toSpec);
  if (tank <= 0) { G.fuel = 0; }
  else if (G.fuelBy[toSpec.id] != null) G.fuel = G.fuelBy[toSpec.id];
  else G.fuel = tank * LEND_FRACTION;
  G.fuelBy[toSpec.id] = G.fuel;
  G.fuelWarned = G.fuel > RESERVE ? false : G.fuelWarned;
  return G.fuel;
}

/** Litres burned over `metres` at this throttle. Idling burns a trickle too. */
export function burn(spec, metres, throttle, dt) {
  if (!hasTank(spec)) return 0;
  const perM = burnOf(spec) / 100000;                       // L per metre at cruise
  const load = 0.55 + 0.9 * Math.max(0, Math.min(1, throttle));   // 1.0 at half throttle
  return perM * metres * load + 0.00025 * dt;
}

/**
 * Once a tick, from main.js. Burns, warns once at the reserve, and runs the
 * pump when you sit still on the forecourt. Returns a spec override when the
 * tank is dry — the same trick weather.js plays: the Vehicle gets a clone of
 * its own sheet with no engine in it, and coasts.
 */
export function tickFuel(G, dt, v, throttle, atPump) {
  const spec = v.baseSpec || v.spec;
  if (!hasTank(spec)) { G.fuel = 0; return null; }
  const tank = tankOf(spec);
  const metres = Math.abs(v.vLong || 0) * dt;
  G.fuel = Math.max(0, G.fuel - burn(spec, metres, throttle, dt));
  if (G.fuelBy) G.fuelBy[spec.id] = G.fuel;

  if (G.fuel <= RESERVE && !G.fuelWarned) {
    G.fuelWarned = true;
    if (G.hud) G.hud.toast(G.fuel > 0 ? 'La lumière du gaz.\nLa Petro-Canada est sur le chemin d’Aylmer.' : 'Panne sèche.', 3200);
  } else if (G.fuel > RESERVE * 2) G.fuelWarned = false;

  // The pump: stop on the forecourt and it fills what the wallet can pay for.
  if (atPump && Math.abs(v.vLong || 0) < 0.6 && G.fuel < tank * 0.92) {
    G.fuelT += dt;
    if (G.fuelT >= FILL_HOLD) { fill(G, spec); G.fuelT = -6; }   // one fill per stop
  } else if (G.fuelT > 0) G.fuelT = 0;
  else if (G.fuelT < 0) G.fuelT = Math.min(0, G.fuelT + dt);

  if (G.fuel <= 0) {
    if (G.hud && !G.dryToasted) { G.dryToasted = true; G.hud.toast('Panne sèche.\nT — un gars te vend un bidon (5 L, 10 $).', 3600); }
    return { ...v.spec, accel: 0 };
  }
  G.dryToasted = false;
  return null;
}

/** What the pump wants for a full tank, and what it can do for the money you have. */
export function quote(G, spec) {
  const tank = tankOf(spec);
  const need = Math.max(0, tank - G.fuel);
  const cost = need * PRICE;
  const cash = G.wallet ? G.wallet.value : 0;
  const litres = cost <= cash ? need : Math.max(0, cash / PRICE);
  return { need, litres, cost: Math.round(litres * PRICE * 100) / 100 };
}

export function fill(G, spec) {
  const q = quote(G, spec);
  if (q.litres < 0.5) {
    if (G.hud && G.wallet && G.wallet.value < 1) G.hud.toast('La pompiste te regarde. T’as pas une cenne.', 2400);
    return 0;
  }
  const paid = Math.round(q.cost);
  if (G.wallet && !G.wallet.spend(paid)) return 0;
  G.fuel += q.litres;
  if (G.fuelBy) G.fuelBy[spec.id] = G.fuel;
  if (G.hud) G.hud.toast(`Le plein: ${q.litres.toFixed(0)} L, ${paid} $.` + (q.litres < q.need - 0.5 ? '\n(C’est tout ce que t’avais.)' : ''), 2600);
  return q.litres;
}

/** T with a dry tank: the jerrycan. Broke, you still get enough to limp. */
export function jerrycan(G, spec) {
  if (!hasTank(spec) || G.fuel > 0.5) return false;
  if (G.wallet && G.wallet.spend(JERRYCAN.price)) {
    G.fuel += JERRYCAN.litres;
    if (G.hud) G.hud.toast(`Un gars s’arrête avec un bidon. ${JERRYCAN.litres} L, ${JERRYCAN.price} $.`, 2600);
  } else {
    G.fuel += 2;
    if (G.hud) G.hud.toast('Un gars te donne deux litres pis te dit d’aller travailler.', 2600);
  }
  if (G.fuelBy) G.fuelBy[spec.id] = G.fuel;
  G.dryToasted = false;
  return true;
}
