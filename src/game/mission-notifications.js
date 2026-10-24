// Presentation only. Read the active definition on every call so suppression
// cannot survive mission completion, failure, abandonment or a vehicle swap.
// Mission dialogue, physics, records and payouts never pass through this gate.
export const QUIET_GOLF_NOTIFICATIONS = Object.freeze({
  stunt: false,
  jumpDamage: false,
});

export function missionNotificationAllowed(G, kind) {
  return G?.mission?.def?.notificationPolicy?.[kind] !== false;
}

// S3-CRASH: for the crash show (slow-mo and side cam) and about a second after
// it, the screen belongs to the crash: no repair banner or hint, and the truck
// rearing up off the wall is not a jump (no airtime readout, board, pay or
// count). main.js startCrashCam sets G.crashQuietUntil (performance.now ms).
// A repair hint held back here is not consumed; it shows once the quiet ends.
export function crashShowQuiet(G) {
  return !!(G && G.crashQuietUntil && G.crashQuietUntil > (typeof performance !== 'undefined' ? performance.now() : Date.now()));
}

// driveHooks runs before the golf stage refunds landing damage. Do not call
// repairHint on this tick: consuming its once-only flags would also swallow a
// later legitimate repair warning. Other damage and later ticks remain audible.
export function landingRepairHintMuted(G, vehicle = G?.veh) {
  return !!(vehicle?.landed > 0 && !missionNotificationAllowed(G, 'jumpDamage'));
}
