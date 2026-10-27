import { RECORDINGS, STATIONS } from '../game/radio-library.js';
import { readLibrary, writeLibrary } from '../game/radio-storage.js';
export function audioFiles(files) { return Array.from(files).filter(f => /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name)); }
const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
const time = n => `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;

export async function mountLocalRadio(panel, radio) {
  if (!radio.recorded) return;
  let rows = [], urls = new Map(), local = [], saving = Promise.resolve();
  const section = document.createElement('details'); section.id = 'recorded-radio-panel';
  section.append(text('summary', 'Radio · R marche/arrêt · Shift+R station'));
  const body = document.createElement('div'); body.className = 'recorded-radio-body'; section.append(body);
  const controls = document.createElement('div'); controls.className = 'row';
  const power = text('button', 'Allumer'), next = text('button', 'Station suivante');
  power.type = next.type = 'button'; controls.append(power, next); body.append(controls);
  const label = text('label', 'Station '), select = document.createElement('select'); select.setAttribute('aria-label', 'Station radio'); label.append(select); body.append(label);
  const status = text('output', 'Chargement de la bibliothèque…'); status.setAttribute('aria-live', 'polite'); body.append(status);
  const now = text('output', ''); body.append(now);
  const hint = text('p', 'Chaque station joue ses enregistrements en boucle. La lecture reprend en quittant la pause. Volume : onglet Options → Radio.'); body.append(hint);
  const seekLabel = text('label', 'Position dans l’enregistrement '), seek = document.createElement('input');
  seek.type = 'range'; seek.min = 0; seek.max = 1; seek.step = 1; seek.setAttribute('aria-label', 'Position radio'); seekLabel.append(seek); body.append(seekLabel);
  const speechLabel = text('label', ' Parole plus claire'), speech = document.createElement('input'); speech.type = 'checkbox'; speech.checked = radio.speechFriendly; speechLabel.prepend(speech); body.append(speechLabel);
  const library = document.createElement('details'); library.append(text('summary', 'Bibliothèque et stations optionnelles'));
  library.append(text('p', 'Import local : les fichiers restent dans ce navigateur. Une sauvegarde du jeu ou un export de liste ne contient pas les MP3.'));
  const inputLabel = text('label', 'Ajouter ou remplacer des enregistrements '), input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = 'audio/*,.mp3,.m4a,.ogg,.wav,.flac'; inputLabel.append(input); library.append(inputLabel);
  const availability = document.createElement('div'); library.append(availability);
  const imports = document.createElement('div'); library.append(imports);
  const exportButton = text('button', 'Exporter la liste (sans audio)'); exportButton.type = 'button'; library.append(exportButton);
  body.append(library);
  document.querySelector('#pause .panel').append(section);
  const entry = text('button', 'Radio / bibliothèque'); entry.type = 'button';
  entry.onclick = () => { window.AYLMER.pause(true); section.open = true; section.scrollIntoView({ block: 'nearest' }); };
  panel.querySelector('.visual-body').append(entry);
  const style = document.createElement('style'); style.textContent = `#recorded-radio-panel{margin:12px 0;padding:10px;border:1px solid #68717a;border-radius:8px}#recorded-radio-panel summary{cursor:pointer}#recorded-radio-panel .recorded-radio-body{max-height:40vh;overflow:auto;padding:8px}#recorded-radio-panel label,#recorded-radio-panel output{display:block;margin:8px 0}#recorded-radio-panel select{max-width:100%}#recorded-radio-panel p{font-size:13px;line-height:1.4}#recorded-radio-panel input[type=file]{max-width:100%}`; document.head.append(style);
  power.onclick = () => { radio.power(!radio.wantOn || !!radio.playbackError); };
  next.onclick = () => radio.nextStation(); select.onchange = () => radio.tune(select.value);
  speech.onchange = () => radio.setSpeechFriendly(speech.checked);
  seek.onchange = () => radio.seek(+seek.value);
  function refresh() {
    const state = radio.state();
    const ids = radio.available().map(s => s.id).join(',');
    if (select.dataset.ids !== ids) {
      select.replaceChildren(...radio.available().map(s => { const opt = text('option', s.name); opt.value = s.id; return opt; })); select.dataset.ids = ids;
    }
    select.value = state.stationId; select.disabled = next.disabled = !radio.count;
    power.textContent = state.wantOn && !state.error ? 'Éteindre' : 'Allumer';
    status.textContent = state.error || radio.storageError || state.notice || `${radio.count} stations disponibles · ${state.wantOn ? state.suspended ? 'en pause' : state.on ? 'lecture' : 'chargement' : 'radio éteinte'}`;
    now.textContent = `${state.stationName} · ${state.track} · ${time(state.position)} / ${time(state.duration)}`;
    if (document.activeElement !== seek) { seek.max = Math.max(1, state.duration || 1); seek.value = state.position || 0; }
    seek.disabled = !radio.current();
  }
  function describeLibrary() {
    availability.replaceChildren(); imports.replaceChildren();
    for (const station of STATIONS) {
      const count = radio.tracks(station.id).length;
      const row = text('label', ` ${station.name} : ${count} fichier${count === 1 ? '' : 's'}`), check = document.createElement('input');
      check.type = 'checkbox'; check.checked = radio.enabled[station.id];
      check.onchange = () => radio.setEnabled(station.id, check.checked); row.prepend(check); availability.append(row);
    }
    for (const row of rows) {
      const line = document.createElement('div'); line.append(text('p', row.file.name));
      const assign = document.createElement('select'); assign.setAttribute('aria-label', `Station pour ${row.file.name}`);
      const none = text('option', 'Non assigné'); none.value = ''; assign.append(none);
      for (const s of STATIONS) { const o = text('option', s.name); o.value = s.id; assign.append(o); }
      assign.value = row.stationId || '';
      assign.onchange = () => { row.stationId = assign.value || null; install(); save(); };
      const remove = text('button', 'Retirer de la bibliothèque'); remove.type = 'button';
      remove.onclick = () => { rows = rows.filter(r => r !== row); radio.removeSource(row.id); install(); save(); };
      line.append(assign, remove); imports.append(line);
    }
    if (local.length) imports.append(text('p', `${local.length} fichiers reliés au serveur local. Les originaux ne sont pas copiés dans le projet.`));
    refresh();
  }
  function install() {
    // Dispose media before revoking URLs. Keep cached blob URLs until replaced.
    radio.stopNow();
    const keep = new Set(rows.map(r => r.id));
    for (const [id, entry] of urls) if (!keep.has(id) || rows.find(r => r.id === id)?.file !== entry.file) {
      URL.revokeObjectURL(entry.url); urls.delete(id); radio.sources.delete(id);
    }
    const sources = local.map(r => ({ id: r.id, url: r.url, recording: r.recording }));
    for (const row of rows) {
      if (!urls.has(row.id)) urls.set(row.id, { file: row.file, url: URL.createObjectURL(row.file) });
      const known = RECORDINGS.find(r => r.id === row.id);
      sources.push({ id: row.id, url: urls.get(row.id).url, recording: { ...known, id: row.id, title: known?.title || row.file.name.replace(/\.[^.]+$/, ''), filename: row.file.name, stationId: row.stationId, gainDb: known?.gainDb || 0 } });
    }
    radio.addSources(sources); describeLibrary();
  }
  function save() {
    const snapshot = rows.map(r => ({ ...r }));
    saving = saving.then(() => writeLibrary(snapshot)).then(() => { radio.storageError = ''; refresh(); }).catch(() => { radio.storageError = 'Stockage indisponible ou plein; réimporte ces fichiers à la prochaine session.'; refresh(); });
  }
  input.onchange = () => {
    for (const file of audioFiles(input.files)) {
      const known = RECORDINGS.find(r => r.filename === file.name);
      const id = known?.id || `personal-${file.name}-${file.size}-${file.lastModified}`;
      const row = { id, file, stationId: known ? known.stationId : 'personal-cassette' };
      const idx = rows.findIndex(r => r.id === id); if (idx < 0) rows.push(row); else rows[idx] = row;
    }
    install(); save(); input.value = '';
  };
  exportButton.onclick = () => {
    const manifest = { version: 1, audioIncluded: false, stations: STATIONS.map(s => ({ ...s, enabled: radio.enabled[s.id] })), recordings: [...radio.recordings.values()].filter(r => radio.sources.has(r.id)) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'aylmer-radio-library.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  radio.subscribe(refresh);
  setInterval(() => { if (section.open) refresh(); }, 500);
  window.addEventListener('pagehide', () => radio.persist());
  document.addEventListener('visibilitychange', () => radio.setHidden(document.hidden));
  try { rows = await readLibrary(); } catch { radio.storageError = 'Stockage local indisponible; lecture possible pour cette session.'; }
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    try { const res = await fetch('/__local_radio/library.json'); if (res.ok) local = (await res.json()).recordings || []; } catch { /* optional loopback library */ }
  }
  install(); radio.libraryReady = true; return radio;
}
