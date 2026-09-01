// A real gearbox, so the engine note climbs and drops the way a car does.
//
// rpm is not a function of "how fast are you going as a fraction of top speed";
// it is a function of road speed, the gear you are in, the final drive and the
// rolling circumference of the tyre:
//
//     wheel rev/s = v / (π · tyre diameter)
//     engine rpm  = wheel rev/s · final · gear · 60
//
// The Ranger's five-speed (an M5OD behind the 2.3 four) is
// 3.97 / 2.14 / 1.42 / 1.00 / 0.85 on a 3.73 final with 27" tyres, which is why
// it drones at 2000 rpm in third at fifty, why fifth is useless below eighty,
// and why 150 km/h is 4400 rpm in fifth with nothing left.
//
// Everything here is pure arithmetic — no DOM, no audio — so tools/smoke_audio
// can run the same box in node that the game runs in the browser.

export const DEFAULT_DRIVE = {
  gears: [3.97, 2.14, 1.42, 1.00, 0.85],
  reverse: 3.99,
  final: 3.73,
  tyre: 0.6858,          // rolling diameter, metres (27")
  idle: 800,             // a 2.3 Lima loping over, not a smooth six
  redline: 5200,
  limiter: 5200,
  shiftUp: 4800,         // wide open
  shiftUpLight: 3000,    // off the throttle
  shiftDown: 1600,
  launch: 2100,          // where the clutch is slipped away from a stop
  shiftTime: 0.25,       // the clutch dip, seconds
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Gearbox {
  constructor(drive) {
    this.d = Object.assign({}, DEFAULT_DRIVE, drive || {});
    this.reset();
  }

  reset() {
    this.gear = 1;
    this.rpm = this.d.idle;
    this.clutch = 1;
    this.shiftT = 0;
    this.fromRpm = this.d.idle;
    this.toGear = 1;
    this.limiting = false;
    this.shifts = 0;
  }

  get top() { return this.d.gears.length; }

  // Engine rpm the driveshaft demands at this road speed in this gear.
  rpmAt(kmh, gear) {
    const d = this.d;
    const ratio = gear === 0 ? d.reverse : d.gears[clamp(gear, 1, d.gears.length) - 1];
    const revPerSec = Math.abs(kmh) / 3.6 / (Math.PI * d.tyre);
    return revPerSec * ratio * d.final * 60;
  }

  // Road speed at which `gear` sits at `rpm` — the audition programme's inverse.
  kmhAt(rpm, gear) {
    const d = this.d;
    const ratio = gear === 0 ? d.reverse : d.gears[clamp(gear, 1, d.gears.length) - 1];
    return (rpm / 60 / (ratio * d.final)) * (Math.PI * d.tyre) * 3.6;
  }

  /**
   * One step. `kmh` is road speed, `throttle` the pedal 0..1, `reversing` the
   * car's own idea of which way it is going. Leaves `rpm`, `gear`, `clutch`
   * (0..1, dipping to 0 mid-shift) and `limiting` on `this`.
   */
  update(dt, kmh, throttle, reversing = false) {
    const d = this.d;
    throttle = clamp(throttle, 0, 1);

    // Reverse is a real gear, not a special case: the ratio is the one off the
    // sheet (numerically the tallest in the box, which is why backing up whines)
    // and it slips off the clutch from a standstill exactly like first does. The
    // caller passes the pedal that is actually driving — S, when you are in R.
    if (reversing) {
      this.gear = 0; this.shiftT = 0;
      const road = this.rpmAt(kmh, 0);
      const launch = d.idle + throttle * (d.launch - d.idle);
      let rpm = road;
      this.clutch = 1;
      if (road < launch) {
        const slip = clamp(road / Math.max(1, launch), 0, 1);
        rpm = launch + (road - launch) * slip;
        this.clutch = 0.45 + 0.55 * slip;
      }
      this.rpm = Math.max(d.idle, Math.min(d.limiter, rpm));
      this.limiting = this.rpm >= d.limiter;
      return this;
    }
    if (this.gear === 0) this.gear = 1;

    // Mid-shift: the clutch is out, the engine is falling to the new gear.
    if (this.shiftT > 0) {
      this.shiftT -= dt;
      const s = clamp(1 - this.shiftT / d.shiftTime, 0, 1);
      // Where the revs are falling to. Clamped at the limiter, like the
      // steady-state case below: with real top speeds a box that finds itself
      // in second at 150 km/h would otherwise interpolate toward the 9000 rpm
      // the driveshaft is asking for and hand it to the synth. Nothing else on
      // this path caps it.
      const target = clamp(this.rpmAt(kmh, this.toGear), d.idle, d.limiter);
      // A dip in the middle: no drive, so the revs sag past where they land.
      this.rpm = Math.min(d.limiter,
        (this.fromRpm + (target - this.fromRpm) * s) * (1 - 0.14 * Math.sin(Math.PI * s)));
      this.clutch = 1 - Math.sin(Math.PI * s);
      if (this.shiftT <= 0) { this.shiftT = 0; this.gear = this.toGear; this.clutch = 1; }
      this.limiting = false;
      return this;
    }

    this.clutch = 1;
    let rpm = this.rpmAt(kmh, this.gear);

    // First gear from a standstill: the clutch is slipped, so the engine sits
    // wherever your right foot puts it until the road catches up.
    if (this.gear === 1) {
      const launch = d.idle + throttle * (d.launch - d.idle);
      if (rpm < launch) {
        const slip = clamp(rpm / Math.max(1, launch), 0, 1);
        rpm = launch + (rpm - launch) * slip;
        this.clutch = 0.45 + 0.55 * slip;
      }
    }
    rpm = Math.max(d.idle, rpm);

    this.limiting = rpm >= d.limiter;
    this.rpm = Math.min(rpm, d.limiter);

    // Shift points: hard at 4800, lazy at 3000 when you are just rolling along.
    const up = throttle > 0.55 ? d.shiftUp : d.shiftUpLight;
    if (this.gear < this.top && rpm > up && kmh > 4) this.shiftTo(this.gear + 1);
    else if (this.gear > 1 && rpm < d.shiftDown) this.shiftTo(this.gear - 1);
    return this;
  }

  shiftTo(gear) {
    if (gear === this.gear || this.shiftT > 0) return;
    this.fromRpm = this.rpm;
    this.toGear = clamp(gear, 1, this.top);
    this.shiftT = this.d.shiftTime;
    this.shifts++;
  }
}
