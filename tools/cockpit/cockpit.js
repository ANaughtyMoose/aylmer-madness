// Aylmer cockpit front end. Polls /api/all every 20 s and re-renders only the
// sections whose data changed, so the page never jumps under the reader. The
// decisions panel keeps whatever Tom is typing across refreshes.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const REFRESH_MS = 20000;
const STALE_MS = 65000;
let data = {};
let lastFetch = 0;
let fetchError = null;
const sig = {};

// ---------- time ----------
function ago(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtFull = (iso) => iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : '';
const fmtDay = (iso) => iso && Number.isFinite(Date.parse(iso)) ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) : '';
const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
const fmtNum = (n) => n == null || n === '' ? '?' : typeof n === 'number' ? (Number.isInteger(n) ? n.toLocaleString('en-CA') : n.toLocaleString('en-CA', { maximumFractionDigits: 1 })) : esc(n);
// Tiny inline markdown for decision context: `code`, **bold**.
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

// ---------- status vocab ----------
const ITEM = { done: ['ok', 'check', 'Done'], 'in-progress': ['go', 'dot', 'In progress'], blocked: ['bad', 'pause', 'Blocked'], todo: ['', 'clock', 'To do'] };
const PHASE = { done: ['ok', 'check', 'Done'], active: ['go', 'dot', 'Active'], next: ['', 'clock', 'Next'], later: ['', 'clock', 'Later'] };
const tag = ([cls, icon, word]) => `<span class="tag ${cls}">${ic(icon)}${word}</span>`;
const HEALTH_WORD = { green: 'On track', amber: 'Watch', red: 'Trouble', unknown: 'Unknown' };

// ---------- derived ----------
const rm = () => (data.roadmap && data.roadmap.data) || {};
const allItems = () => (rm().phases || []).flatMap((p) => (p.items || []).map((i) => ({ ...i, phase: p.title })));
const decisions = () => (Array.isArray(rm().decisions) ? rm().decisions : []).filter((d) => d && d.id);
const openDecisions = () => decisions().filter((d) => d.status === 'open').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
function overallHealth() {
  const r = rm();
  const t = data.tests && data.tests.latest;
  const streams = r.workstreams || [];
  const items = allItems();
  if ((t && !t.ok) || streams.some((s) => s.health === 'red')) return 'red';
  if (items.some((i) => i.status === 'blocked') || streams.some((s) => s.health === 'amber') || (r.qualityBars || []).some((q) => q.status === 'fail')) return 'amber';
  if (!streams.length && !t) return 'unknown';
  return 'green';
}

// ---------- header + hero ----------
function renderHeader() {
  const h = overallHealth();
  $('#health .lamp').dataset.h = h;
  $('#health-word').textContent = HEALTH_WORD[h];
  const t = data.tests && data.tests.latest;
  const why = [];
  if (t && !t.ok) why.push('tests failing');
  const red = (rm().workstreams || []).filter((s) => s.health === 'red').map((s) => s.label);
  if (red.length) why.push(`${red.join(', ')} marked red in the roadmap`);
  $('#health').title = why.length ? `Overall health: ${why.join('; ')}` : 'Overall health';
  const base = data.worktrees && data.worktrees.base;
  $('#base-sha').textContent = base ? base.sha : 'unknown';
  $('#base-sha').title = base ? `${base.ref}: ${base.subject} (${fmtFull(base.date)})` : '';
  $('#sample-badge').hidden = !(data.roadmap && data.roadmap.sample);
  const srv = (data.servers && data.servers.servers) || [];
  const play = srv.find((s) => s.role === 'play' && s.responding) || srv.find((s) => s.role === 'game' && s.responding);
  const pl = $('#ql-play');
  if (play && play.links[0]) { pl.href = play.links[0].url; pl.removeAttribute('aria-disabled'); pl.title = `Port ${play.port}, ${play.worktree || play.cwd}`; }
  else { pl.setAttribute('aria-disabled', 'true'); pl.title = 'No game server is answering'; }
  const L = data.look || {};
  for (const a of $$('.ql-compare')) {
    if (L.compareUrl) { a.href = L.compareUrl; a.removeAttribute('aria-disabled'); a.title = 'The comparison page, served by the cockpit with the main checkout\'s references'; }
    else if (data.look) { a.setAttribute('aria-disabled', 'true'); a.title = 'tools/aylmer-compare/index.html is not in this worktree or the main checkout'; }
  }
}
function tickClock() {
  const el = $('#refreshed');
  el.textContent = lastFetch ? ago(new Date(lastFetch).toISOString()).replace('just now', 'now') : '...';
  el.title = lastFetch ? fmtFull(new Date(lastFetch).toISOString()) : '';
  const stale = lastFetch && Date.now() - lastFetch > STALE_MS;
  el.classList.toggle('stale', !!stale);
  if (stale || (fetchError && !lastFetch)) { $('#health-word').textContent = 'Offline'; $('#health .lamp').dataset.h = 'unknown'; $('#health').title = `The cockpit server is not answering${fetchError ? ` (${fetchError})` : ''}. Showing the last data it sent.`; }
}

function renderHero() {
  const r = rm(), R = data.roadmap || {};
  $('#northstar').textContent = r.northStar || 'No north star written yet.';
  const note = $('#roadmap-note');
  if (R.sample || R.stale) {
    note.hidden = false;
    note.innerHTML = R.error ? esc(R.error) : `<code>docs/roadmap.json</code> is not there yet, so this is the sample fixture. The cockpit switches to the real file on the next refresh after it appears.`;
  } else { note.hidden = true; }
  const items = allItems();
  const active = (r.phases || []).find((p) => p.status === 'active');
  const prog = items.filter((i) => i.status === 'in-progress').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const tom = openDecisions().length;
  const t = data.tests && data.tests.latest;
  const done = items.filter((i) => i.status === 'done').length;
  const cells = [
    ['Overall', `${items.length ? Math.round((done / items.length) * 100) : 0}<small>%</small>`, '', '#where'],
    ['In progress', prog, prog ? 'warn' : '', '#now'],
    ['Blocked', blocked, blocked ? 'bad' : '', '#now'],
    ['For Tom', tom, tom ? 'warn' : '', '#decide'],
    ['Smoke', t ? `${t.passed}<small>/${t.total}</small>` : '<small>not run</small>', t ? (t.ok ? 'good' : 'bad') : '', '#quality'],
  ];
  $('#odometer').innerHTML = cells.map(([k, v, c, href]) => `<div class="${c}"><dt><a href="${href}">${k}</a></dt><dd>${v}</dd></div>`).join('');
  $('#where-meta').textContent = active ? `Active: ${active.title}` : '';
}

