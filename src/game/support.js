// The people in the truck notice how you are driving.
//
// assets/text/support.json is fifty lines of your friends being generous about
// it — Sayyad turning a bent bumper into symmetry, Margaret pointing out that
// the maples are nice down this street you did not mean to be on, Mike offering
// to push the wing back out with a 2x4. heckle.js holds the corpus and the
// limiter (see `support()` there). This file holds the two things that make it
// land instead of reading like a fortune cookie:
//
//   1. WHO IS ENTITLED TO SAY IT. Only somebody who is actually aboard
//      (avatars.js's riders(), read off the stages you have completed) or whose
//      errand this is (the speakers story.js already gives that job). A line
//      out of nobody's mouth is a hint; the same line out of Sayyad's is a
//      friend. Off a job, in an empty truck, nobody says anything at all.
//   2. WHEN. Ten detectors on the signals the game already keeps — damage,
//      props smashed, lateral slip, braking, air, speed, elapsed time. All of
//      them deliberately slow, and all of them behind heckle.js's one-line-
//      every-four-seconds limiter, which the town shares.
//
// Four of support.json's fourteen situations are NOT wired, on purpose, because
// the game has nothing honest to fire them with (said out loud rather than
// faked): `stalling_engine` — the gearbox is automatic and nothing stalls;
// `driving_in_circles`, `getting_lost` and `missed_turn` — nothing tracks a
// repeated route or a missed junction. Their lines are not lost: supportPool()
// in heckle.js falls back to that person's `general_failure` line, so every
// person still has a voice for a situation nobody wrote them one for.
import { riders } from './avatars.js';
import { FRIEND_LINES } from './story.js';

// The five people who have lines in support.json. Anybody else in the truck
// rides in silence rather than borrowing somebody's voice.
export const VOICES = ['Sayyad', 'Margaret', 'Adam', 'Mike', 'Zahra'];

// What counts as what.
export const SCRATCH = 1.5;     // damage points: a scrape
export const BUMP = 4;          // ...and a real hit
export const CRASH_WINDOW = 25; // two real hits inside this many seconds is « again »
export const SLIP = 6;          // m/s sideways, above 30 km/h, is a spin
export const SLIP_T = 0.45;
export const BRAKE_G = 9;       // m/s² off the brakes from speed
export const BRAKE_KMH = 45;
export const KERB_AIR = [0.22, 0.85];  // seconds of air that is a kerb, not a jump
export const SLOW_KMH = 22;
export const SLOW_T = 30;
export const LONG_JOB = 260;    // seconds, or 1.75x your own record

/**
 * Who is entitled to talk to you right now: the friends aboard, plus whoever's
 * job this is. Names, not keys — support.json is written in names.
 */
export function whoIsWithYou(G, out = [], def = null) {
  out.length = 0;
  const m = G && G.mission;
  // Aboard. riders() gives CAST keys ('sayyad'), which are the names lowercased.
  for (const key of riders(G)) {
    if (!key) continue;
    const name = VOICES.find((n) => n.toLowerCase() === String(key).toLowerCase());
    if (name && out.indexOf(name) < 0) out.push(name);
  }
  // Whose errand this is. story.js already names them at both ends of the job,
  // which is a better answer than the giver PLACE key: « Chelsea » is Adam's,
  // and no table maps the marina onto Adam.
  // `def` is for the two moments the job is over and G.mission has already been
  // cleared: the giver is still the person you just let down or kept waiting.
  const id = def ? def.id : (m && m.def && m.def.id);
  const f = id ? FRIEND_LINES[id] : null;
  if (f) {
    for (const [who] of [...(f.start || []), ...(f.end || [])]) {
      if (VOICES.indexOf(who) >= 0 && out.indexOf(who) < 0) out.push(who);
    }
  }
  return out;
}

/** One of them, rotating, so the same voice does not carry a whole job. */
function pick(list, n) {
  if (!list.length) return null;
  return list[((n % list.length) + list.length) % list.length];
}

/**
 * The detector state. One per game; reset() on a new drive so a fresh summer
 * does not inherit the last one's damage reading.
 */
export class Support {
  constructor() {
    this.reset();
  }

