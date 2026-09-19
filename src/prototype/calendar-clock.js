// The prototype calendar is driven by elapsed game time, never by job rewards.
export function advanceSummerClock(G, dt, cycle = 600, minutes = 24, rate = 1, lastDay = 72) {
 const delta = Math.max(0, Number.isFinite(dt) ? dt : 0) * cycle / (Math.max(1,minutes)*60) * Math.max(0,rate);
 const total = G.dayClock + delta;
 const midnights = Math.floor(total / cycle);
 G.dayClock = total % cycle;
 const end = !G.summerOver && Math.floor(G.day) + midnights > lastDay;
 G.day = Math.min(lastDay,Math.floor(G.day) + midnights);
 return {midnights, end};
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