// ---------- 01 decide ----------
const drafts = new Map();        // `${id}:text` / `${id}:f:${field}` -> value Tom typed
const pending = new Set();       // decision ids with a POST in flight
const errors = new Map();        // id -> last error message
const CONF = { high: ['ok', 'check', 'High confidence'], medium: ['go', 'dot', 'Medium confidence'], low: ['bad', 'alert', 'Low confidence'] };
const waveTasks = () => (data.wave && data.wave.available && data.wave.tasks) || [];
const itemTitle = (id) => { const i = allItems().find((x) => x.id === id) || waveTasks().find((x) => x.id === id); return i ? i.title : null; };
const placeBySlug = (slug) => ((data.look && data.look.places) || []).find((p) => p.slug === slug);
const thumbUrl = (u, w) => u.replace(/^\/files\/places\//, '/thumb/places/') + '?w=' + w;
function evidenceUrl(e) {
  if (e.image && e.worktree) return { full: `/wtimg/${encodeURIComponent(e.worktree)}/${e.image.split('/').map(encodeURIComponent).join('/')}`, thumb: null };
  if (e.image && /^references\/places\//.test(e.image)) { const full = '/files/places/' + e.image.replace(/^references\/places\//, '').split('/').map(encodeURIComponent).join('/'); return { full, thumb: thumbUrl(full, 480) }; }
  return null;
}
function evidenceHtml(d) {
  const ev = Array.isArray(d.evidence) ? d.evidence : [];
  const imgs = [], links = [];
  for (const e of ev) {
    if (!e) continue;
    if (e.place) {
      const p = placeBySlug(e.place);
      const ps = p ? p.pairs.filter((x) => x.ref && x.game) : [];
      const pair = p && ((e.match && ps.find((x) => (x.ref + x.game).includes(e.match))) || ps[0] || p.pairs[0]);
      if (pair) {
        const when = pair.captured && Number.isFinite(Date.parse(pair.captured)) ? `Game, ${fmtDay(pair.captured)}` : 'Game';
        for (const [u, cap] of [[pair.ref, 'Reference'], [pair.game, when]]) if (u) imgs.push(`<button type="button" class="ev-img" data-full="${esc(u)}" data-cap="${esc(`${p.name}: ${cap}`)}"><img src="${esc(thumbUrl(u, 480))}" alt="${esc(`${p.name}, ${cap}`)}" loading="lazy" decoding="async"><span>${esc(`${e.short || p.name.split(' (')[0]}: ${cap}`)}</span></button>`);
      } else links.push(`<span class="ev-link none">${ic('image')}${esc(e.label || e.place)}: no reference shot yet</span>`);
      continue;
    }
    const u = evidenceUrl(e);
    if (u) { imgs.push(`<button type="button" class="ev-img" data-full="${esc(u.full)}" data-cap="${esc(e.label || '')}"><img src="${esc(u.thumb || u.full)}" alt="${esc(e.label || 'Evidence')}" loading="lazy" decoding="async"><span>${esc(e.label || '')}</span></button>`); continue; }
    if (e.href) links.push(`<a class="ev-link" href="${esc(e.href)}" target="_blank" rel="noopener">${ic(/^\/doc\//.test(e.href) || /\.md$/.test(e.href) ? 'doc' : 'ext')}${esc(e.label || e.href)}</a>`);
  }
  for (const f of (d.watchFiles || [])) {
    if (f.kind === 'image') imgs.push(`<button type="button" class="ev-img" data-full="${esc(f.url)}" data-cap="${esc(f.name)}"><img src="${esc(thumbUrl(f.url, 480))}" alt="${esc(f.name)}" loading="lazy" decoding="async"><span>${esc(f.name)}</span></button>`);
    else links.push(`<a class="ev-link" href="${esc(f.url)}" target="_blank" rel="noopener">${ic('doc')}${esc(f.name)} <small>${esc(ago(f.mtime))}</small></a>`);
  }
  if (!imgs.length && !links.length) return '';
  return `<div class="evid">${imgs.length ? `<div class="ev-imgs">${imgs.join('')}</div>` : ''}${links.length ? `<div class="ev-links">${links.join('')}</div>` : ''}</div>`;
}
function blocksHtml(d) {
  const b = (d.blocking || []).filter(Boolean);
  if (!b.length) return '<span class="blocks none">Blocks nothing yet</span>';
  const titled = b.map((id) => ({ id, t: itemTitle(id) }));
  return `<span class="blocks">Blocks ${titled.map(({ id, t }) => `<span class="chip" title="${esc(t || 'not in the roadmap')}">${esc(id)}</span>`).join('')}</span>`;
}
const isWaiting = (d) => d.watch && !(d.watchFiles && d.watchFiles.length);
function decisionCard(d) {
  const busy = pending.has(d.id);
  const waiting = isWaiting(d);
  const opts = Array.isArray(d.options) ? d.options : [];
  const fields = Array.isArray(d.fields) ? d.fields : [];
  const conf = CONF[d.confidence];
  const text = drafts.get(`${d.id}:text`) || '';
  const optsHtml = opts.length ? `<div class="opts" role="group" aria-label="Answers for ${esc(d.id)}">${opts.map((o, k) => {
    const rec = d.recommendation && o.label === d.recommendation;
    return `<button type="button" class="opt${rec ? ' rec' : ''}" data-act="option" data-id="${esc(d.id)}" data-k="${k}"${busy || waiting ? ' disabled' : ''}>
      <span class="opt-l">${rec ? `<span class="rec-b">${ic('check')}Recommended</span>` : ''}${esc(o.label)}</span>
      ${o.pros ? `<span class="pc pro"><b>+</b>${esc(o.pros)}</span>` : ''}${o.cons ? `<span class="pc con"><b>-</b>${esc(o.cons)}</span>` : ''}</button>`;
  }).join('')}</div>` : '';
  const fieldsHtml = fields.length ? `<div class="fields">${fields.map((f) => {
    const key = `${d.id}:f:${f.id}`;
    const val = drafts.has(key) ? drafts.get(key) : '';
    const saved = f.answer;
    const inner = Array.isArray(f.choices) && f.choices.length
      ? `<div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${f.choices.map((c) => `<button type="button" role="radio" data-act="pick" data-key="${esc(key)}" data-v="${esc(c)}" aria-checked="${(val || saved) === c}"${f.recommended === c ? ' title="Recommended"' : ''}>${esc(c)}${f.recommended === c ? '<i class="dotrec" aria-label="recommended"></i>' : ''}</button>`).join('')}</div>`
      : `<input type="text" data-key="${esc(key)}" value="${esc(val || '')}" placeholder="${esc(saved ? '' : f.placeholder || '')}" maxlength="400" aria-label="${esc(f.label)}">`;
    return `<div class="field${saved ? ' saved' : ''}"><label>${esc(f.label)}${saved ? `<span class="saved-v">${ic('check')}${esc(saved)}</span>` : ''}</label>${inner}</div>`;
  }).join('')}<div class="f-actions"><button type="button" class="btn btn-primary" data-act="fields" data-id="${esc(d.id)}"${busy ? ' disabled' : ''}>${ic('check')}Save answers</button><span class="f-hint">Saves whatever is filled in. Leave the rest for later.</span></div></div>` : '';
  const err = errors.get(d.id);
  return `<article class="dc${waiting ? ' waiting' : ''}${busy ? ' busy' : ''}" id="dc-${esc(d.id)}" data-id="${esc(d.id)}">
    <div class="dc-top"><span class="did">${esc(d.id)}${(d.aliases || []).length ? `<small> · ${d.aliases.map(esc).join(', ')}</small>` : ''}</span>${blocksHtml(d)}${conf && d.recommendation ? tag(conf) : ''}</div>
    <h3 class="dc-q">${esc(d.question)}</h3>
    <div class="dc-body">
      <div class="dc-info">
        ${d.why_it_matters ? `<p class="why"><b>Why it matters</b>${md(d.why_it_matters)}</p>` : ''}
        ${d.context ? `<p class="ctx">${md(d.context)}</p>` : ''}
        ${Array.isArray(d.previous) && d.previous.length && d.previous[d.previous.length - 1].answer ? `<p class="prev"><b>${d.previous[d.previous.length - 1].status === 'decided-by-claude' ? 'Claude had decided' : 'Earlier answer'}</b>${esc(d.previous[d.previous.length - 1].answer)}${d.previous[d.previous.length - 1].rationale ? ` <span>(${esc(d.previous[d.previous.length - 1].rationale)})</span>` : ''}</p>` : ''}
        ${waiting ? `<p class="coming">${ic('clock')}<span><b>Coming.</b> Nothing has landed in <code>${esc(d.watch.dir)}</code> yet. This card fills in on its own when the report and screenshots arrive.</span></p>` : ''}
        ${evidenceHtml(d)}
      </div>
      <div class="dc-act">
        ${d.recommendation && !opts.some((o) => o.label === d.recommendation) ? `<p class="recline"><b>Claude recommends</b>${esc(d.recommendation)}</p>` : ''}
        ${optsHtml}${fieldsHtml}
        <div class="other">
          <label for="tx-${esc(d.id)}">${opts.length ? 'Other answer, or a note to go with your pick' : fields.length ? 'A note, saved with your answers' : 'Your answer'}</label>
          <textarea id="tx-${esc(d.id)}" data-key="${esc(d.id)}:text" rows="1" maxlength="2000"${waiting ? ' disabled' : ''} placeholder="${opts.length ? 'Type, then pick an option or save it as the answer' : 'Type here'}">${esc(text)}</textarea>
          <div class="o-actions">
            ${fields.length ? '' : `<button type="button" class="btn" data-act="other" data-id="${esc(d.id)}"${busy || waiting ? ' disabled' : ''}>Save as answer</button>`}
            ${d.recommendation ? `<button type="button" class="btn btn-ghost" data-act="recommend" data-id="${esc(d.id)}"${busy || waiting ? ' disabled' : ''} title="Accepts: ${esc(d.recommendation)}">${ic('spark')}Decide for me</button>` : ''}
          </div>
        </div>
        ${err ? `<p class="dc-err" role="alert">${esc(err)}</p>` : ''}
      </div>
    </div>
  </article>`;
}
function renderDecide() {
  const all = decisions();
  const open = openDecisions();
  const ready = open.filter((d) => !isWaiting(d));
  const claude = all.filter((d) => d.status === 'decided-by-claude');
  const answered = all.filter((d) => d.status === 'answered').sort((a, b) => String(b.answered_at || '').localeCompare(String(a.answered_at || '')));
  $('#decide-meta').textContent = `${open.length} open · ${claude.length} decided by Claude · ${answered.length} answered`;
  const rc = $('#rail-c'); rc.hidden = !open.length; rc.textContent = open.length;
  // keep focus and caret across the re-render
  const ae = document.activeElement;
  const focusKey = ae && ae.dataset && ae.dataset.key && ae.closest('#dec-list') ? ae.dataset.key : null;
  const caret = focusKey && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const openDetails = new Set($$('#dec-done details[open]').map((x) => x.dataset.k));
  $('#dec-queue').innerHTML = open.length ? open.map((d) => `<a href="#dc-${esc(d.id)}" class="${isWaiting(d) ? 'w' : ''}" title="${esc(d.question)}">${esc(d.id)}</a>`).join('') + `<span class="q-note">${ready.length} ready${open.length > ready.length ? `, ${open.length - ready.length} waiting on an agent` : ''}</span>` : '';
  $('#dec-list').innerHTML = open.length ? open.map(decisionCard).join('') : `<div class="dec-empty">${ic('check')}<div><b>Nothing waiting on Tom.</b> Every open question is answered or decided. New ones show up here as agents add them to <code>docs/roadmap.json</code>.</div></div>`;
  const doneRow = (d, kind) => `<li><span class="did">${esc(d.id)}${(d.aliases || []).length ? `<small>${d.aliases.map(esc).join(', ')}</small>` : ''}</span><div><span class="q">${esc(d.question)}</span><span class="a">${esc(d.answer || '')}</span>${d.rationale ? `<span class="why2"><b>Why:</b> ${esc(d.rationale)}</span>` : ''}<span class="by">${esc(d.answered_by || '')}${d.answered_at ? ` · ${esc(fmtDay(d.answered_at))}` : ''}</span></div>
    <button type="button" class="btn btn-small" data-act="reopen" data-id="${esc(d.id)}"${pending.has(d.id) ? ' disabled' : ''} title="${kind === 'claude' ? 'Disagree? This reopens it as a question for you.' : 'Changed your mind? This reopens it.'}">${ic('undo')}${kind === 'claude' ? 'Overrule' : 'Reopen'}</button></li>`;
  $('#dec-done').innerHTML = [
    claude.length ? `<details data-k="claude"${openDetails.has('claude') ? ' open' : ''}><summary><b>Decided by Claude</b> <span>${claude.length}</span><em>Calls Claude made with confidence, with the reason. Overrule any of them.</em></summary><ul>${claude.map((d) => doneRow(d, 'claude')).join('')}</ul></details>` : '',
    answered.length ? `<details data-k="tom"${openDetails.has('tom') ? ' open' : ''}><summary><b>Answered by Tom</b> <span>${answered.length}</span><em>Kept for the record; agents read these.</em></summary><ul>${answered.map((d) => doneRow(d, 'tom')).join('')}</ul></details>` : '',
  ].join('');
  if (focusKey) {
    const el = $(`#dec-list [data-key="${CSS.escape(focusKey)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (caret && el.setSelectionRange) try { el.setSelectionRange(caret[0], caret[1]); } catch {} }
  }
}
function toast(html, undoId) {
  const t = $('#toast');
  t.innerHTML = `<span>${html}</span>${undoId ? `<button type="button" class="btn btn-small" data-act="reopen" data-id="${esc(undoId)}" data-undo="1">${ic('undo')}Undo</button>` : ''}<button type="button" class="t-x" aria-label="Dismiss">${ic('x')}</button>`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 9000);
}
async function postDecision(body) {
  const id = body.id;
  pending.add(id); errors.delete(id); renderDecide();
  try {
    const r = await fetch('/api/decide', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cockpit': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `The cockpit refused it (HTTP ${r.status}).`);
    const list = rm().decisions || [];
    const k = list.findIndex((x) => x.id === id);
    if (k >= 0 && j.decision) list[k] = { ...list[k], ...j.decision, watchFiles: list[k].watchFiles };
    if (body.action !== 'reopen') { drafts.delete(`${id}:text`); for (const key of [...drafts.keys()]) if (key.startsWith(`${id}:f:`)) drafts.delete(key); }
    pending.delete(id);
    renderDecide(); renderHero();
    if (body.action === 'reopen') toast(`${esc(id)} is open again.`);
    else if (j.partial) toast(`Saved what you filled in for ${esc(id)}. The rest stays open.`);
    else toast(`Saved ${esc(id)}: <b>${esc(j.decision.answer)}</b>`, id);
    setTimeout(refresh, 400);
  } catch (e) {
    pending.delete(id);
    errors.set(id, e.message === 'Failed to fetch' ? 'The cockpit server did not answer. Is it still running? Nothing was saved.' : e.message);
    renderDecide();
  }
}
$('#dec-list').addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.key; if (k) drafts.set(k, e.target.value); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'pick') {
      const cur = drafts.get(b.dataset.key);
      drafts.set(b.dataset.key, cur === b.dataset.v ? '' : b.dataset.v);
      for (const x of $$(`[data-act="pick"][data-key="${CSS.escape(b.dataset.key)}"]`)) x.setAttribute('aria-checked', String(drafts.get(b.dataset.key) === x.dataset.v));
      return;
    }
    if (act === 'option') return postDecision({ id, action: 'answer', option: Number(b.dataset.k), text: drafts.get(`${id}:text`) || '' });
    if (act === 'other') {
      const text = (drafts.get(`${id}:text`) || '').trim();
      if (!text) { errors.set(id, 'Type an answer first.'); renderDecide(); $(`#tx-${CSS.escape(id)}`)?.focus(); return; }
      return postDecision({ id, action: 'answer', text });
    }
    if (act === 'recommend') return postDecision({ id, action: 'recommend' });
    if (act === 'fields') {
      const fields = {};
      for (const [k, v] of drafts) if (k.startsWith(`${id}:f:`) && String(v).trim()) fields[k.slice(id.length + 3)] = v;
      const text = (drafts.get(`${id}:text`) || '').trim();
      if (!Object.keys(fields).length && !text) { errors.set(id, 'Fill in at least one answer first.'); renderDecide(); return; }
      return postDecision({ id, action: 'answer', fields, text });
    }
    if (act === 'reopen') { if (b.dataset.undo) $('#toast').hidden = true; return postDecision({ id, action: 'reopen' }); }
  }
  const im = e.target.closest('.ev-img');
  if (im) { openLightbox(im.dataset.full, im.dataset.cap); return; }
  if (e.target.closest('.t-x')) $('#toast').hidden = true;
});
function openLightbox(src, cap) {
  const d = $('#lightbox');
  $('#lb-img').src = src; $('#lb-img').alt = cap || ''; $('#lb-cap').textContent = cap || ''; $('#lb-open').href = src;
  if (!d.open) d.showModal();
}
$('#lightbox').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

// ---------- 02 where ----------
const phaseNo = (p, i) => { const m = /^phase\s*(\d+)\s*[:.-]\s*/i.exec(p.title || ''); return m ? 'P' + m[1] : (p.id || 'P' + i); };
const phaseName = (p) => (p.title || '').replace(/^phase\s*\d+\s*[:.-]\s*/i, '');
function renderWhere() {
  const r = rm();
  const phases = r.phases || [];
  if (!phases.length) { $('#route').innerHTML = `<li class="empty"><strong>No phases yet.</strong> They appear here once <code>docs/roadmap.json</code> lists them.</li>`; $('#phase-focus').innerHTML = ''; }
  else {
    $('#route').innerHTML = phases.map((p, idx) => {
      const it = p.items || [];
      const n = (s) => it.filter((i) => i.status === s).length;
      const total = it.length || 1;
      const pct = (k) => (n(k) / total) * 100;
      const st = PHASE[p.status] || PHASE.later;
      const doneP = p.status === 'done' ? 100 : Math.round(pct('done'));
      return `<li class="stop ${esc(p.status)}" style="--p:${doneP}%" title="${esc(p.goal || '')}">
        <span class="pin" aria-hidden="true"></span>
        <div class="stop-st"><span class="pno">${esc(phaseNo(p, idx))}</span>${tag(st)}</div>
        <h3>${esc(phaseName(p))}</h3>
        <div class="meter" role="img" aria-label="${n('done')} of ${it.length} done">
          <i class="m-done" style="width:${pct('done')}%"></i><i class="m-prog" style="width:${pct('in-progress')}%"></i><i class="m-block" style="width:${pct('blocked')}%"></i>
        </div>
        <div class="stop-n"><b>${n('done')}</b>/${it.length}${n('in-progress') ? ` · ${n('in-progress')} moving` : ''}${n('blocked') ? ` · ${n('blocked')} blocked` : ''}</div>
      </li>`;
    }).join('');
    const focus = phases.filter((p) => p.status === 'active').concat(phases.filter((p) => p.status === 'next').slice(0, 1));
    const openIds = new Set(openDecisions().flatMap((d) => d.blocking || []));
    $('#phase-focus').innerHTML = focus.map((p) => {
      const it = p.items || [];
      const ws = [...new Set(it.map((i) => i.workstream).filter(Boolean))];
      const waiting = it.filter((i) => i.status !== 'done' && openIds.has(i.id)).length;
      return `<div class="pf ${esc(p.status)}"><div class="pf-k">${p.status === 'active' ? 'Driving now' : 'Up next'} <span class="pno">${esc(phaseNo(p, phases.indexOf(p)))}</span></div>
        <h3>${esc(phaseName(p))}</h3><p>${esc(p.goal || '')}</p>
        <div class="pf-m">${it.length} items · ${it.filter((i) => i.status === 'done').length} done · ${waiting} wait on a decision${ws.length ? ` · ${ws.map(esc).join(', ')}` : ''}</div></div>`;
    }).join('');
  }
  const items = allItems();
  const ws = r.workstreams || [];
  const order = { red: 0, amber: 1, green: 2 };
  $('#streams').innerHTML = ws.length ? [...ws].sort((a, b) => (order[a.health] ?? 3) - (order[b.health] ?? 3)).map((w) => {
    const mine = items.filter((i) => i.workstream === w.id);
    const open = mine.filter((i) => i.status !== 'done').length;
    return `<div class="stream"><span class="lamp" data-h="${esc(w.health)}" aria-hidden="true"></span>
      <div class="stream-h"><b>${esc(w.label)}</b><span class="hw ${esc(w.health)}">${HEALTH_WORD[w.health] || esc(w.health)}</span></div>
      <p>${esc(w.summary || '')}</p>
      <div class="cnt">${mine.length ? `${open} open of ${mine.length}` : 'no items'}</div></div>`;
  }).join('') : `<p class="empty">No workstreams listed.</p>`;
}

// The visual wave plan: one strip per wave, one square per task.
const WST = { done: 'ok', merged: 'ok', 'in-progress': 'go', review: 'go', blocked: 'bad', todo: '' };
function renderWave() {
  const V = data.wave;
  const show = !!(V && V.available && V.tasks.length);
  $('#wave').hidden = !show; $('#wave-h').hidden = !show;
  if (!show) return;
  const n = (s) => V.tasks.filter((t) => t.status === s).length;
  const done = n('done') + n('merged');
  $('#wave-meta').textContent = `${V.waves.length} waves · ${V.tasks.length} tasks · ${done} done${V.estimatedAgentDays ? ` · about ${V.estimatedAgentDays} agent-days` : ''}`;
  const gate = new Map();
  for (const d of openDecisions()) for (const id of d.blocking || []) if (/^V\d/.test(id)) { if (!gate.has(id)) gate.set(id, []); gate.get(id).push(d.id); }
  $('#wave').innerHTML = V.waves.map((w) => {
    const ts = w.tasks.map((id) => V.tasks.find((t) => t.id === id)).filter(Boolean);
    const d = ts.filter((t) => t.status === 'done' || t.status === 'merged').length;
    const gates = [...new Set(ts.flatMap((t) => gate.get(t.id) || []))];
    return `<div class="wv${d === ts.length && ts.length ? ' done' : ''}"><div class="wv-h"><span class="pno">W${esc(w.wave)}</span><b>${esc(w.theme)}</b></div>
      <div class="wv-sq" role="img" aria-label="${d} of ${ts.length} tasks done">${ts.map((t) => `<i class="${WST[t.status] ?? ''}" title="${esc(`${t.id} ${t.title} (${t.status}${t.effort ? ', ' + t.effort : ''})`)}"></i>`).join('')}</div>
      <div class="wv-n">${d}/${ts.length}${gates.length ? ` · waits on ${gates.map((g) => `<a href="#dc-${esc(g)}">${esc(g)}</a>`).join(', ')}` : ''}</div></div>`;
  }).join('') + `<p class="wv-foot">From <a href="/doc/${esc((V.source || '').split('/')[0] || 'wt-qr-look')}/docs/visual-wave/PLAN.md" target="_blank" rel="noopener">docs/visual-wave/PLAN.md</a> and <code>tasks.json</code>${V.base ? `; base: ${esc(V.base)}` : ''}.</p>`;
}

// ---------- 03 now ----------
const activePhaseTitle = () => ((rm().phases || []).find((p) => p.status === 'active') || {}).title;
function itemRow(i, decMap) {
  const st = i.status === 'blocked' ? 'pause' : 'dot';
  const dec = decMap && decMap.get(i.id);
  const meta = [
    i.owner ? `<span class="who">${esc(i.owner)}</span>` : '<span>Unowned</span>',
    i.worktree ? `<span class="chip" title="${esc(i.worktree)}">${esc(String(i.worktree).split('/').filter(Boolean).pop())}</span>` : '',
    i.branch ? `<span class="chip">${ic('branch')}${esc(i.branch)}</span>` : '',
    dec ? `<a class="tom" href="#dc-${esc(dec)}">Waits on ${esc(dec)}</a>` : '',
    i.phase && i.phase !== activePhaseTitle() ? `<span>${esc(phaseName({ title: i.phase }))}</span>` : '',
  ].filter(Boolean).join('');
  return `<li class="item ${esc(i.status)}">${ic(st)}<span class="item-t"><span class="iid">${esc(i.id || '')}</span>${esc(i.title)}</span>${i.effort ? `<span class="eff" title="Effort">${esc(i.effort)}</span>` : '<span></span>'}
    <div class="item-m">${meta}</div>${i.notes ? `<div class="item-n">${esc(i.notes)}</div>` : ''}</li>`;
}
function renderNow() {
  const items = allItems();
  const decMap = new Map();
  for (const d of openDecisions()) for (const id of d.blocking || []) if (!decMap.has(id)) decMap.set(id, d.id);
  const prog = items.filter((i) => i.status === 'in-progress');
  const blk = items.filter((i) => i.status === 'blocked');
  $('#inprog').innerHTML = prog.length ? prog.map((i) => itemRow(i, decMap)).join('') : `<li class="empty">Nothing in progress.</li>`;
  $('#blocked').innerHTML = blk.length ? blk.map((i) => itemRow(i, decMap)).join('') : `<li class="empty">Nothing blocked.</li>`;
  $('#now-meta').textContent = `${prog.length} moving · ${blk.length} blocked`;
  // items flagged needsTom that no open decision covers (soon phases only)
  const soon = new Set((rm().phases || []).filter((p) => p.status === 'active' || p.status === 'next').map((p) => p.title));
  const flagged = items.filter((i) => i.needsTom && i.status !== 'done' && soon.has(i.phase) && !decMap.has(i.id));
  const wasOpen = !!$('#tom-flags details[open]');
  $('#tom-flags').innerHTML = flagged.length ? `<details class="flags"${wasOpen ? ' open' : ''}><summary>${flagged.length} item${flagged.length === 1 ? '' : 's'} flagged "needs Tom" with no open decision</summary>
    <p class="flags-n">These are reviews Tom does when the work lands (for example, looking at a pair), not questions. They do not block anything today.</p>
    <ul class="items">${flagged.map((i) => itemRow(i, decMap)).join('')}</ul></details>` : '';
}

function renderWorktrees() {
  const W = data.worktrees;
  if (!W || W.error || !Array.isArray(W.worktrees)) { $('#worktrees').innerHTML = `<p class="empty">Could not read worktrees${W && W.error ? `: ${esc(W.error)}` : ''}.</p>`; return; }
  const meta = new Map((rm().worktrees || []).map((w) => [w.path, w]));
  const metaB = new Map((rm().worktrees || []).map((w) => [w.branch, w]));
  const list = [...W.worktrees].sort((a, b) => ((b.agentsActive ? 1 : 0) - (a.agentsActive ? 1 : 0)) || ((Date.parse(b.lastChange || b.date || 0) || 0) - (Date.parse(a.lastChange || a.date || 0) || 0)));
  const live = list.filter((w) => w.agentsActive).length;
  $('#wt-meta').textContent = `${list.length} checked out · ${live} with agents active`;
  const head = `<div class="wt-row head" role="row"><span></span><span role="columnheader">Worktree</span><span role="columnheader">HEAD</span><span role="columnheader">vs base</span><span role="columnheader">Changes</span><span role="columnheader">Dirty src</span></div>`;
  const isStale = (w) => { const m = meta.get(w.path) || metaB.get(w.branch) || {}; return w.missing || ((m.status === 'stale' || m.status === 'merged') && !w.agentsActive); };
  const row = (w) => {
    const m = meta.get(w.path) || metaB.get(w.branch) || {};
    if (w.missing) return `<div class="wt-row missing" role="row"><span class="lamp"></span><div><div class="wt-name">${esc(w.name)} ${tag(['', 'x', 'Missing'])}</div><div class="wt-br">${esc(w.branch || '')}</div></div><div class="wt-head"><span class="m">Folder is gone; git lists it as prunable (<code>git worktree prune</code> clears it).</span></div><span></span><span></span><span></span></div>`;
    const dirty = (w.modified || 0) + (w.untracked || 0);
    const cls = [w.agentsActive ? 'live' : dirty ? 'dirty' : '', m.status === 'stale' || m.status === 'merged' ? 'stale' : ''].join(' ');
    const ab = w.isBase ? `<span class="base">At base</span>` : (w.ahead == null ? '<span class="b">n/a</span>' : `<span class="a" title="Commits ahead of base">+${w.ahead}</span> <span class="b" title="Commits behind base">-${w.behind}</span>`);
    const src = (w.dirtySrc || []).length ? w.dirtySrc.slice(0, 6).map((p) => `<span class="chip" title="${esc(p)}">${esc(p.replace(/^src\//, ''))}</span>`).join('') + (w.dirtySrc.length > 6 ? `<span class="more" title="${esc(w.dirtySrc.slice(6).join('\n'))}">+${w.dirtySrc.length - 6}</span>` : '') : '';
    return `<div class="wt-row ${cls}" role="row">
      <span class="lamp" aria-hidden="true"></span>
      <div><div class="wt-name">${esc(w.name)}${m.status ? ` ${tag([m.status === 'active' ? 'go' : '', m.status === 'active' ? 'dot' : 'clock', m.status])}` : ''}</div>
        <div class="wt-br">${w.detached ? 'detached HEAD' : esc(w.branch)}</div>${m.purpose ? `<div class="wt-purpose">${esc(m.purpose)}</div>` : ''}</div>
      <div class="wt-head"><span class="s" title="${esc(w.subject)}">${esc(w.subject)}</span><span class="m"><span class="sha">${esc(w.sha)}</span> · ${ago(w.date)}</span></div>
      <div class="ab"><span class="wt-lbl">base </span>${ab}</div>
      <div class="dirt">${w.statusError ? '<span class="clean">status timed out</span>' : dirty ? `<span title="Modified">${w.modified} mod</span> · <span title="Untracked">${w.untracked} new</span>` : '<span class="clean">clean</span>'}${w.agentsActive ? `<span class="live">Agents active</span>` : w.lastChange ? `<span class="ago">${ago(w.lastChange)}</span>` : ''}</div>
      <div class="src">${src}</div>
    </div>`;
  };
  const fresh = list.filter((w) => !isStale(w)), stale = list.filter(isStale);
  const wasOpen = !!document.querySelector('#worktrees details[open]');
  $('#worktrees').innerHTML = head + fresh.map(row).join('') + (stale.length ? `<details class="wt-more"${wasOpen ? ' open' : ''}><summary>${stale.length} stale or missing worktree${stale.length === 1 ? '' : 's'}</summary>${stale.map(row).join('')}</details>` : '');
}

function renderServers() {
  const S = data.servers;
  const list = (S && S.servers || []).filter((s) => !s.self);
  if (!list.length) { $('#servers').innerHTML = `<p class="empty">No other local servers on ports 8123 to 8199.</p>`; return; }
  const rank = { play: 0, game: 1, other: 2, cockpit: 3 };
  list.sort((a, b) => (rank[a.role] ?? 4) - (rank[b.role] ?? 4) || a.port - b.port);
  $('#servers').innerHTML = list.map((s) => {
    const n = (s.processes || []).length;
    const flags = [
      !s.responding ? `<span class="sflag bad" title="${esc(s.probeError || '')}">${ic('alert')}Not answering</span>` : '',
      s.exposed ? `<span class="sflag warn" title="Listening on every network interface, so other devices on the Wi-Fi can reach it">LAN</span>` : '',
      n > 1 ? `<span class="sflag" title="${esc(s.processes.map((p) => `${p.proc} ${p.pid} on ${p.addrs.join(', ')}: ${p.cmd}`).join('\n'))}">${n} processes</span>` : '',
    ].join('');
    return `<div class="srv ${s.role}${s.responding ? '' : ' down'}">
    <span class="port">:${s.port}</span>
    <span class="what">${s.role === 'play' ? '<b>Tom’s play server</b><br>' : s.role === 'cockpit' ? '<b>Cockpit</b><br>' : ''}${esc(s.worktree || (s.cwd ? s.cwd.split('/').pop() : s.proc))}${s.branch ? ` · ${esc(s.branch)}` : ''}${flags ? `<span class="sflags">${flags}</span>` : ''}</span>
    <span class="links">${s.responding ? s.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('') : ''}</span></div>`;
  }).join('');
}

// ---------- 04 quality ----------
const numOf = (v) => { if (typeof v === 'number') return v; if (typeof v !== 'string') return null; const m = /(-?\d+(?:\.\d+)?)\s*(k\b)?/i.exec(v.replace(/,/g, '')); return m ? parseFloat(m[1]) * (m[2] ? 1000 : 1) : null; };
function renderBars() {
  const t = data.tests && data.tests.latest;
  const bars = (rm().qualityBars || []).map((b) => {
    // The test bar reads the live result rather than the number typed into the roadmap.
    if (t && t.total && (/npm test/i.test(b.label || '') || b.id === 'qb-tests')) return { ...b, current: t.passed, target: t.total, unit: `suites of ${t.total}`, status: t.ok ? 'pass' : 'fail', live: true, notes: `Live from the last run, ${fmtFull(t.finishedAt)}.` };
    return b;
  });
  const pass = bars.filter((b) => b.status === 'pass').length;
  const fail = bars.filter((b) => b.status === 'fail').length;
  $('#quality-meta').textContent = bars.length ? `${pass} met · ${fail} below · ${bars.length - pass - fail} unmeasured` : '';
  const order = { fail: 0, pass: 1 };
  $('#bars').innerHTML = bars.length ? [...bars].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2)).map((b) => {
    const cur = numOf(b.current), tgt = numOf(b.target);
    const max = Math.max(cur || 0, tgt || 0) * 1.15 || 1;
    const st = b.status === 'pass' ? ['ok', 'check', 'Pass'] : b.status === 'fail' ? ['bad', 'x', 'Below'] : ['', 'clock', 'No data'];
    const tgtTxt = typeof b.target === 'number' ? fmtNum(b.target) : esc(b.target ?? '?');
    return `<div class="bar ${esc(b.status || 'unknown')}" title="${esc(b.notes || '')}">
      <span class="bar-s">${tag(st)}</span>
      <span class="bar-l">${esc(b.label)}${b.live ? ' <span class="live-t">live</span>' : ''}</span>
      <div class="track" role="img" aria-label="${esc(b.label)}: ${cur == null ? 'not measured' : cur} against target ${esc(b.target)}">
        ${cur != null ? `<span class="fill" style="width:${Math.max(1.5, (cur / max) * 100)}%"></span>` : ''}
        ${tgt != null ? `<span class="target" style="left:${(tgt / max) * 100}%"></span>` : ''}
      </div>
      <span class="bar-v"><span><b>${b.current == null ? '?' : fmtNum(b.current)}</b><span class="un">${esc(b.unit || '')}</span></span><span class="tg">target ${tgtTxt}</span></span>
    </div>`;
  }).join('') : `<p class="empty">No quality bars defined yet.</p>`;
}

