// The prototype calendar is driven by elapsed game time, never by job rewards.
// After the ending (G.summerOver) the clock still turns but no midnight is
// reported: the day stays on Labour Day and main.js used to toast « Fête du
// Travail » and autosave at every one of them, forever (progression review P10).
export function advanceSummerClock(G, dt, cycle = 600, minutes = 24, rate = 1, lastDay = 72) {
 const delta = Math.max(0, Number.isFinite(dt) ? dt : 0) * cycle / (Math.max(1,minutes)*60) * Math.max(0,rate);
 const total = G.dayClock + delta;
 const crossed = Math.floor(total / cycle);
 G.dayClock = total % cycle;
 if (G.summerOver) return {midnights: 0, end: false};
 const midnights = crossed;
 const end = Math.floor(G.day) + midnights > lastDay;
 G.day = Math.min(lastDay,Math.floor(G.day) + midnights);
 return {midnights, end};
}
// Move the clock FORWARD to the next time it reads `hour`, through midnight
// when it has to, and say how many midnights that was — the honest way to
// « attendre à ce soir » (review P1/P11). Never moves time backwards; the
// caller toasts the date and runs the ending exactly as for a natural midnight.
export function advanceTo(G, hour, cycle = 600, lastDay = 72) {
 const now = ((G.dayClock % cycle) + cycle) % cycle;
 const want = ((((hour / 24) % 1) + 1) % 1) * cycle;
 const delta = want > now ? want - now : cycle - now + want;
 return advanceSummerClock(G, delta, cycle, cycle / 60, 1, lastDay);
}
export function recordedWeather(info) {
 if (!info) return null;
 const sky = {clear:'clear',fair:'clear',cloudy:'cloudy',overcast:'overcast',showers:'rain',rain:'rain',thunderstorm:'storm',fog:'overcast'}[info.sky];
 return sky || (info.precipMm > 0 ? 'rain' : 'cloudy');
}
export function applyRecordedWeather(weather, info, date, instant = false) {
 if (!info) return false;
 const key=recordedWeather(info);
 const changed=weather.recordedDate!==date;
 weather.recordedDate=date;weather.historical=true;
 if(changed || instant) {
  if(instant)weather.set(key,true);else weather._begin(key);
 }
 return true;
}
