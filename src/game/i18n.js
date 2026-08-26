// UI chrome strings only — menus, pause, HUD labels, the key legend, settings.
// Mission text, place names and toasts stay French: this is a game about Aylmer.
//
// French is the base dictionary. English is an overlay: a missing English key
// falls back to French rather than showing the raw key, so a half-translated
// build is still readable.

const FR = {
  // menu
  'menu.tag': 'Aylmer, Québec · été ’99 · t’as ton permis pis un demi-réservoir',
  'menu.assist': 'Aides à la conduite (plus facile)',
  'menu.audio': 'Son',
  'menu.graphics': 'Graphiques',
  'menu.q.low': 'Basse (batterie)',
  'menu.q.med': 'Moyenne',
  'menu.q.high': 'Haute',
  'menu.lang': 'Langue',
  'menu.drive': 'EMBARQUE',
  'menu.building': 'ON BÂTIT AYLMER…',
  'menu.seats': 'places',

  // loading
  'load.title': 'ON BÂTIT AYLMER',
  'load.world': 'Rues, maisons, rivière, arbres…',
  'load.roads': 'Rues…',
  'load.houses': 'Maisons…',
  'load.river': 'Rivière…',
  'load.trees': 'Arbres…',
  'load.places': 'Les spots…',
  'load.gps': 'GPS…',
  'load.map': 'Carte de la ville…',
  'load.cars': 'Les chars…',
  'load.ready': 'Prêt.',

  // hud
  'hud.kmh': 'km/h',
  'hud.freeroam': 'Free roam',
  'hud.freeroam.sub': 'Roule jusqu’à un marqueur jaune pour une job',
  'hud.freeroam.again': 'Retourne au marqueur pour ré-essayer',
  'hud.freeroam.next': 'Trouve un autre marqueur jaune',
  'hud.gear': 'Vitesse',

  // pause
  'pause.title': 'Pause',
  'pause.tab.jobs': 'Jobs',
  'pause.tab.keys': 'Touches',
  'pause.tab.set': 'Réglages',
  'pause.resume': 'Continuer',
  'pause.map': 'Carte',
  'pause.menu': 'Menu',
  'pause.wipe': 'Effacer la progression',
  'pause.start': 'départ',
  'pause.clickjob': 'Clique une job pour mettre un waypoint sur son départ.',

  // settings
  'set.lang': 'Langue',
  'set.lookback': 'Regard arrière: bascule (au lieu de tenir Shift)',
  'set.steer': 'Sensibilité du volant',
  'set.fov': 'Champ de vision',
  'set.assist': 'Aides à la conduite',
  'set.audio': 'Son',
  'set.saved': 'Réglages sauvegardés',

  // legend / controls
  'k.title': 'Touches',
  'k.hide': '? cacher',
  'k.show': '? touches',
  'k.drive': 'Gaz / frein',
  'k.steer': 'Volant',
  'k.handbrake': 'Frein à main',
  'k.look': 'Regarder derrière',
  'k.cam': 'Caméra',
  'k.map': 'Carte de la ville',
  'k.mapsize': 'Taille du minimap',
  'k.mapzoom': 'Zoom du minimap',
  'k.take': 'Prendre une job / un char',
  'k.cycle': 'Autre job',
  'k.abandon': 'Abandonner la job',
  'k.recover': 'Remettre sur la route',
  'k.horn': 'Klaxon',
  'k.mute': 'Son on/off',
  'k.pause': 'Pause',
  'k.legend': 'Cacher / montrer les touches',
  'k.pad': 'Manette: stick gauche = volant, gâchettes = gaz/frein, A = frein à main.',

  // tutorial
  'tut.go': 'W pour avancer',
  'tut.steer': 'A pis D pour tourner',
  'tut.brake': 'S pour freiner (tiens-le à l’arrêt pour reculer)',
  'tut.hand': 'Espace — le frein à main, c’est comme ça que le cul sort',
  'tut.map': 'Tab pour la carte de la ville',
  'tut.job': 'E sur un marqueur jaune pour une job',
  'tut.done': 'C’est beau. Bonne route.',

  // intro card
  'intro.brief': 'La job',
  'intro.time': 'Temps',
  'intro.route': 'Le chemin',
  'intro.notime': 'pas de chrono',
  'intro.go': 'GO',

  // misc
  'toast.mute.on': 'Son ON',
  'toast.mute.off': 'Son OFF',
  'toast.mapsize': 'Minimap',
  'map.small': 'petit',
  'map.large': 'grand',
};