function renderTests() {
  const T = data.tests || {};
  const t = T.latest;
  let html = '';
  if (T.running) {
    const r = T.running, pct = r.total ? Math.min(100, (r.done / r.total) * 100) : 0;
    html += `<div class="t-running" role="status"><strong>Running in ${esc(String(r.worktree).split('/').pop())}</strong> <span class="t-meta">· started ${ago(r.startedAt)}${r.elsewhere ? ` from the cockpit on :${esc(r.port)}` : ''}</span>
      <div class="meter"><i class="m-prog" style="width:${pct}%"></i></div>
      <div class="t-meta">${r.done}${r.total ? ` of about ${r.total}` : ''} suites done</div>
      <pre>${esc((r.tail || []).slice(-4).map((l) => { const m = /^(ok|FAIL)\s+(\S+)/.exec(l); return m ? `${m[1] === 'ok' ? 'ok  ' : 'FAIL'}  ${m[2]}` : String(l).slice(0, 60); }).join('\n'))}</pre></div>`;
  }
  if (t) {
    html += `<div class="t-big"><span class="num">${t.passed}<small>/${t.total}</small></span>${tag(t.ok ? ['ok', 'check', 'All passing'] : ['bad', 'x', t.failed ? `${t.failed} failing` : `exit ${t.exitCode}`])}</div>
      <div class="t-meta">${esc(t.name)} · ${esc(t.branch || 'detached')} @ ${esc(t.sha || '')}<br>${fmtFull(t.finishedAt)} (${ago(t.finishedAt)}) · took ${dur(t.durationMs)}</div>
      ${t.suites && t.suites.length ? `<div class="t-strip" role="img" aria-label="${t.passed} passed, ${t.failed} failed">${t.suites.map((s) => `<i class="${s.ok ? '' : 'f'}" title="${esc(s.name)}"></i>`).join('')}</div>` : ''}
      ${t.failing && t.failing.length ? `<ul class="t-fail">${t.failing.map((f) => { const s = (t.suites || []).find((x) => x.name === f); return `<li>${ic('x')}<span>${esc(f)}</span>${s && s.last ? `<small title="${esc(s.last)}">${esc(s.last)}</small>` : ''}</li>`; }).join('')}</ul>` : ''}
      ${t.tail && t.tail.length ? `<pre class="t-tail">${esc(t.tail.join('\n'))}</pre>` : ''}`;
  } else if (!T.running) {
    html += `<p class="empty"><strong>No run recorded yet.</strong> Pick a worktree below and run the smoke suites. The summary lands in <code>tools/cockpit/state/tests.json</code>.</p>`;
  }
  $('#tests').innerHTML = html;
  const btn = $('#run-btn');
  btn.disabled = !!T.running;
  btn.innerHTML = T.running ? `${ic('refresh')}Running` : `${ic('play')}Run tests`;
}
function renderRunSelect() {
  const W = data.worktrees;
  const sel = $('#run-wt');
  const keep = sel.value;
  const list = (W && W.worktrees || []).filter((w) => !w.missing);
  const html = list.map((w) => `<option value="${esc(w.path)}">${esc(w.name)} (${esc(w.branch || 'detached')})</option>`).join('');
  if (sel.dataset.sig === html) return;           // do not rebuild under an open menu
  sel.dataset.sig = html;
  sel.innerHTML = html;
  const prefer = (keep && list.some((w) => w.path === keep)) ? keep : (list.find((w) => w.name === 'wt-qr-look') || list[0] || {}).path;
  if (prefer) sel.value = prefer;
}

