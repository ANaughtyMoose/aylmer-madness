// « Le cart du Club » — the one job the golf cart exists for.
//
// The kid in the pro shop says the members' carts keep walking off. You take
// one down to Plage des Cèdres and bring it back before the marshal finishes
// his round, and he gives you twenty-five piastres for not asking questions.
//
// The only new machinery here is the swap: if you drive up in a car, the job
// puts you in the cart the same way the E-prompt does (main.js's swapCar, hung
// on G as G.swapCar), and the car you arrived in stays parked exactly where you
// left it — the same "borrow it, put it back" contract racejobs.js has with the
// friends' cars via G.raceParked. `cleanup` runs on success, on failure and on
// Backspace, so there is no way out of this job that leaves you stranded at the
// clubhouse in somebody else's cart.
//
// ---------------------------------------------------------------------------
// MEASURED, AND IT DOES NOT FIT THE BRIEF. The brief asked for Plage des Cèdres
// and a generous six-minute timer. Over the real road graph (tools/timers.mjs's
// Nav) the clubhouse-to-beach leg is 5 154 m: 773 s at the cart's 24 km/h flat
// out, nearer 1 100 s driven. Six minutes is not generous, it is impossible, so
// the timer below is the measured generous number instead — see docs/PLAYTEST.md,
// which asks for a decision. Flip DROP to a place nearer the golf course and
// BACK_TIME to 360 and this becomes the six-minute job the brief describes.
// ---------------------------------------------------------------------------
import { PLACES } from './places.js';
import { apronSpot } from './save.js';

const DROP = 'beach';        // where the cart "keeps disappearing" to
const BACK_TIME = 1200;      // seconds to get it back; measured, not guessed
const PAY = 25;

// Close enough to the clubhouse that handing the cart back makes sense.
const NEAR_CLUB = 80;

const inTheCart = (G) => G.carId === 'cart' && !!G.veh && G.veh.spec.id === 'cart';
const wrongCar = (G) => (inTheCart(G) ? null
  : 'Le marshal compte les carts, pas les chars. Va rechercher le cart.');

// Take one off the apron. `m.cameIn` is the car you arrived in; swapCar has
// already parked it where you were standing, which is the clubhouse.
function takeTheCart(G, m) {
  if (!G.veh || G.veh.spec.id === 'cart') return;
  if (!G.swapCar || !G.parked || !G.parked.cart) return;
  m.cameIn = G.veh.spec.id;
  G.swapCar('cart');
}

// Give it back. Only when you are actually at the golf course: bailing out at
// the beach leaves you in the cart with your own car waiting at the clubhouse,
// which is the same deal as any friend's car and a lot kinder than a teleport.
function giveItBack(G, m) {
  const id = m && m.cameIn;
  if (!id || !G.veh || G.veh.spec.id !== 'cart') return;
  if (!G.swapCar || !G.parked || !G.parked[id]) return;
  const p = PLACES.golf;
  if (Math.hypot(G.veh.x - p.x, G.veh.z - p.z) > NEAR_CLUB) return;
  m.cameIn = null;
  G.swapCar(id);
  // swapCar leaves the cart wherever you stepped out of it, which after this
  // job is on top of the job marker. Put it back on the apron with the others —
  // that is the whole errand.
  if (G.parked.cart && PLACES.golf) Object.assign(G.parked.cart, apronSpot(PLACES.golf));
}

export const golfjob = {
  id: 'golfcart',
  title: 'Le cart du Club',
  brief: 'Le kid du pro shop dit que les carts des membres arrêtent pas de disparaître.',
  giver: 'golf',
  timeOfDay: 'day',

  cleanup(G, m) { giveItBack(G, m); },

  build(ctx) {
    const stages = [];

    // ---- a. one cart, off the apron -----------------------------------
    // Skipped entirely if you turned up in the cart already — you can take it
    // with E like any friend's car, and then this stage has nothing to do.
    if (ctx.carId !== 'cart') {
      stages.push({
        kind: 'take',
        text: 'Prends un cart — Club de Golf Gatineau',
        sub: 'Ils sont alignés devant le chalet. Le kid regarde ailleurs exprès.',
        at: (G) => (G.parked && G.parked.cart) || PLACES.golf,
        radius: 10, stopped: 6, hold: true,
        holdText: 'E — embarquer dans le cart',
        toast: 'Le cart est à toi. Ton char reste au chalet.',
        onExit(G, m) { takeTheCart(G, m); },
      });
    }

    // ---- b. down to the beach ------------------------------------------
    stages.push({
      kind: 'run',
      text: 'Plage des Cèdres',
      sub: 'Coupe par les sentiers pis le gazon — le cart est fait pour ça, pas pour l’asphalte.',
      at: DROP, radius: 20,
      condition: (G) => inTheCart(G),
      prompt: (G) => wrongCar(G),
      toast: 'Le cart est sur le sable. C’est là qu’ils finissent tous, faut croire.',
    });

    // ---- c. and back before the marshal --------------------------------
    stages.push({
      kind: 'back',
      text: 'Ramène-le au Club',
      sub: 'Avant que le marshal finisse son tour du stationnement.',
      at: 'golf', radius: 18, time: BACK_TIME,
      condition: (G) => inTheCart(G),
      prompt: (G) => wrongCar(G),
      failWhy: 'Le marshal t’a vu.',
      toast: `Le cart est replacé, la clé est dessus.\nLe kid te donne ${PAY} $ pis dit rien.`,
      money: PAY,
    });

    return stages;
  },
};

export const GOLF_MISSIONS = [golfjob];
