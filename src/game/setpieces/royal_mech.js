// Mission 9 mechanics, pure. « 5 h 45 au Royal Ottawa », part 2 (russellroyal).
// Everything here is (state, dt, input) -> new state, no G, no DOM, so
// tools/smoke_sp_royal.mjs can drive it frame by frame in Node.
//
//   chaseStep   the marshal behind you (a gap in metres, not a car)
//   hillStep    handbrake hill: seconds of screech on the way down
//   stringStep  weed-whacker string: E presses while stopped
//   launchStep  golf ball in the exhaust: E, then W, sputter, LAUNCH
//   skiStep     fairway skiing: Tom on a rope behind the cart, carve points
//   rantStep    Russell's long, blameless explanation on the drive home

// ---------------------------------------------------------------- tuning
export const ROYAL = {
  // chase
  // s for the whole chase (all flags). 1,178 m of grass from the cart to flag 6:
  // at the 29 km/h a cart holds with the ramps that is 146 s, so (146 + 3) x 1.35
  // = 200 s (s1-timers, tools/timers.md). It was 150 s, which asked 28 km/h.
  chaseTime: 200,
  marshalKmh: 21,      // how fast the marshal closes when you are slower than him
  marshalGap0: 40,     // m behind you when the chase starts
  marshalGapMax: 90,   // he never falls further back than this (he knows the course)
  marshalCatchBack: 25,// m he drops back to after a near-catch
  catchPenalty: 6,     // s off the clock for a near-catch. Never an instant fail
  russellKmh: 30,      // Russell's cart, governor off too
  // hill
  hillNeed: 2.0,       // s of screech (Espace held or sliding) on the way down
  hillMinKmh: 8,       // below this the tyres are not screeching anything
  hillSlip: 2.6,       // m/s of sideways slide that counts as a screech without Espace
  hillAssist: 7.0,     // m/s² down the steep face while Espace is held: the cart's
                       // lever would otherwise stall it; this makes it SCREECH down
  hillTopKmh: 50,      // ...up to this
  // string
  stringNeed: 5,       // E presses to tie the bumper back on
  stringStopKmh: 6,    // you have to be stopped
  // launch
  sputterT: 1.4,       // s of « pout pout pout » after W before it goes
  launchKmh: 58,       // what the golf ball gives the cart
  launchHold: 2.5,     // s max the kick keeps pushing (the governor push); ends at takeoff
  launchSettle: 3.0,   // s after the kick before the stage calls it (or on landing)
  // skiing
  rope: 5.5,           // m of rope from the rake to Tom
  swingK: 2.0,         // spring back to the centre line (1/s²)
  swingDamp: 1.5,      // damping (1/s)
  swingGain: 1.0,      // how hard a turn throws Tom outward
  carveMin: 1.2,       // m of swing before it counts as a carve
  carveMinKmh: 10,     // too slow to carve anything
  carveRate: 1.0,      // points per second per metre of swing past carveMin
  fallSwing: 4.6,      // m: past this, Tom eats the fairway...
  fallKmh: 30,         // ...but only if the cart is going this fast
  fallT: 2.2,          // s on the grass before he is back up
  fallCost: 3,         // points lost per fall
  skiNeed: 30,         // carve points to finish the section
  airBonus: 4,         // points for a jump with Tom on the rope
  // the rant
  rantEvery: 5.5,      // s between Russell's lines
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- chase

export function newChase(k = ROYAL) { return { gap: k.marshalGap0, catches: 0, caught: false }; }

/**
 * The marshal is a gap, not a car: he closes at marshalKmh and you open it at
 * your own speed. At 0 he nearly has you: `caught` is true for that one tick,
 * the gap resets to marshalCatchBack and the caller takes catchPenalty off.
 */
export function chaseStep(s, dt, input, k = ROYAL) {
  const you = Math.max(0, input.speedKmh || 0) / 3.6;
  let gap = s.gap + (you - k.marshalKmh / 3.6) * dt;
  gap = Math.min(k.marshalGapMax, gap);
  if (gap <= 0) return { gap: k.marshalCatchBack, catches: s.catches + 1, caught: true };
  return { gap, catches: s.catches, caught: false };
}

// ---------------------------------------------------------------- hill

export function newHill() { return { screech: 0, crest: false, done: false, short: false }; }

/**
 * input: { handbrake, speedKmh, slip (m/s sideways), onHill, atTop, atBottom }.
 * Screech counts on the hill while moving, with Espace held or sliding.
 * Done at the bottom with hillNeed seconds of it. At the bottom without enough
 * `short` is set: the caller sends you back up (atTop clears it).
 */
export function hillStep(s, dt, input, k = ROYAL) {
  const o = { ...s };
  if (o.done) return o;
  if (input.atTop) { o.crest = true; o.short = false; }
  const moving = (input.speedKmh || 0) >= k.hillMinKmh;
  const sliding = !!input.handbrake || Math.abs(input.slip || 0) >= k.hillSlip;
  if (input.onHill && moving && sliding && !o.short) o.screech += dt;
  if (input.atBottom && !o.short) {
    if (o.screech >= k.hillNeed) o.done = true;
    else if (o.crest) { o.short = true; o.crest = false; }
  }
  return o;
}

/**
 * Pure: the pull down the steep face while the lever is held, as a velocity
 * change (dvx, dvz) along the fall line `down` (unit x, z). Zero off the face,
 * without Espace, or past hillTopKmh along the fall line.
 */
export function hillAssist(v, down, dt, input, k = ROYAL) {
  if (!input.onFace || !input.handbrake) return { dvx: 0, dvz: 0 };
  const along = (v.vx || 0) * down.x + (v.vz || 0) * down.z;
  const top = k.hillTopKmh / 3.6;
  if (along >= top) return { dvx: 0, dvz: 0 };
  const a = k.hillAssist * dt * (1 - Math.max(0, along) / top);
  return { dvx: down.x * a, dvz: down.z * a };
}

// ---------------------------------------------------------------- string

export function newString() { return { ties: 0, done: false, rolling: false }; }

/** input: { press (E this tick), speedKmh }. A press while rolling does nothing. */
export function stringStep(s, input, k = ROYAL) {
  const o = { ...s };
  if (o.done) return o;
  o.rolling = (input.speedKmh || 0) > k.stringStopKmh;
  if (input.press && !o.rolling) o.ties += 1;
  if (o.ties >= k.stringNeed) o.done = true;
  return o;
}

// ---------------------------------------------------------------- launch

export function newLaunch() { return { phase: 'idle', t: 0, kicked: false, done: false }; }

/**
 * idle --E, stopped--> jammed --W--> sputter (sputterT) --> boost (launchHold)
 * --> flying (until landed or launchSettle) --> done.
 * Returns { state, kick } where kick is the forward m/s to add THIS tick
 * (only during boost): enough to bring vLong up to launchKmh.
 * input: { press, throttle, speedKmh, vLong, inAir, landed }.
 */
export function launchStep(s, dt, input, k = ROYAL) {
  const o = { ...s };
  let kick = 0;
  o.t += dt;
  switch (o.phase) {
    case 'idle':
      if (input.press && (input.speedKmh || 0) <= k.stringStopKmh) { o.phase = 'jammed'; o.t = 0; }
      break;
    case 'jammed':
      if ((input.throttle || 0) > 0.5) { o.phase = 'sputter'; o.t = 0; }
      break;
    case 'sputter':
      if ((input.throttle || 0) <= 0.5) { o.t = Math.max(0, o.t - dt * 2); break; }
      if (o.t >= k.sputterT) { o.phase = 'boost'; o.t = 0; }
      break;
    case 'boost': {
      const want = k.launchKmh / 3.6;
      kick = Math.max(0, want - (input.vLong || 0));
      o.kicked = true;
      if (o.t >= k.launchHold || input.inAir) { o.phase = 'flying'; o.t = 0; kick = input.inAir ? 0 : kick; }
      break;
    }
    case 'flying':
      if (input.landed || o.t >= k.launchSettle) { o.phase = 'done'; o.done = true; }
      break;
    default: break;
  }
  return { state: o, kick };
}

// ---------------------------------------------------------------- skiing

export function newSki() { return { swing: 0, swingV: 0, score: 0, falls: 0, down: 0, best: 0, done: false }; }

/**
 * Tom on the rope. `swing` is his sideways offset from the cart's track, in
 * metres, positive to the cart's left. A turn throws him outward
 * (centrifugal: yawRate x speed), the rope pulls him back. Carving = being out
 * wide at speed. Too wide AND too fast: he falls, loses fallCost, gets up.
 * input: { speedKmh, yawRate (rad/s, + = left), air (landed a jump this tick) }.
 */
export function skiStep(s, dt, input, k = ROYAL) {
  const o = { ...s };
  if (o.done) return o;
  const sp = Math.max(0, input.speedKmh || 0) / 3.6;
  if (o.down > 0) {
    o.down = Math.max(0, o.down - dt);
    o.swing *= Math.max(0, 1 - dt * 3); o.swingV = 0;
    return o;
  }
  // A left turn (yawRate > 0) throws him right (negative swing).
  const push = -(input.yawRate || 0) * sp * k.swingGain;
  const acc = push - k.swingK * o.swing - k.swingDamp * o.swingV;
  o.swingV += acc * dt;
  o.swing += o.swingV * dt;
  o.swing = clamp(o.swing, -k.rope, k.rope);
  const wide = Math.abs(o.swing);
  if (wide >= k.fallSwing && (input.speedKmh || 0) >= k.fallKmh) {
    o.falls += 1; o.down = k.fallT;
    o.score = Math.max(0, o.score - k.fallCost);
    return o;
  }
  if ((input.speedKmh || 0) >= k.carveMinKmh && wide > k.carveMin) {
    o.score += (wide - k.carveMin) * k.carveRate * dt;
  }
  if (input.air) o.score += k.airBonus;
  o.best = Math.max(o.best, wide);
  if (o.score >= k.skiNeed) o.done = true;
  return o;
}

/** Where Tom is, in the world, for a drawing: rope behind, swing sideways. */
export function skierPos(cart, s, k = ROYAL) {
  const fx = Math.sin(cart.yaw), fz = Math.cos(cart.yaw);
  // local +X is the driver's left: (cos yaw, -sin yaw)
  const lx = Math.cos(cart.yaw), lz = -Math.sin(cart.yaw);
  const back = Math.sqrt(Math.max(0, k.rope * k.rope - s.swing * s.swing));
  return { x: cart.x - fx * back + lx * s.swing, z: cart.z - fz * back + lz * s.swing };
}

// ---------------------------------------------------------------- the rant

// Russell, on the drive home. English, never at fault. <= 12 words, <= 70 chars.
export const RANT = [
  'Okay. So. First of all, the marshal started it.',
  'The hill was steeper than the map said.',
  'Handbrake is a feature. They put it there for a reason.',
  'The bumper was already loose. I just finished the job.',
  'Who leaves a golf ball right next to an exhaust?',
  'That launch was science. Unplanned science.',
  'Skiing was your idea. I was just driving.',
  'They never told me carts were not for racing.',
  'The pro said "never again." Never is a strong word.',
  'Honestly? I made those carts look good.',
  'They will call me back. They always call me back.',
];

export function newRant() { return { i: 0, t: 0 }; }

/** Returns { state, say } where say is the next line on the tick it is due. */
export function rantStep(s, dt, lines = RANT, k = ROYAL) {
  const o = { ...s };
  let say = null;
  if (o.i >= lines.length) return { state: o, say };
  o.t += dt;
  if (o.i === 0 ? o.t >= 1 : o.t >= k.rantEvery) { say = lines[o.i]; o.i += 1; o.t = 0; }
  return { state: o, say };
}