function renderLoops() {
  const loops = rm().loops || [];
  const t = data.tests && data.tests.latest;
  const head = `<div class="loop head"><span>Loop</span><span class="cad">Cadence</span><span>Command</span><span>Gate</span><span class="st">State</span><span class="last">Last run</span></div>`;
  $('#loops').innerHTML = loops.length ? head + loops.map((l) => {
    let last = l.lastRun || null;
    if (/npm test|run_smoke/.test(l.command || '') && t) last = t.finishedAt;
    const lastTxt = last ? (l.exists ? ago(last) : `outputs ${ago(last)}`) : l.exists ? 'no record' : '';
    return `<div class="loop ${l.exists ? '' : 'missing'}">
      <span class="nm">${esc(l.name)}</span><span class="cad">${esc(l.cadence || '')}</span>
      <span>${l.command ? `<code>${esc(l.command)}</code>` : '<span style="color:var(--ink-3)">Not written</span>'}</span>
      <span class="gate">${esc(l.gate || '')}</span>
      <span class="st">${l.exists ? tag(['ok', 'check', 'Exists']) : tag(['go', 'clock', 'To build'])}</span>
      <span class="last" title="${esc(last ? (l.exists ? 'Last run ' : 'Newest file among its outputs: ') + fmtFull(last) : '')}">${lastTxt}</span></div>`;
  }).join('') : `<p class="empty">No loops defined.</p>`;
}