const EN = {
  'menu.tag': 'Aylmer, Québec · summer ’99 · you have a licence and half a tank',
  'menu.assist': 'Driving assists (easier)',
  'menu.audio': 'Sound',
  'menu.graphics': 'Graphics',
  'menu.q.low': 'Low (max battery)',
  'menu.q.med': 'Medium',
  'menu.q.high': 'High',
  'menu.lang': 'Language',
  'menu.drive': 'DRIVE',
  'menu.building': 'BUILDING AYLMER…',
  'menu.seats': 'seats',

  'load.title': 'BUILDING AYLMER',
  'load.world': 'Streets, houses, river, trees…',
  'load.roads': 'Streets…',
  'load.houses': 'Houses…',
  'load.river': 'River…',
  'load.trees': 'Trees…',
  'load.places': 'Places…',
  'load.gps': 'GPS…',
  'load.map': 'Town map…',
  'load.cars': 'Cars…',
  'load.ready': 'Ready.',

  'hud.freeroam': 'Free roam',
  'hud.freeroam.sub': 'Drive to a yellow marker to pick up a job',
  'hud.freeroam.again': 'Go back to the marker to try again',
  'hud.freeroam.next': 'Find another yellow marker',
  'hud.gear': 'Gear',

  'pause.title': 'Paused',
  'pause.tab.jobs': 'Jobs',
  'pause.tab.keys': 'Controls',
  'pause.tab.set': 'Settings',
  'pause.resume': 'Resume',
  'pause.map': 'Map',
  'pause.menu': 'Menu',
  'pause.wipe': 'Wipe progress',
  'pause.start': 'from',
  'pause.clickjob': 'Click a job to drop a waypoint on where it starts.',

  'set.lang': 'Language',
  'set.lookback': 'Look back: toggle (instead of holding Shift)',
  'set.steer': 'Steering sensitivity',
  'set.fov': 'Field of view',
  'set.assist': 'Driving assists',
  'set.audio': 'Sound',
  'set.saved': 'Settings saved',

  'k.title': 'Controls',
  'k.hide': '? hide',
  'k.show': '? keys',
  'k.drive': 'Throttle / brake',
  'k.steer': 'Steer',
  'k.handbrake': 'Handbrake',
  'k.look': 'Look behind',
  'k.cam': 'Camera',
  'k.map': 'Town map',
  'k.mapsize': 'Minimap size',
  'k.mapzoom': 'Minimap zoom',
  'k.take': 'Take a job / a car',
  'k.cycle': 'Other job',
  'k.abandon': 'Abandon the job',
  'k.recover': 'Put the car back on the road',
  'k.horn': 'Horn',
  'k.mute': 'Sound on/off',
  'k.pause': 'Pause',
  'k.legend': 'Hide / show the keys',
  'k.pad': 'Gamepad: left stick steers, triggers are throttle and brake, A is the handbrake.',

  'tut.go': 'W to go',
  'tut.steer': 'A and D to steer',
  'tut.brake': 'S to brake (hold it at a stop to reverse)',
  'tut.hand': 'Space — the handbrake, this is how you get the back end out',
  'tut.map': 'Tab for the town map',
  'tut.job': 'E on a yellow marker to take a job',
  'tut.done': 'You’re set. Drive safe.',

  'intro.brief': 'The job',
  'intro.time': 'Time',
  'intro.route': 'The route',
  'intro.notime': 'no clock',

  'toast.mute.on': 'Sound ON',
  'toast.mute.off': 'Sound OFF',
  'toast.mapsize': 'Minimap',
  'map.small': 'small',
  'map.large': 'large',
};

const DICTS = { fr: FR, en: EN };

let lang = 'fr';

export function setLang(next) {
  lang = DICTS[next] ? next : 'fr';
  return lang;
}
export function getLang() { return lang; }
export function languages() { return [['fr', 'Français'], ['en', 'English']]; }

// English first when it has the key, French otherwise, the key itself last.
export function t(key) {
  const over = DICTS[lang];
  if (over && over !== FR && Object.prototype.hasOwnProperty.call(over, key)) return over[key];
  if (Object.prototype.hasOwnProperty.call(FR, key)) return FR[key];
  return key;
}

// Everything the legend, the pause Controls tab and the README agree on.
// `caps` are the keycaps drawn in the diagram; `code` are Input codes.
export const KEYMAP = [
  { caps: ['W', 'S'], alt: '↑ ↓', label: 'k.drive' },
  { caps: ['A', 'D'], alt: '← →', label: 'k.steer' },
  { caps: ['Espace'], label: 'k.handbrake' },
  { caps: ['Shift'], label: 'k.look' },
  { caps: ['C'], label: 'k.cam' },
  { caps: ['Tab'], label: 'k.map' },
  { caps: ['N'], label: 'k.mapsize' },
  { caps: ['+', '−'], label: 'k.mapzoom' },
  { caps: ['E'], alt: '⏎', label: 'k.take' },
  { caps: ['Q'], label: 'k.cycle' },
  { caps: ['⌫'], label: 'k.abandon' },
  { caps: ['R'], label: 'k.recover' },
  { caps: ['H'], label: 'k.horn' },
  { caps: ['0'], label: 'k.mute' },
  { caps: ['Esc'], label: 'k.pause' },
  { caps: ['?'], label: 'k.legend' },
];