  reset() {
    this.dmg = 0;
    this.props = 0;
    this.lastBumpAt = -1e9;
    this.t = 0;
    this.slipT = 0;
    this.slowT = 0;
    this.turn = 0;          // rotates the speaker
    this.wasAir = false;
    this.lastSpeed = 0;
    this.mission = null;
    this.people = [];
  }

  /** Say one, from whoever is entitled to. Returns the line or null. */
  speak(G, heckle, situation) {
    if (!heckle || !heckle.support) return null;
    const who = pick(this.people, this.turn);
    if (!who) return null;
    const line = heckle.support(who, situation);
    if (line) this.turn++;
    return line;
  }

  /**
   * One tick. `v` is the player's vehicle. Cheap: no allocation, one array
   * reused, and every branch is a comparison.
   */
  update(dt, G, v, heckle) {
    const d = Number.isFinite(dt) ? dt : 0;
    this.t += d;
    if (!G || !v) return;
    if (G.mission !== this.mission) { this.mission = G.mission; this.slowT = 0; }
    whoIsWithYou(G, this.people);
    const kmh = v.speedKmh || 0;

    // ---- damage: a scrape, or the second real hit in half a minute
    const dmg = v.damage || 0;
    if (dmg > this.dmg + 0.01) {
      const jump = dmg - this.dmg;
      this.dmg = dmg;
      if (jump >= BUMP) {
        const again = this.t - this.lastBumpAt < CRASH_WINDOW;
        this.lastBumpAt = this.t;
        if (this.people.length) this.speak(G, heckle, again ? 'crashing_repeatedly' : 'general_failure');
      } else if (jump >= SCRATCH) {
        if (this.people.length) this.speak(G, heckle, 'scratched_paint');
      }
    } else if (dmg < this.dmg) this.dmg = dmg;   // a repair

    // ---- something knocked over. G.stats keeps the count; we watch it rise.
    const smashed = (G.stats && G.stats.propsSmashed) || 0;
    if (smashed > this.props) {
      this.props = smashed;
      if (this.people.length) this.speak(G, heckle, 'hitting_props');
    } else this.props = smashed;

    // ---- sideways, at speed, for long enough that it was not a lane change
    this.slipT = (Math.abs(v.vLat || 0) > SLIP && kmh > 30) ? this.slipT + d : 0;
    if (this.slipT > SLIP_T) {
      this.slipT = 0;
      if (this.people.length) this.speak(G, heckle, 'spinning_out');
    }

    // ---- standing on the brakes from a real speed
    if (this.lastSpeed > BRAKE_KMH && d > 0) {
      const decel = ((this.lastSpeed - kmh) / 3.6) / d;
      if (decel > BRAKE_G && this.people.length) this.speak(G, heckle, 'rough_braking');
    }
    this.lastSpeed = kmh;

    // ---- a kerb is a quarter-second of air. A jump is not a kerb.
    const air = !!v.inAir;
    if (this.wasAir && !air) {
      const t = v.lastAir || 0;
      if (t >= KERB_AIR[0] && t <= KERB_AIR[1] && this.people.length) {
        this.speak(G, heckle, 'curb_hop');
      }
    }
    this.wasAir = air;

    // ---- half a minute at walking pace, mid-errand, with somebody waiting
    if (G.mission) {
      this.slowT = kmh < SLOW_KMH ? this.slowT + d : 0;
      if (this.slowT > SLOW_T) {
        this.slowT = 0;
        if (this.people.length) this.speak(G, heckle, 'slow_driving');
      }
    }
  }

  /** The job just ended well. `best` is the previous record, if there was one. */
  finished(G, heckle, elapsed, best, def = null) {
    whoIsWithYou(G, this.people, def);
    if (!this.people.length) return null;
    const slow = best != null ? elapsed > best * 1.75 : elapsed > LONG_JOB;
    if (!slow) return null;
    return this.speak(G, heckle, 'delivery_took_too_long');
  }

  /** ...or it did not. */
  failed(G, heckle, def = null) {
    whoIsWithYou(G, this.people, def);
    if (!this.people.length) return null;
    return this.speak(G, heckle, 'job_failed');
  }
}

export const support = new Support();
export default support;