// ---------- 05 look ----------
let baFilter = 'all', baIndex = 0, baSplit = 50;
function scoreHtml(p) {
  const n = p.scoreNum;
  const s = Math.max(1, Math.min(5, Math.round(n || 0)));
  return `<span class="score s${s}" title="Reads as the real place, ${esc(p.score)} of 5"><span class="segs" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= Math.floor(n + 0.001) ? 'on' : ''}"></i>`).join('')}</span><b>${esc(p.score)}<small>/5</small></b></span>`;
}
function renderLook() {
  const L = data.look;
  if (!L || L.error || !L.available) {
    $('#places').innerHTML = `<p class="empty"><strong>No look review found.</strong> Expected <code>references/places/_feedback/compare-index.json</code> in the main checkout.</p>`;
    $('#look-latest').innerHTML = ''; $('#unscored').innerHTML = '';
    $('#look-meta').textContent = '';
    renderBA(); return;
  }
  const answeredFor = new Map();
  for (const d of decisions()) if (d.status !== 'open' && Array.isArray(d.places)) for (const s of d.places) answeredFor.set(s, d);
  const scored = L.places.filter((p) => p.scoreNum != null);
  const avg = scored.length ? scored.reduce((a, p) => a + p.scoreNum, 0) / scored.length : null;
  $('#look-meta').textContent = `${scored.length} scored · avg ${avg ? avg.toFixed(1) : '?'} / 5 · index ${L.commit || ''} ${L.built ? ago(L.built) : ''}`;
  $('#look-latest').innerHTML = L.latest ? `<div class="latest"><h3>Latest from Tom</h3><pre>${esc(L.latest.text)}</pre><div class="t-meta">${ago(L.latest.mtime)}</div></div>` : '';
  $('#places').innerHTML = scored.map((p) => {
    const pair = p.pairs.find((x) => x.ref && x.game) || p.pairs[0] || {};
    const thumb = (u, cap) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(thumbUrl(u, 480))}" alt="${esc(cap)}: ${esc(p.name)}" loading="lazy" decoding="async"><span class="cap">${cap}</span></a>` : `<span class="none">No ${cap.toLowerCase()} shot</span>`;
    const ans = answeredFor.get(p.slug);
    const tom = (p.tom || []).find((x) => !(ans && x.kind === 'ask'));
    const note = ans ? `<div class="tomnote ruling"><b>Tom answered</b>${esc(ans.answer || '')}</div>` : tom ? `<div class="tomnote ${tom.kind}"><b>${tom.kind === 'ask' ? 'Ask Tom' : 'Tom ruled'}</b>${esc(tom.text.length > 200 ? tom.text.slice(0, 197) + '...' : tom.text)}</div>` : '';
    return `<article class="place">
      <div class="thumbs">${thumb(pair.ref, 'Reference')}${thumb(pair.game, 'Game')}</div>
      <div class="place-h"><h3>${esc(p.name)}</h3>${scoreHtml(p)}</div>
      <p>${esc(p.verdictLine || p.verdict || '')}</p>
      ${note}
      <div class="pm">${p.pairCount} pair${p.pairCount === 1 ? '' : 's'} · pose ${esc(p.poseQuality || '?')}</div>
    </article>`;
  }).join('');
  const un = L.places.filter((p) => p.scoreNum == null);
  $('#unscored').innerHTML = un.length ? `<b>Not scored yet</b> (no usable reference or pose): ${un.map((p) => `<span class="chip" title="${esc(p.verdictLine || p.notes || '')}">${esc(p.name)}</span>`).join('')}` : '';
  renderBA();
}
function baList() {
  const all = (data.look && data.look.beforeAfter) || [];
  return baFilter === 'all' ? all : all.filter((b) => `${b.set}/${b.group}` === baFilter);
}
// '299-chemin-fraser__60b6f207_299_fraser_2009_east_front__day-clear' -> '299 fraser 2009 east front, day-clear'
const shortLabel = (l) => String(l || '').replace(/^[a-z0-9-]+__[0-9a-f]{8}_/, '').replace(/__/g, ', ').replace(/_/g, ' ');
const baKey = (b) => b ? `${b.before}|${b.after}` : '';
let baCurrent = '';
function renderBA() {
  const all = (data.look && data.look.beforeAfter) || [];
  $('#ba').hidden = !all.length; $('#ba-h').hidden = !all.length;
  if (!all.length) return;
  const groups = [...new Set(all.map((b) => `${b.set}/${b.group}`))].sort((a, b) => (b.startsWith('lookfix-qr') - a.startsWith('lookfix-qr')) || a.localeCompare(b));
  if (baFilter !== 'all' && !groups.includes(baFilter)) baFilter = 'all';
  $('#ba-filter').innerHTML = [['all', 'All', all.length], ...groups.map((g) => [g, g.replace('lookfix-qr/', 'Phase 0: ').replace('lookfix/', 'Round 1: '), all.filter((b) => `${b.set}/${b.group}` === g).length])]
    .map(([k, l, c]) => `<button type="button" data-f="${esc(k)}" aria-pressed="${k === baFilter}">${esc(l)}<span class="c">${c}</span></button>`).join('');
  const list = baList();
  // keep the same shot selected when new shots arrive
  const k = list.findIndex((b) => baKey(b) === baCurrent);
  baIndex = k >= 0 ? k : Math.min(baIndex, Math.max(0, list.length - 1));
  const ul = $('#ba-list'); const top = ul.scrollTop;
  ul.innerHTML = list.map((b, i) => `<li><button type="button" data-i="${i}" aria-current="${i === baIndex}" title="${esc(b.label)}"><img src="${esc(thumbUrl(b.after, 160))}" alt="" loading="lazy" decoding="async"><span><span class="lb">${esc(shortLabel(b.label))}</span><span class="gp">${esc(b.set)} · ${esc(b.group)}${b.single ? ' · after only' : ''}</span></span></button></li>`).join('');
  ul.scrollTop = top;
  showBA();
}
function showBA() {
  const b = baList()[baIndex];
  if (!b) return;
  baCurrent = baKey(b);
  const before = $('#ba-before'), after = $('#ba-after');
  const single = !b.before;
  $('#ba-stage').classList.toggle('single', single);
  $('#ba-range').hidden = single;
  $('#ba-tag-l').hidden = single;
  $('#ba-tag-r').textContent = single ? 'After only' : 'After';
  if (!single && before.getAttribute('src') !== b.before) { before.src = b.before; before.alt = `Before: ${b.label}`; }
  if (single) { before.removeAttribute('src'); before.alt = ''; }
  if (after.getAttribute('src') !== b.after) { after.src = b.after; after.alt = `After: ${b.label}`; }
  $('#ba-cap').innerHTML = `<span>${esc(b.label)} · ${esc(b.set)}/${esc(b.group)}</span><span>${b.mtime ? ago(b.mtime) : ''}${b.before ? ` · <a href="${esc(b.before)}" target="_blank" rel="noopener">before</a>` : ''} · <a href="${esc(b.after)}" target="_blank" rel="noopener">after</a></span>`;
  for (const el of document.querySelectorAll('#ba-list button')) el.setAttribute('aria-current', String(Number(el.dataset.i) === baIndex));
  setSplit(single ? 0 : baSplit, single);
}
function setSplit(v, keep) {
  const x = Math.max(0, Math.min(100, v));
  if (!keep) baSplit = x;
  $('#ba-stage').style.setProperty('--split', x + '%');
  $('#ba-range').value = x;
}

// ---------- 06 direction ----------
function renderDirection() {
  const v = rm().visualDirection || {};
  const pal = v.palette || [];
  $('#dir').innerHTML = (!v.summary && !pal.length && !(v.pillars || []).length) ? `<p class="empty">No visual direction written yet.</p>` : `
    <p class="dir-sum">${esc(v.summary || '')}</p>
    <div class="dir-grid"><div><h3 class="sub" style="margin-top:0">Pillars</h3><ol class="pillars">${(v.pillars || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>
    <div><h3 class="sub" style="margin-top:0">Palette <span class="sub-meta">${pal.length} swatches</span></h3><div class="palette">${pal.map((c) => `<div class="sw"><div class="chip-c" style="background:${/^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : 'transparent'}"></div><div><b>${esc(c.name)}<code>${esc(c.hex)}</code></b><p>${esc(c.use || '')}</p></div></div>`).join('')}</div></div></div>`;
}

// ---------- 07 activity ----------
let actFilter = 'all', actLimit = 60;
const KIND = { commit: ['', 'branch', 'Commit'], files: ['', 'dot', 'Editing'], start: ['go', 'play', 'Started'], finish: ['ok', 'check', 'Finished'], blocked: ['bad', 'alert', 'Blocked'], note: ['', 'dot', 'Note'], decision: ['go', 'hand', 'Decision'] };
function renderActivity() {
  const ev = (data.activity && data.activity.events) || [];
  const f = { all: () => true, logged: (e) => e.logged && e.kind !== 'decision', decision: (e) => e.kind === 'decision', commit: (e) => e.kind === 'commit', files: (e) => e.kind === 'files' };
  const counts = Object.fromEntries(Object.keys(f).map((k) => [k, ev.filter(f[k]).length]));
  const labels = { all: 'All', logged: 'Agent log', decision: 'Decisions', commit: 'Commits', files: 'Editing now' };
  $('#act-filter').innerHTML = Object.keys(f).map((k) => `<button type="button" data-a="${k}" aria-pressed="${k === actFilter}">${labels[k]}<span class="c">${counts[k]}</span></button>`).join('');
  const list = ev.filter(f[actFilter]);
  $('#act-meta').textContent = `last 7 days · ${ev.length} events`;
  if (!list.length) {
    $('#timeline').innerHTML = `<p class="empty">${actFilter === 'logged' ? 'No agent has logged anything yet. Try <code>node tools/cockpit/log.mjs "Started X" --who=Claude --kind=start</code>.' : actFilter === 'decision' ? 'No decisions recorded in the last 7 days.' : 'Nothing in the last 7 days.'}</p>`; return;
  }
  const days = new Map();
  for (const e of list.slice(0, actLimit)) {
    const k = new Date(e.ts).toDateString();
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(e);
  }
  $('#timeline').innerHTML = [...days.values()].map((es) => `<div class="day"><div class="day-h">${fmtDate(es[0].ts)}<small>${ago(es[0].ts)}</small></div><ul class="ev-list">${es.map((e) => `<li class="ev ${e.kind}">
      <time datetime="${esc(e.ts)}" title="${esc(fmtFull(e.ts))}">${fmtTime(e.ts)}</time>
      <span class="k">${tag(KIND[e.kind] || KIND.note)}</span>
      <span class="tx">${e.sha ? `<span class="sha">${esc(e.sha)}</span>` : ''}<span class="t">${esc(e.text)}</span><span class="w">${esc([e.who, e.worktree === 'base' ? `base ${e.branch || ''}`.trim() : e.worktree].filter(Boolean).join(' @ '))}</span></span></li>`).join('')}</ul></div>`).join('')
    + (list.length > actLimit ? `<button class="btn more-btn" type="button" id="act-more">Show ${Math.min(60, list.length - actLimit)} more</button>` : '');
}

function renderFoot() {
  const R = data.roadmap || {};
  const W = data.worktrees || {};
  $('#foot').innerHTML = `<span>roadmap: ${esc(R.source || '?')}${R.mtime ? ` (${ago(R.mtime)})` : ''}</span><span>main: ${esc(W.main || '?')}</span><span>refreshes every 20 s${data.meta ? ` · last answer took ${esc(data.meta.ms)} ms` : ''}</span><span><a href="/gallery">gallery</a> · <a href="/repo/tools/aylmer-compare/index.html">comparison page</a></span>`;
}

// ---------- refresh loop ----------
const SECTIONS = [
  [['roadmap', 'tests', 'worktrees', 'servers', 'look'], renderHeader],
  [['roadmap', 'tests'], renderHero],
  [['roadmap', 'look', 'wave'], renderDecide],
  [['wave', 'roadmap'], renderWave],
  [['roadmap'], renderWhere],
  [['roadmap'], renderNow],
  [['roadmap', 'worktrees'], renderWorktrees],
  [['servers'], renderServers],
  [['roadmap', 'tests'], renderBars],
  [['tests'], renderTests],
  [['worktrees'], renderRunSelect],
  [['roadmap', 'tests'], renderLoops],
  [['look', 'roadmap'], renderLook],
  [['roadmap'], renderDirection],
  [['activity'], renderActivity],
  [['roadmap', 'worktrees', 'meta'], renderFoot],
];
function render(force) {
  for (const [keys, fn] of SECTIONS) {
    const s = JSON.stringify(keys.map((k) => k === 'meta' ? null : data[k]));
    if (!force && sig[fn.name] === s) continue;
    sig[fn.name] = s;
    try { fn(); } catch (e) { console.warn('render', fn.name, e); }
  }
  tickClock();
}
let timer = null, inflight = null;
function refresh() {
  if (inflight) return inflight;
  clearTimeout(timer);
  inflight = (async () => {
    try {
      const r = await fetch('/api/all', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const next = await r.json();
      // keep the last good copy of any part the server could not read this time
      for (const k of Object.keys(next)) if (next[k] && next[k].error && data[k] && !data[k].error) next[k] = data[k];
      data = next;
      lastFetch = Date.now(); fetchError = null;
      render();
    } catch (e) {
      fetchError = e.message;
      tickClock();
    } finally {
      inflight = null;
      const running = data.tests && data.tests.running;
      timer = setTimeout(running ? pollTests : refresh, running ? 3000 : (fetchError ? 5000 : REFRESH_MS));
    }
  })();
  return inflight;
}
async function pollTests() {
  clearTimeout(timer);
  try {
    const r = await fetch('/api/tests', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data.tests = await r.json();
    render();
    if (!data.tests.running) return refresh();
  } catch {}
  timer = setTimeout(pollTests, 3000);
}

// ---------- events ----------
$('#run-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#run-msg');
  msg.className = 'run-msg'; msg.textContent = 'Starting...';
  try {
    const r = await fetch('/api/run/tests', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cockpit': '1' }, body: JSON.stringify({ worktree: $('#run-wt').value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { msg.className = 'run-msg err'; msg.textContent = j.error || `Could not start (HTTP ${r.status}).`; return; }
    msg.textContent = 'Running. The full suite takes about 7 minutes; this panel updates as suites finish.';
    pollTests();
  } catch { msg.className = 'run-msg err'; msg.textContent = 'The cockpit server did not answer. Is it still running?'; }
});
$('#ba-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; baFilter = b.dataset.f; baIndex = 0; baCurrent = ''; $('#ba-list').scrollTop = 0; renderBA(); });
$('#ba-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; baIndex = Number(b.dataset.i); showBA(); });
$('#ba-range').addEventListener('input', (e) => setSplit(Number(e.target.value)));
{
  const stage = $('#ba-stage');
  let drag = false;
  const at = (ev) => { if (stage.classList.contains('single')) return; const r = stage.getBoundingClientRect(); setSplit(((ev.clientX - r.left) / r.width) * 100); };
  stage.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; ev.preventDefault(); drag = true; stage.setPointerCapture(ev.pointerId); at(ev); });
  stage.addEventListener('dragstart', (ev) => ev.preventDefault());
  stage.addEventListener('pointermove', (ev) => { if (drag) at(ev); });
  stage.addEventListener('pointerup', () => { drag = false; });
  stage.addEventListener('pointercancel', () => { drag = false; });
}
$('#act-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; actFilter = b.dataset.a; actLimit = 60; renderActivity(); });
$('#timeline').addEventListener('click', (e) => { if (e.target.id === 'act-more') { actLimit += 60; renderActivity(); } });

function applyThemeIcon() {
  const t = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  $('#theme').innerHTML = ic(t === 'dark' ? 'sun' : 'moon');
  $('#theme').setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  $('#theme').title = t === 'dark' ? 'Light theme (t)' : 'Dark theme (t)';
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = cur === 'dark' ? 'light' : 'dark';
  const sys = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  // Switching back to what the system wants clears the override, so the page follows the system again.
  if (next === sys) { delete document.documentElement.dataset.theme; try { localStorage.removeItem('cockpit-theme'); } catch {} }
  else { document.documentElement.dataset.theme = next; try { localStorage.setItem('cockpit-theme', next); } catch {} }
  applyThemeIcon();
}
$('#theme').addEventListener('click', toggleTheme);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyThemeIcon);
applyThemeIcon();

const IDS = ['decide', 'where', 'now', 'quality', 'look', 'direction', 'activity'];
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const t = e.target;
  if (/input|select|textarea/i.test(t.tagName) || t.isContentEditable || $('#lightbox').open) return;
  const n = Number(e.key);
  if (n >= 1 && n <= IDS.length) { e.preventDefault(); document.getElementById(IDS[n - 1]).scrollIntoView(); }
  else if (e.key === 'r') refresh();
  else if (e.key === 't') toggleTheme();
});
const links = [...document.querySelectorAll('.rail a')];
const io = new IntersectionObserver((ents) => {
  for (const en of ents) if (en.isIntersecting) for (const a of links) { const on = a.getAttribute('href') === '#' + en.target.id; a.classList.toggle('on', on); if (on) { a.setAttribute('aria-current', 'true'); if (a.scrollIntoViewIfNeeded) a.scrollIntoViewIfNeeded(false); } else a.removeAttribute('aria-current'); }
}, { rootMargin: '-30% 0px -60% 0px' });
for (const id of IDS) io.observe(document.getElementById(id));

setInterval(tickClock, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFetch > REFRESH_MS) refresh(); });
refresh();
