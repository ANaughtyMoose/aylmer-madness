// tools/story-editor/js/app.js
// Main controller and view rendering for Aylmer Madness Story Editor.
// Zero dependencies, plain ES modules.
// Standing rule: No em dashes anywhere. Use spaced hyphens (' - ').

import {
  loadState, saveState, savePhotoBlob, getPhotoBlob, deletePhotoBlob,
  saveAudioBlob, getAudioBlob, deleteAudioBlob, clearAll
} from './db.js';
import { validateLine, validateMissionSequence, countWords, countChars, computeOnScreenTime } from './validator.js';
import {
  buildCharacterSheetPrompt, buildMissionCardPrompt, buildPlaceCardPrompt,
  buildChapterCardPrompt
} from './prompts.js';
import {
  generateSubmissionJSON, generateSubmissionMarkdown, downloadFile,
  copyToClipboard, buildClaudeSubmissionPrompt, exportToFileSystem
} from './export.js';

let appState = null;
let currentMissionId = 'alternateur';
let activePhotoId = null;
let saveTimeout = null;

// Audio recorder state
let mediaRecorder = null;
let audioChunks = [];
let recordInterval = null;
let recordSeconds = 0;

// Helper to remove any em dashes
function cleanText(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/—/g, ' - ').replace(/–/g, ' - ');
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
async function initApp() {
  console.log('Initializing Aylmer Story Editor...');
  
  // 1. Try to load from IndexedDB
  try {
    appState = await loadState();
  } catch (e) {
    console.warn('Could not read state from IndexedDB:', e);
  }

  // 2. If no persisted state, load from seed.json
  if (!appState || !appState.missions || appState.missions.length === 0) {
    console.log('IndexedDB empty. Loading seed.json...');
    try {
      const resp = await fetch('seed.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      appState = await resp.json();
      await saveState(appState);
      console.log('Seed data initialized and persisted to IndexedDB.');
    } catch (err) {
      console.error('Failed to load seed.json:', err);
      alert('Failed to load initial seed data. Check console.');
      return;
    }
  } else {
    console.log('Loaded active state from IndexedDB. Updated:', appState.updated);
  }

  // 3. Setup event listeners
  setupNavigation();
  setupBoardFilters();
  setupDetailControls();
  setupMemoryCapture();
  setupAudioRecorder();
  setupPhotoHandling();
  setupExportControls();
  setupModals();
  setupGlobalHotkeys();

  // 4. Initial render
  renderBoard();
  renderMissionDetail(currentMissionId);
  renderPeople();
  renderPlaces();
  renderLedger();
  updateMarkdownPreview();
  updateSaveIndicator(false);
}

// -----------------------------------------------------------------------------
// Autosave
// -----------------------------------------------------------------------------
function triggerAutoSave() {
  updateSaveIndicator(true);
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await saveState(appState);
      updateSaveIndicator(false);
      updateMarkdownPreview();
    } catch (e) {
      console.error('Autosave failed:', e);
    }
  }, 300);
}

function updateSaveIndicator(isSaving) {
  const dot = document.getElementById('saveDot');
  const text = document.getElementById('saveText');
  if (!dot || !text) return;

  if (isSaving) {
    dot.className = 'save-dot saving';
    text.textContent = 'Saving...';
  } else {
    dot.className = 'save-dot';
    text.textContent = 'Saved locally';
  }
}

// -----------------------------------------------------------------------------
// Navigation & Views
// -----------------------------------------------------------------------------
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      switchView(targetView);
    });
  });

  const backBtn = document.getElementById('backToBoardBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => switchView('board'));
  }

  const resetBtn = document.getElementById('resetSeedBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all data to seed.json? Any unsaved edits will be lost.')) {
        await clearAll();
        const resp = await fetch('seed.json');
        appState = await resp.json();
        await saveState(appState);
        renderBoard();
        renderMissionDetail(currentMissionId);
        renderPeople();
        renderPlaces();
        renderLedger();
        updateMarkdownPreview();
        alert('Reset to seed complete.');
      }
    });
  }
}

function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetSec = document.getElementById(`view-${viewName}`);
  const targetBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);

  if (targetSec) targetSec.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');

  if (viewName === 'board') renderBoard();
  if (viewName === 'people') renderPeople();
  if (viewName === 'places') renderPlaces();
  if (viewName === 'ledger') renderLedger();
  if (viewName === 'export') updateMarkdownPreview();
}

// -----------------------------------------------------------------------------
// Mission Board (View 1)
// -----------------------------------------------------------------------------
function setupBoardFilters() {
  const statusFilter = document.getElementById('statusFilter');
  const toneFilter = document.getElementById('toneFilter');
  const hasMemoryFilter = document.getElementById('hasMemoryFilter');
  const searchInput = document.getElementById('missionSearchInput');

  [statusFilter, toneFilter, hasMemoryFilter, searchInput].forEach(el => {
    if (el) el.addEventListener('input', () => renderBoard());
  });
}

function renderBoard() {
  const grid = document.getElementById('missionsGrid');
  if (!grid || !appState || !appState.missions) return;

  const statusFilter = document.getElementById('statusFilter')?.value || 'all';
  const toneFilter = document.getElementById('toneFilter')?.value || 'all';
  const hasMemory = document.getElementById('hasMemoryFilter')?.checked || false;
  const search = (document.getElementById('missionSearchInput')?.value || '').toLowerCase().trim();

  let filtered = appState.missions.filter(m => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (toneFilter !== 'all' && m.toneTag !== toneFilter) return false;
    if (hasMemory) {
      const hasMem = (m.anecdotes || []).some(a => a.raw || (a.exactPhrases && a.exactPhrases.length > 0));
      if (!hasMem) return false;
    }
    if (search) {
      const titleMatch = (m.title || '').toLowerCase().includes(search);
      const briefMatch = (m.current?.brief || '').toLowerCase().includes(search);
      const giverMatch = (m.fixed?.giver || '').toLowerCase().includes(search);
      if (!titleMatch && !briefMatch && !giverMatch) return false;
    }
    return true;
  });

  const statsText = document.getElementById('boardStatsText');
  if (statsText) {
    const memoryCount = appState.missions.filter(m => (m.anecdotes || []).some(a => a.raw)).length;
    const draftedCount = appState.missions.filter(m => m.status === 'drafted' || m.status === 'approved').length;
    statsText.textContent = `${filtered.length} of ${appState.missions.length} missions (${draftedCount} drafted, ${memoryCount} memories)`;
  }

  grid.innerHTML = '';
  filtered.forEach(m => {
    const card = document.createElement('div');
    card.className = `mission-card ${m.kind === 'arc' ? 'arc-beat' : ''} ${m.id === currentMissionId ? 'selected' : ''}`;
    card.dataset.id = m.id;

    const memoryCount = (m.anecdotes || []).reduce((acc, a) => acc + (a.raw ? 1 : 0), 0);
    const photoCount = (m.photoIds || []).length;
    const toneClass = m.toneTag ? `tone-${m.toneTag}` : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="card-num">${m.kind === 'arc' ? 'ARC BEAT' : `#${m.order}`}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${m.toneTag ? `<span class="badge-tone ${toneClass}">${m.toneTag}</span>` : ''}
          <span class="badge-status status-${m.status}">${m.status}</span>
        </div>
      </div>
      <div class="card-title">${m.title}</div>
      <div class="card-brief">${m.current?.brief || ''}</div>
      <div class="card-meta">
        <div class="card-counts">
          <span>&#128221; ${memoryCount} mem</span>
          <span>&#128247; ${photoCount} photos</span>
        </div>
        <div><strong>Giver:</strong> ${m.fixed?.giver || 'home'}</div>
      </div>
      <div class="card-thumbs" id="thumbs-${m.id}"></div>
    `;

    // Drag and drop onto mission card
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('dragover');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('dragover');
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await handleDroppedFiles(e.dataTransfer.files, m.id, 'mission');
        renderCardThumbnails(m.id);
        renderBoard();
      }
    });

    card.addEventListener('click', () => {
      currentMissionId = m.id;
      renderMissionDetail(m.id);
      switchView('detail');
    });

    grid.appendChild(card);
    renderCardThumbnails(m.id);
  });
}

async function renderCardThumbnails(missionId) {
  const container = document.getElementById(`thumbs-${missionId}`);
  if (!container || !appState.photos) return;
  const mission = appState.missions.find(m => m.id === missionId);
  if (!mission || !mission.photoIds || mission.photoIds.length === 0) return;

  container.innerHTML = '';
  const firstPhotos = mission.photoIds.slice(0, 3);
  for (const pid of firstPhotos) {
    const photo = appState.photos.find(p => p.id === pid);
    if (photo) {
      const blob = await getPhotoBlob(pid);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = url;
        img.alt = photo.caption || 'Thumbnail';
        container.appendChild(img);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Mission Detail (View 2)
// -----------------------------------------------------------------------------
function setupDetailControls() {
  const prevBtn = document.getElementById('prevMissionBtn');
  const nextBtn = document.getElementById('nextMissionBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => navigateMission(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => navigateMission(1));
  }

  // Status & Tone selectors
  const statusSelect = document.getElementById('proposalStatusSelect');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      const m = getMission(currentMissionId);
      if (m) {
        m.status = e.target.value;
        m.userModified = true;
        updateDetailHeaderBadges(m);
        triggerAutoSave();
      }
    });
  }

  const toneSelect = document.getElementById('proposalToneSelect');
  if (toneSelect) {
    toneSelect.addEventListener('change', (e) => {
      const m = getMission(currentMissionId);
      if (m) {
        m.toneTag = e.target.value;
        m.userModified = true;
        updateDetailHeaderBadges(m);
        triggerAutoSave();
      }
    });
  }

  // Proposed Brief Input
  const briefInput = document.getElementById('proposedBriefInput');
  if (briefInput) {
    briefInput.addEventListener('input', (e) => {
      const m = getMission(currentMissionId);
      if (m && m.proposed) {
        m.proposed.brief = cleanText(e.target.value);
        m.userModified = true;
        triggerAutoSave();
      }
    });
  }

  // Proposed Toast Input
  const toastInput = document.getElementById('proposedToastInput');
  if (toastInput) {
    toastInput.addEventListener('input', (e) => {
      const m = getMission(currentMissionId);
      if (m && m.proposed) {
        m.proposed.toast = cleanText(e.target.value);
        m.userModified = true;
        triggerAutoSave();
      }
    });
  }

  // Add line buttons
  const addStartBtn = document.getElementById('addStartLineBtn');
  if (addStartBtn) {
    addStartBtn.addEventListener('click', () => addProposedLine('start'));
  }

  const addRoadBtn = document.getElementById('addRoadLineBtn');
  if (addRoadBtn) {
    addRoadBtn.addEventListener('click', () => addProposedLine('road'));
  }

  const addEndBtn = document.getElementById('addEndLineBtn');
  if (addEndBtn) {
    addEndBtn.addEventListener('click', () => addProposedLine('end'));
  }

  // Preview HUD button
  const previewHudBtn = document.getElementById('previewHudBtn');
  if (previewHudBtn) {
    previewHudBtn.addEventListener('click', () => openHudPreview());
  }

  // Mission card prompt button
  const missionPromptBtn = document.getElementById('buildMissionCardPromptBtn');
  if (missionPromptBtn) {
    missionPromptBtn.addEventListener('click', () => {
      const m = getMission(currentMissionId);
      if (!m) return;
      const giverKey = m.fixed?.giver || 'tom';
      const giverPerson = appState.people.find(p => p.id === giverKey || p.name.toLowerCase() === giverKey.toLowerCase());
      const res = buildMissionCardPrompt(m, giverPerson);
      openPromptModal(`Mission Briefing Prompt: ${m.title}`, res.prompt, res.warnings);
    });
  }
}

function getMission(id) {
  return appState?.missions?.find(m => m.id === id);
}

function navigateMission(delta) {
  if (!appState || !appState.missions) return;
  const idx = appState.missions.findIndex(m => m.id === currentMissionId);
  if (idx < 0) return;
  let newIdx = idx + delta;
  if (newIdx < 0) newIdx = appState.missions.length - 1;
  if (newIdx >= appState.missions.length) newIdx = 0;
  currentMissionId = appState.missions[newIdx].id;
  renderMissionDetail(currentMissionId);
}

function updateDetailHeaderBadges(m) {
  const statusBadge = document.getElementById('detailStatusBadge');
  const toneBadge = document.getElementById('detailToneBadge');

  if (statusBadge) {
    statusBadge.className = `badge-status status-${m.status}`;
    statusBadge.textContent = m.status.toUpperCase();
  }
  if (toneBadge) {
    toneBadge.className = `badge-tone tone-${m.toneTag || 'flat'}`;
    toneBadge.textContent = (m.toneTag || 'flat').toUpperCase();
  }
}

function renderMissionDetail(missionId) {
  const m = getMission(missionId);
  if (!m) return;

  // Header Info
  const heading = document.getElementById('detailMissionHeading');
  if (heading) {
    heading.textContent = `${m.title} (${m.kind === 'arc' ? 'Arc Beat' : '#' + m.order})`;
  }
  updateDetailHeaderBadges(m);

  // Status & Tone selects
  const statusSelect = document.getElementById('proposalStatusSelect');
  if (statusSelect) statusSelect.value = m.status || 'untouched';
  const toneSelect = document.getElementById('proposalToneSelect');
  if (toneSelect) toneSelect.value = m.toneTag || 'flat';

  // 1. Left Column: Fixed Gameplay
  document.getElementById('fixedGiver').textContent = m.fixed?.giver || '-';
  document.getElementById('fixedTimeOfDay').textContent = m.fixed?.timeOfDay || '-';
  document.getElementById('fixedKind').textContent = m.kind === 'arc' ? 'Arc Beat' : 'Campaign';

  const stagesList = document.getElementById('fixedStagesList');
  if (stagesList) {
    stagesList.innerHTML = '';
    const stages = m.fixed?.stages || [];
    stages.forEach((st, idx) => {
      const item = document.createElement('div');
      item.className = 'stage-item';
      item.innerHTML = `
        <div class="stage-step">Stage ${idx + 1}${st.time ? ` · ${st.time}s timer` : ''}${st.money ? ` · $${st.money} reward` : ''}</div>
        <div class="stage-text">${st.text || ''}</div>
        ${st.sub ? `<div class="stage-sub">${st.sub}</div>` : ''}
        ${st.hint ? `<div class="stage-sub" style="font-style:italic;">Hint: ${st.hint}</div>` : ''}
        ${st.toast ? `<div class="stage-toast-note">Stage Toast: &ldquo;${st.toast}&rdquo;</div>` : ''}
      `;
      stagesList.appendChild(item);
    });
  }

  // 2. Middle Column: Current Game Text & Verdicts
  const currentBriefText = document.getElementById('currentBriefText');
  if (currentBriefText) {
    currentBriefText.textContent = m.current?.brief || '';
  }
  renderVerdictButtons(document.querySelector('.verdict-bar[data-target="brief"]'), m.verdicts?.brief);

  // Current Start Lines
  renderCurrentLinesSection('currentStartLinesWrap', 'Start Dialogue', m.current?.friendLinesStart || [], 'start', m);

  // Current Toasts
  const toastsWrap = document.getElementById('currentToastsWrap');
  if (toastsWrap) {
    toastsWrap.innerHTML = '';
    (m.current?.toasts || []).forEach((t, idx) => {
      const card = document.createElement('div');
      card.className = `line-card ${m.verdicts?.[`toast-${idx}`] ? `verdict-${m.verdicts[`toast-${idx}`]}` : ''}`;
      card.innerHTML = `
        <div class="line-speaker"><span>Stage Toast ${idx + 1}</span><span class="chip chip-current">CURRENT GAME</span></div>
        <div class="line-text">&ldquo;${t}&rdquo;</div>
        <div class="verdict-bar" data-target="toast-${idx}">
          <button type="button" class="verdict-btn" data-verdict="keep">Keep</button>
          <button type="button" class="verdict-btn" data-verdict="tweak">Tweak</button>
          <button type="button" class="verdict-btn" data-verdict="wrong">Wrong</button>
          <button type="button" class="verdict-btn" data-verdict="more">More Story</button>
        </div>
      `;
      toastsWrap.appendChild(card);
      renderVerdictButtons(card.querySelector('.verdict-bar'), m.verdicts?.[`toast-${idx}`]);
    });
  }

  // Current End Lines
  renderCurrentLinesSection('currentEndLinesWrap', 'Completion Dialogue', m.current?.friendLinesEnd || [], 'end', m);

  // 3. Right Column: Proposed Script
  const proposedBrief = document.getElementById('proposedBriefInput');
  if (proposedBrief) proposedBrief.value = m.proposed?.brief || '';
  const proposedToast = document.getElementById('proposedToastInput');
  if (proposedToast) proposedToast.value = m.proposed?.toast || '';

  renderProposedLinesList('proposedStartLinesList', m.proposed?.start || [], 'start');
  renderProposedLinesList('proposedRoadLinesList', m.proposed?.road || [], 'road');
  renderProposedLinesList('proposedEndLinesList', m.proposed?.end || [], 'end');

  updateMissionValidatorBanner(m);

  // Memory & Exact Phrases
  renderMemoryBox(m);

  // Photos
  renderMissionPhotos(m);
}

function renderCurrentLinesSection(containerId, title, lines, prefix, mission) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  lines.forEach(([who, line], idx) => {
    const key = `${prefix}-${idx}`;
    const verdict = mission.verdicts?.[key];
    const card = document.createElement('div');
    card.className = `line-card ${verdict ? `verdict-${verdict}` : ''}`;
    card.innerHTML = `
      <div class="line-speaker">
        <span>${who}</span>
        <span class="chip chip-current">CURRENT GAME</span>
      </div>
      <div class="line-text">&ldquo;${line}&rdquo;</div>
      <div class="verdict-bar" data-target="${key}">
        <button type="button" class="verdict-btn" data-verdict="keep">Keep</button>
        <button type="button" class="verdict-btn" data-verdict="tweak">Tweak</button>
        <button type="button" class="verdict-btn" data-verdict="wrong">Wrong</button>
        <button type="button" class="verdict-btn" data-verdict="more">More Story</button>
      </div>
    `;
    container.appendChild(card);
    renderVerdictButtons(card.querySelector('.verdict-bar'), verdict);
  });
}

function renderVerdictButtons(bar, currentVerdict) {
  if (!bar) return;
  const targetKey = bar.dataset.target;
  const btns = bar.querySelectorAll('.verdict-btn');
  btns.forEach(btn => {
    const verdict = btn.dataset.verdict;
    btn.classList.toggle('active', verdict === currentVerdict);
    btn.onclick = () => {
      const m = getMission(currentMissionId);
      if (!m) return;
      if (!m.verdicts) m.verdicts = {};
      if (m.verdicts[targetKey] === verdict) {
        delete m.verdicts[targetKey];
      } else {
        m.verdicts[targetKey] = verdict;
      }
      m.userModified = true;
      triggerAutoSave();
      renderMissionDetail(currentMissionId);
    };
  });
}

function renderProposedLinesList(containerId, lines, sectionKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const currentMission = getMission(currentMissionId);

  lines.forEach((lineObj, idx) => {
    const row = document.createElement('div');
    row.className = 'line-row';

    const val = validateLine(lineObj);
    const chipClass = lineObj.label === 'USER CONFIRMED' ? 'chip-confirmed'
      : lineObj.label === 'CURRENT GAME' ? 'chip-current'
      : lineObj.label === 'NEEDS CONFIRMATION' ? 'chip-needs'
      : 'chip-proposal';

    row.innerHTML = `
      <div class="line-row-controls">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <select class="speaker-select" data-sec="${sectionKey}" data-idx="${idx}">
            ${renderSpeakerOptions(lineObj.who)}
          </select>
          ${sectionKey === 'road' ? `
            <select class="stage-select" data-sec="${sectionKey}" data-idx="${idx}">
              ${renderStageOptions(currentMission, lineObj.atStage || 1)}
            </select>
          ` : ''}
          <button type="button" class="lang-toggle ${lineObj.lang === 'fr' ? 'active' : ''}" data-sec="${sectionKey}" data-idx="${idx}">
            ${lineObj.lang ? lineObj.lang.toUpperCase() : 'EN'}
          </button>
          <select class="label-select" data-sec="${sectionKey}" data-idx="${idx}" style="font-size:11px;padding:2px 4px;">
            <option value="PROPOSAL" ${lineObj.label === 'PROPOSAL' ? 'selected' : ''}>PROPOSAL</option>
            <option value="USER CONFIRMED" ${lineObj.label === 'USER CONFIRMED' ? 'selected' : ''}>USER CONFIRMED</option>
            <option value="CURRENT GAME" ${lineObj.label === 'CURRENT GAME' ? 'selected' : ''}>CURRENT GAME</option>
            <option value="NEEDS CONFIRMATION" ${lineObj.label === 'NEEDS CONFIRMATION' ? 'selected' : ''}>NEEDS CONFIRMATION</option>
          </select>
          <span class="chip ${chipClass}">${lineObj.label || 'PROPOSAL'}</span>
        </div>
        <button type="button" class="btn btn-danger btn-sm delete-line-btn" data-sec="${sectionKey}" data-idx="${idx}">✕</button>
      </div>

      <input type="text" class="line-input line-text-input" data-sec="${sectionKey}" data-idx="${idx}" value="${lineObj.line || ''}" placeholder="One line bubble text...">

      <!-- Live Validator Bar -->
      <div class="validator-bar">
        <div class="val-counters">
          <span class="counter-tag ${val.wordStatus}">Words: ${val.words}/12</span>
          <span class="counter-tag ${val.charStatus}">Chars: ${val.chars}/70</span>
          <span>Duration: ~${val.estTime}s</span>
        </div>
        ${val.warnings.length > 0 ? `<span style="color:var(--accent-red);font-size:10px;">${val.warnings.join(' · ')}</span>` : '<span style="color:var(--accent-green);font-size:10px;">✓ Pass</span>'}
      </div>
    `;

    // Event listeners - IN-PLACE updates so typing cursor is never lost!
    const textInput = row.querySelector('.line-text-input');
    textInput.addEventListener('input', (e) => {
      lineObj.line = cleanText(e.target.value);
      if (currentMission) currentMission.userModified = true;
      triggerAutoSave();

      const freshVal = validateLine(lineObj);
      const valBar = row.querySelector('.validator-bar');
      if (valBar) {
        valBar.innerHTML = `
          <div class="val-counters">
            <span class="counter-tag ${freshVal.wordStatus}">Words: ${freshVal.words}/12</span>
            <span class="counter-tag ${freshVal.charStatus}">Chars: ${freshVal.chars}/70</span>
            <span>Duration: ~${freshVal.estTime}s</span>
          </div>
          ${freshVal.warnings.length > 0 ? `<span style="color:var(--accent-red);font-size:10px;">${freshVal.warnings.join(' · ')}</span>` : '<span style="color:var(--accent-green);font-size:10px;">✓ Pass</span>'}
        `;
      }
      updateMissionValidatorBanner(getMission(currentMissionId));
    });

    const speakerSelect = row.querySelector('.speaker-select');
    speakerSelect.addEventListener('change', (e) => {
      lineObj.who = cleanText(e.target.value);
      if (currentMission) currentMission.userModified = true;
      triggerAutoSave();
      updateMissionValidatorBanner(getMission(currentMissionId));
    });

    const stageSelect = row.querySelector('.stage-select');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        lineObj.atStage = parseInt(e.target.value, 10);
        if (currentMission) currentMission.userModified = true;
        triggerAutoSave();
      });
    }

    const langToggle = row.querySelector('.lang-toggle');
    langToggle.addEventListener('click', () => {
      lineObj.lang = lineObj.lang === 'fr' ? 'en' : 'fr';
      if (currentMission) currentMission.userModified = true;
      triggerAutoSave();
      renderProposedLinesList(containerId, lines, sectionKey);
    });

    const labelSelect = row.querySelector('.label-select');
    labelSelect.addEventListener('change', (e) => {
      lineObj.label = e.target.value;
      if (currentMission) currentMission.userModified = true;
      triggerAutoSave();
      renderProposedLinesList(containerId, lines, sectionKey);
    });

    const deleteBtn = row.querySelector('.delete-line-btn');
    deleteBtn.addEventListener('click', () => {
      lines.splice(idx, 1);
      if (currentMission) currentMission.userModified = true;
      triggerAutoSave();
      renderProposedLinesList(containerId, lines, sectionKey);
      updateMissionValidatorBanner(getMission(currentMissionId));
    });

    container.appendChild(row);
  });
}


function renderStageOptions(m, selectedStage) {
  const stages = m?.fixed?.stages || [];
  if (stages.length === 0) {
    return '<option value="1">Stage 1</option>';
  }
  return stages.map((st, idx) => {
    const stageNum = idx + 1;
    const shortText = st.text ? ` - ${st.text.slice(0, 24)}...` : '';
    return `<option value="${stageNum}" ${stageNum === Number(selectedStage) ? 'selected' : ''}>Stage ${stageNum}${shortText}</option>`;
  }).join('');
}

function renderSpeakerOptions(selectedWho) {
  const cast = appState?.people || [];
  const speakers = cast.map(p => p.name);
  if (!speakers.includes('Tom')) speakers.unshift('Tom');
  if (!speakers.includes('Dad')) speakers.push('Dad');
  if (!speakers.includes('Narrator')) speakers.push('Narrator');

  return speakers.map(s => `
    <option value="${s}" ${s.toLowerCase() === (selectedWho || '').toLowerCase() ? 'selected' : ''}>${s}</option>
  `).join('');
}

function addProposedLine(sectionKey) {
  const m = getMission(currentMissionId);
  if (!m || !m.proposed) return;
  if (!m.proposed[sectionKey]) m.proposed[sectionKey] = [];

  const defaultSpeaker = m.fixed?.giver === 'home' ? 'Margaret' : 'Tom';
  const newLine = {
    who: defaultSpeaker,
    line: '',
    lang: 'en',
    label: 'PROPOSAL'
  };
  if (sectionKey === 'road') {
    newLine.atStage = 1;
  }
  m.proposed[sectionKey].push(newLine);
  m.userModified = true;

  triggerAutoSave();
  renderMissionDetail(currentMissionId);
}

function updateMissionValidatorBanner(m) {
  const banner = document.getElementById('missionValBanner');
  const timeText = document.getElementById('missionTotalTimeText');
  const warningsList = document.getElementById('missionWarningsList');
  if (!banner || !m || !m.proposed) return;

  const res = validateMissionSequence(m.proposed);
  timeText.textContent = `${res.totalTime.toFixed(1)}s / 12.0s limit`;

  if (res.warnings.length > 0) {
    banner.classList.add('has-errors');
    warningsList.innerHTML = res.warnings.map(w => `<div>⚠ ${w}</div>`).join('');
  } else {
    banner.classList.remove('has-errors');
    warningsList.innerHTML = `<span style="color:var(--accent-green);">✓ Timing and turn-taking rules pass (Section A compliant)</span>`;
  }
}

// -----------------------------------------------------------------------------
// Memory Capture Box & Exact Phrases
// -----------------------------------------------------------------------------
function setupMemoryCapture() {
  const rawInput = document.getElementById('memoryRawInput');
  if (rawInput) {
    rawInput.addEventListener('input', (e) => {
      const m = getMission(currentMissionId);
      if (!m) return;
      if (!m.anecdotes) m.anecdotes = [];
      if (m.anecdotes.length === 0) {
        m.anecdotes.push({
          id: `anec-${m.id}`,
          created: new Date().toISOString().slice(0, 10),
          raw: '',
          exactPhrases: [],
          extracted: { people: [], places: [], objects: [], events: [], whyItStuck: '' },
          audioId: null
        });
      }
      m.anecdotes[0].raw = cleanText(e.target.value);
      m.userModified = true;
      if (m.status === 'untouched' && m.anecdotes[0].raw.trim()) {
        m.status = 'has-memory';
        updateDetailHeaderBadges(m);
      }
      triggerAutoSave();
    });
  }

  const markBtn = document.getElementById('markExactPhraseBtn');
  if (markBtn) {
    markBtn.addEventListener('click', () => {
      const textarea = document.getElementById('memoryRawInput');
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.substring(start, end).trim();

      if (!selected) {
        alert('Please highlight a phrase in the memory text box first.');
        return;
      }

      const m = getMission(currentMissionId);
      if (!m) return;
      if (!m.anecdotes) m.anecdotes = [];
      if (m.anecdotes.length === 0) {
        m.anecdotes.push({
          id: `anec-${m.id}`,
          created: new Date().toISOString().slice(0, 10),
          raw: textarea.value,
          exactPhrases: [],
          extracted: { people: [], places: [], objects: [], events: [], whyItStuck: '' },
          audioId: null
        });
      }

      const cleanPhrase = cleanText(selected);
      if (!m.anecdotes[0].exactPhrases) m.anecdotes[0].exactPhrases = [];
      if (!m.anecdotes[0].exactPhrases.includes(cleanPhrase)) {
        m.anecdotes[0].exactPhrases.push(cleanPhrase);
        m.userModified = true;
        triggerAutoSave();
        renderMemoryBox(m);
      }
    });
  }
}

function renderMemoryBox(m) {
  const rawInput = document.getElementById('memoryRawInput');
  const phrasesList = document.getElementById('exactPhrasesList');
  const anec = m.anecdotes?.[0];

  if (rawInput) {
    rawInput.value = anec?.raw || '';
  }

  if (phrasesList) {
    phrasesList.innerHTML = '';
    const phrases = anec?.exactPhrases || [];
    phrases.forEach((phrase, idx) => {
      const item = document.createElement('div');
      item.className = 'exact-phrase-item';
      item.innerHTML = `
        <span>&ldquo;${phrase}&rdquo;</span>
        <button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:11px;">✕</button>
      `;
      item.querySelector('button').onclick = () => {
        anec.exactPhrases.splice(idx, 1);
        triggerAutoSave();
        renderMemoryBox(m);
      };
      phrasesList.appendChild(item);
    });
  }

  // Render audio if attached
  renderAudioPlayer(anec?.audioId);
}

// -----------------------------------------------------------------------------
// Audio Recording (MediaRecorder -> IndexedDB)
// -----------------------------------------------------------------------------
function setupAudioRecorder() {
  const recBtn = document.getElementById('recordAudioBtn');
  const deleteBtn = document.getElementById('deleteAudioBtn');

  if (recBtn) {
    recBtn.addEventListener('click', async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const m = getMission(currentMissionId);
      const audioId = m?.anecdotes?.[0]?.audioId;
      if (audioId) {
        await deleteAudioBlob(audioId);
        m.anecdotes[0].audioId = null;
        triggerAutoSave();
        renderAudioPlayer(null);
      }
    });
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const m = getMission(currentMissionId);
      if (m) {
        if (!m.anecdotes || m.anecdotes.length === 0) {
          m.anecdotes = [{
            id: `anec-${m.id}`,
            created: new Date().toISOString().slice(0, 10),
            raw: '',
            exactPhrases: [],
            extracted: { people: [], places: [], objects: [], events: [], whyItStuck: '' },
            audioId: null
          }];
        }
        const audioId = `audio-${m.id}-${Date.now()}`;
        await saveAudioBlob(audioId, audioBlob);
        m.anecdotes[0].audioId = audioId;
        triggerAutoSave();
        renderAudioPlayer(audioId);
      }
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    const recBtn = document.getElementById('recordAudioBtn');
    recBtn.classList.add('recording');
    recBtn.title = 'Click to stop recording';

    recordSeconds = 0;
    const timer = document.getElementById('recordTimer');
    recordInterval = setInterval(() => {
      recordSeconds++;
      const mins = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
      const secs = String(recordSeconds % 60).padStart(2, '0');
      if (timer) timer.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    console.error('Audio capture permission failed:', err);
    alert('Microphone access is required to record audio memories.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  clearInterval(recordInterval);
  const recBtn = document.getElementById('recordAudioBtn');
  recBtn.classList.remove('recording');
  recBtn.title = 'Record audio';
}

async function renderAudioPlayer(audioId) {
  const player = document.getElementById('memoryAudioPlayer');
  const deleteBtn = document.getElementById('deleteAudioBtn');
  const timer = document.getElementById('recordTimer');

  if (!audioId) {
    if (player) { player.style.display = 'none'; player.src = ''; }
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (timer) timer.textContent = '00:00';
    return;
  }

  const blob = await getAudioBlob(audioId);
  if (blob && player) {
    player.src = URL.createObjectURL(blob);
    player.style.display = 'block';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
  }
}

// -----------------------------------------------------------------------------
// Photo Handling & Drop Targets
// -----------------------------------------------------------------------------
function setupPhotoHandling() {
  const dropZone = document.getElementById('missionPhotoDropZone');
  const fileInput = document.getElementById('missionPhotoFileInput');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleDroppedFiles(e.target.files, currentMissionId);
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleDroppedFiles(e.dataTransfer.files, currentMissionId);
      }
    });
  }

  // Global window drop handler for who_year_shot.jpg convention
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    // If not dropped directly on a specific zone, use global auto-filer
    if (!e.target.closest('.drop-target-zone')) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleDroppedFiles(e.dataTransfer.files, null);
      }
    }
  });
}

async function handleDroppedFiles(files, targetId, targetType = 'mission') {
  if (!appState.photos) appState.photos = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;

    // Parse filename convention who_year_shot.jpg
    const parsed = parsePhotoFilename(file.name);
    const photoId = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    await savePhotoBlob(photoId, file);

    const photoMeta = {
      id: photoId,
      filename: cleanText(file.name),
      kind: parsed.kind,
      subjectId: (targetId && targetType !== 'mission') ? targetId : parsed.subjectId,
      year: parsed.year,
      caption: parsed.caption,
      isReferenceSheet: false
    };
    appState.photos.push(photoMeta);

    if (targetType === 'mission' && targetId) {
      const m = getMission(targetId);
      if (m) {
        if (!m.photoIds) m.photoIds = [];
        m.photoIds.push(photoId);
        m.userModified = true;
      }
    } else if (targetType === 'person' && targetId) {
      const person = appState.people.find(p => p.id === targetId);
      if (person) {
        if (!person.photoIds) person.photoIds = [];
        person.photoIds.push(photoId);
      }
    } else if (targetType === 'place' && targetId) {
      const place = appState.places.find(p => p.key === targetId);
      if (place) {
        if (!place.photoIds) place.photoIds = [];
        place.photoIds.push(photoId);
      }
    } else if (parsed.subjectId) {
      // Auto-attach to person or place from convention
      const person = appState.people.find(p => p.id === parsed.subjectId);
      if (person) {
        if (!person.photoIds) person.photoIds = [];
        person.photoIds.push(photoId);
      }
      const place = appState.places.find(p => p.key === parsed.subjectId);
      if (place) {
        if (!place.photoIds) place.photoIds = [];
        place.photoIds.push(photoId);
      }
    }
  }

  triggerAutoSave();
  if (targetType === 'mission' && targetId) {
    renderMissionPhotos(getMission(targetId));
  }
}

function parsePhotoFilename(name) {
  const clean = name.replace(/\.[^/.]+$/, '');
  const parts = clean.split('_');

  let subjectId = '';
  let year = '2004';
  let caption = '';
  let kind = 'object';

  if (parts.length >= 3) {
    subjectId = parts[0].toLowerCase();
    year = parts[1];
    caption = parts.slice(2).join(' ');
  } else if (parts.length === 2) {
    subjectId = parts[0].toLowerCase();
    year = parts[1];
  } else {
    caption = clean;
  }

  // Kind heuristics
  const peopleIds = ['tom', 'margaret', 'sayyad', 'zahra', 'mike', 'russell', 'adam', 'norm', 'abraham', 'tyler', 'rob', 'dad'];
  if (peopleIds.includes(subjectId)) {
    kind = 'person';
  } else if (subjectId.includes('ranger') || subjectId.includes('truck')) {
    kind = 'truck';
  } else if (appState?.places?.some(p => p.key === subjectId)) {
    kind = 'place';
  }

  return { subjectId, year, caption: cleanText(caption), kind };
}

async function renderMissionPhotos(m) {
  const container = document.getElementById('missionPhotosStrip');
  if (!container || !m) return;
  container.innerHTML = '';

  const photoIds = m.photoIds || [];
  for (let idx = 0; idx < photoIds.length; idx++) {
    const pid = photoIds[idx];
    const photo = appState.photos.find(p => p.id === pid);
    if (!photo) continue;

    const blob = await getPhotoBlob(pid);
    if (!blob) continue;

    const card = document.createElement('div');
    card.className = 'photo-thumb-card';
    const url = URL.createObjectURL(blob);
    card.innerHTML = `
      <img src="${url}" alt="${photo.caption || photo.filename}">
      <span class="thumb-badge">${photo.year || '2004'}</span>
      <div class="reorder-bar">
        ${idx > 0 ? '<button type="button" class="photo-reorder-btn move-left" title="Move Left">&larr;</button>' : ''}
        ${idx < photoIds.length - 1 ? '<button type="button" class="photo-reorder-btn move-right" title="Move Right">&rarr;</button>' : ''}
      </div>
    `;

    const leftBtn = card.querySelector('.move-left');
    if (leftBtn) {
      leftBtn.onclick = (e) => {
        e.stopPropagation();
        const tmp = photoIds[idx];
        photoIds[idx] = photoIds[idx - 1];
        photoIds[idx - 1] = tmp;
        m.userModified = true;
        triggerAutoSave();
        renderMissionPhotos(m);
      };
    }

    const rightBtn = card.querySelector('.move-right');
    if (rightBtn) {
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        const tmp = photoIds[idx];
        photoIds[idx] = photoIds[idx + 1];
        photoIds[idx + 1] = tmp;
        m.userModified = true;
        triggerAutoSave();
        renderMissionPhotos(m);
      };
    }

    card.addEventListener('click', () => openLightbox(photo, blob));
    container.appendChild(card);
  }
}

// -----------------------------------------------------------------------------
// Lightbox Modal
// -----------------------------------------------------------------------------

function showSafeModal(modal) {
  if (!modal) return;
  document.querySelectorAll('dialog').forEach(d => {
    if (d !== modal && d.open) {
      try { d.close(); } catch(e){}
    }
  });
  if (!modal.open) {
    try { modal.showModal(); } catch(e) { console.warn(e); }
  }
}

function openLightbox(photo, blob) {
  activePhotoId = photo.id;
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const yearInput = document.getElementById('lightboxYearInput');
  const kindSelect = document.getElementById('lightboxKindSelect');
  const captionInput = document.getElementById('lightboxCaptionInput');
  const refCheckbox = document.getElementById('lightboxRefSheetCheckbox');

  if (img && blob) {
    img.src = URL.createObjectURL(blob);
  }
  if (yearInput) yearInput.value = photo.year || '2004';
  if (kindSelect) kindSelect.value = photo.kind || 'person';
  if (captionInput) captionInput.value = photo.caption || '';
  if (refCheckbox) {
    refCheckbox.checked = Boolean(photo.isReferenceSheet);
    refCheckbox.onchange = () => {
      photo.isReferenceSheet = refCheckbox.checked;
      if (photo.subjectId) {
        const person = appState.people?.find(p => p.id === photo.subjectId);
        if (person) {
          if (refCheckbox.checked) {
            person.hasApprovedSheet = true;
            (appState.photos || []).forEach(p => {
              if (p.subjectId === person.id && p.id !== photo.id) {
                p.isReferenceSheet = false;
              }
            });
          } else {
            const hasAny = (appState.photos || []).some(p => p.subjectId === person.id && p.isReferenceSheet);
            person.hasApprovedSheet = hasAny;
          }
        }
      }
      triggerAutoSave();
      renderPeople();
    };
  }

  showSafeModal(modal);
}

function setupModals() {
  // Modern web guidance backdrop click fallback for dialogs
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        if (dialog.id === 'previewModal') clearPreviewTimers();
        dialog.close();
      }
    });
  });

  const closeLbBtn = document.getElementById('closeLightboxBtn');
  const lbModal = document.getElementById('lightboxModal');
  if (closeLbBtn && lbModal) {
    closeLbBtn.addEventListener('click', () => lbModal.close());
  }

  const deletePhotoBtn = document.getElementById('deletePhotoBtn');
  if (deletePhotoBtn) {
    deletePhotoBtn.addEventListener('click', async () => {
      if (activePhotoId && confirm('Delete this photo?')) {
        await deletePhotoBlob(activePhotoId);
        appState.photos = (appState.photos || []).filter(p => p.id !== activePhotoId);
        // Remove references from missions and people
        appState.missions.forEach(m => {
          m.photoIds = (m.photoIds || []).filter(pid => pid !== activePhotoId);
        });
        appState.people.forEach(p => {
          p.photoIds = (p.photoIds || []).filter(pid => pid !== activePhotoId);
        });
        triggerAutoSave();
        lbModal.close();
        renderMissionDetail(currentMissionId);
      }
    });
  }

  // Save changes on input in lightbox
  ['lightboxYearInput', 'lightboxKindSelect', 'lightboxCaptionInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const photo = appState?.photos?.find(p => p.id === activePhotoId);
        if (photo) {
          photo.year = document.getElementById('lightboxYearInput').value;
          photo.kind = document.getElementById('lightboxKindSelect').value;
          photo.caption = cleanText(document.getElementById('lightboxCaptionInput').value);
          triggerAutoSave();
        }
      });
    }
  });

  // Prompt Modal controls
  const closePromptBtn = document.getElementById('closePromptModalBtn');
  const promptModal = document.getElementById('promptModal');
  const copyPromptBtn = document.getElementById('copyPromptBtn');

  if (closePromptBtn && promptModal) {
    closePromptBtn.addEventListener('click', () => promptModal.close());
  }
  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', async () => {
      const text = document.getElementById('promptModalText').value;
      const ok = await copyToClipboard(text);
      if (ok) alert('Prompt copied to clipboard!');
    });
  }

  // Game Preview Modal controls
  const closePreviewBtn = document.getElementById('closeHudPreviewBtn');
  const previewModal = document.getElementById('previewModal');
  const restartPreviewBtn = document.getElementById('restartHudPreviewBtn');

  if (closePreviewBtn && previewModal) {
    closePreviewBtn.addEventListener('click', () => {
      clearPreviewTimers();
      previewModal.close();
    });
  }
  if (restartPreviewBtn) {
    restartPreviewBtn.addEventListener('click', () => playPreviewDialogueSequence());
  }
}

function openPromptModal(title, text, warnings = []) {
  const modal = document.getElementById('promptModal');
  document.getElementById('promptModalTitle').textContent = title;
  document.getElementById('promptModalText').value = text;

  const warnEl = document.getElementById('promptModalWarnings');
  if (warnEl) {
    if (warnings.length > 0) {
      warnEl.style.display = 'block';
      warnEl.innerHTML = warnings.map(w => `<div>⚠ ${w}</div>`).join('');
    } else {
      warnEl.style.display = 'none';
    }
  }

  showSafeModal(modal);
}

// -----------------------------------------------------------------------------
// Preview Mode HUD Player
// -----------------------------------------------------------------------------
let previewTimers = [];

function clearPreviewTimers() {
  previewTimers.forEach(t => clearTimeout(t));
  previewTimers = [];
}

function openHudPreview() {
  const m = getMission(currentMissionId);
  if (!m) return;

  const modal = document.getElementById('previewModal');
  document.getElementById('hudPreviewTitle').textContent = m.title;
  document.getElementById('hudPreviewBrief').textContent = m.proposed?.brief || m.current?.brief || '';
  const firstStage = m.fixed?.stages?.[0];
  document.getElementById('hudPreviewTask').textContent = firstStage?.text || 'First objective';

  showSafeModal(modal);
  playPreviewDialogueSequence();
}

function playPreviewDialogueSequence() {
  clearPreviewTimers();
  const stage = document.getElementById('hudHecklesStage');
  const status = document.getElementById('hudPreviewTimerStatus');
  if (!stage) return;
  stage.innerHTML = '';

  const m = getMission(currentMissionId);
  if (!m) return;

  const lines = [
    ...(m.proposed?.start || []),
    ...(m.proposed?.road || []),
    ...(m.proposed?.end || [])
  ];

  if (lines.length === 0) {
    status.textContent = 'No dialogue lines drafted for this mission.';
    return;
  }

  let delay = 600;
  lines.forEach((l, idx) => {
    const words = countWords(l.line);
    const duration = computeOnScreenTime(words) * 1000;

    const timerId = setTimeout(() => {
      stage.innerHTML = '';
      const bub = document.createElement('div');
      bub.className = 'bub story';
      bub.style.setProperty('--tilt', (idx % 2 === 0 ? -1.6 : 1.4) + 'deg');
      bub.innerHTML = `
        <b>${l.who}</b>
        <span>${l.line}</span>
      `;
      stage.appendChild(bub);
      status.textContent = `Playing bubble ${idx + 1} of ${lines.length} (${(duration / 1000).toFixed(1)}s on screen)`;
    }, delay);

    previewTimers.push(timerId);
    delay += duration + 700;
  });

  const endTimer = setTimeout(() => {
    stage.innerHTML = '';
    status.textContent = 'Sequence complete.';
  }, delay);
  previewTimers.push(endTimer);
}

// -----------------------------------------------------------------------------
// People Screen (View 3)
// -----------------------------------------------------------------------------
async function renderPersonPhotos(person) {
  const container = document.getElementById(`person-photos-${person.id}`);
  if (!container) return;
  const pids = person.photoIds || [];
  if (pids.length === 0) {
    container.innerHTML = '<span style="font-size:11px;color:var(--text-muted);display:block;padding:8px 0;">Drop reference photos here...</span>';
    return;
  }
  container.innerHTML = '';
  for (let idx = 0; idx < pids.length; idx++) {
    const pid = pids[idx];
    const photo = appState.photos.find(p => p.id === pid);
    if (!photo) continue;
    const blob = await getPhotoBlob(pid);
    if (!blob) continue;

    const card = document.createElement('div');
    card.className = 'photo-thumb-card';
    const url = URL.createObjectURL(blob);
    card.innerHTML = `
      <img src="${url}" alt="${photo.caption || photo.filename}">
      ${photo.isReferenceSheet ? '<span class="ref-sheet-badge">★ REF SHEET</span>' : ''}
      <span class="thumb-badge">${photo.year || '2004'}</span>
      <div class="reorder-bar">
        ${idx > 0 ? '<button type="button" class="photo-reorder-btn move-left" title="Move Left">&larr;</button>' : ''}
        ${idx < pids.length - 1 ? '<button type="button" class="photo-reorder-btn move-right" title="Move Right">&rarr;</button>' : ''}
      </div>
    `;

    const leftBtn = card.querySelector('.move-left');
    if (leftBtn) {
      leftBtn.onclick = (e) => {
        e.stopPropagation();
        const tmp = pids[idx];
        pids[idx] = pids[idx - 1];
        pids[idx - 1] = tmp;
        triggerAutoSave();
        renderPersonPhotos(person);
      };
    }
    const rightBtn = card.querySelector('.move-right');
    if (rightBtn) {
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        const tmp = pids[idx];
        pids[idx] = pids[idx + 1];
        pids[idx + 1] = tmp;
        triggerAutoSave();
        renderPersonPhotos(person);
      };
    }

    card.addEventListener('click', () => openLightbox(photo, blob));
    container.appendChild(card);
  }
}

function renderPeople() {
  const grid = document.getElementById('peopleGrid');
  if (!grid || !appState?.people) return;
  grid.innerHTML = '';

  appState.people.forEach(person => {
    const card = document.createElement('div');
    card.className = 'person-card';
    card.dataset.personId = person.id;
    card.innerHTML = `
      <div class="person-header">
        <div>
          <h3>${person.name}</h3>
          ${person.hasApprovedSheet ? '<span class="badge-status status-approved" style="font-size:10px;margin-top:2px;display:inline-block;">✓ REF SHEET APPROVED</span>' : ''}
        </div>
        <span style="font-size:12px;color:var(--text-muted);">${person.ageIn2004 ? `${person.ageIn2004} y/o` : ''} · ${person.language}</span>
      </div>

      <div class="voice-question-box">
        <strong>Voice Question:</strong> &ldquo;${person.privateQuestion || 'What drives their voice?'}&rdquo;
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text-muted);">CONFIRMED TRAITS:</div>
      <ul class="traits-list">
        ${(person.confirmedTraits || []).map(t => `<li>${t}</li>`).join('')}
      </ul>

      ${person.doNotSay && person.doNotSay.length > 0 ? `
        <div style="font-size:11px;color:#fca5a5;background:rgba(239,68,68,0.08);padding:6px;border-radius:4px;">
          <strong>Do Not Say:</strong> ${person.doNotSay.join(' · ')}
        </div>
      ` : ''}

      <div class="form-field" style="margin-top:6px;">
        <label>Voice Notes:</label>
        <textarea class="voice-notes-input" style="width:100%;height:60px;background:#0d161c;border:1px solid var(--border-subtle);color:#e2e8f0;padding:6px;font-size:12px;border-radius:4px;">${person.voiceNotes || ''}</textarea>
      </div>

      <div class="photo-thumbnails person-photo-strip" id="person-photos-${person.id}" style="margin-top:10px;min-height:36px;border:1px dashed var(--border-subtle);padding:6px;border-radius:4px;">
        <span style="font-size:11px;color:var(--text-muted);display:block;padding:8px 0;">Drop reference photos here...</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" class="ref-sheet-toggle" ${person.hasApprovedSheet ? 'checked' : ''}>
          <span>Approved Reference Sheet</span>
        </label>
        <button type="button" class="btn btn-secondary btn-sm build-ref-btn">Build Image Prompt</button>
      </div>
    `;

    // Notes auto-save
    const notesInput = card.querySelector('.voice-notes-input');
    notesInput.addEventListener('input', (e) => {
      person.voiceNotes = cleanText(e.target.value);
      triggerAutoSave();
    });

    // Reference sheet toggle
    const toggle = card.querySelector('.ref-sheet-toggle');
    toggle.addEventListener('change', (e) => {
      person.hasApprovedSheet = e.target.checked;
      triggerAutoSave();
      renderPeople();
    });

    // Build prompt button
    const btn = card.querySelector('.build-ref-btn');
    btn.addEventListener('click', () => {
      const prompt = buildCharacterSheetPrompt(person);
      openPromptModal(`Character Reference Sheet: ${person.name}`, prompt);
    });

    // Drag and drop onto person card
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('dragover');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('dragover');
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await handleDroppedFiles(e.dataTransfer.files, person.id, 'person');
        renderPersonPhotos(person);
      }
    });

    grid.appendChild(card);
    renderPersonPhotos(person);
  });
}

// -----------------------------------------------------------------------------
// Places Screen (View 4)
// -----------------------------------------------------------------------------
async function renderPlacePhotos(place) {
  const container = document.getElementById(`place-photos-${place.key}`);
  if (!container) return;
  const pids = place.photoIds || [];
  if (pids.length === 0) {
    container.innerHTML = '<span style="font-size:11px;color:var(--text-muted);display:block;padding:8px 0;">Drop corner photos here...</span>';
    return;
  }
  container.innerHTML = '';
  for (let idx = 0; idx < pids.length; idx++) {
    const pid = pids[idx];
    const photo = appState.photos.find(p => p.id === pid);
    if (!photo) continue;
    const blob = await getPhotoBlob(pid);
    if (!blob) continue;

    const card = document.createElement('div');
    card.className = 'photo-thumb-card';
    const url = URL.createObjectURL(blob);
    card.innerHTML = `
      <img src="${url}" alt="${photo.caption || photo.filename}">
      <span class="thumb-badge">${photo.year || '2004'}</span>
    `;
    card.addEventListener('click', () => openLightbox(photo, blob));
    container.appendChild(card);
  }
}

function renderPlaces() {
  const grid = document.getElementById('placesGrid');
  if (!grid || !appState?.places) return;
  grid.innerHTML = '';

  appState.places.forEach(place => {
    const card = document.createElement('div');
    card.className = 'place-card';
    card.dataset.placeKey = place.key;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <h4>${place.label}</h4>
        <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">${place.key}</span>
      </div>

      <div class="form-field">
        <label style="font-size:11px;">Notes & Landmarks:</label>
        <input type="text" class="place-notes-input" value="${place.notes || ''}" placeholder="Corner details, 2004 memory..." style="font-size:12px;">
      </div>

      <div class="photo-thumbnails place-photo-strip" id="place-photos-${place.key}" style="margin-top:6px;min-height:36px;border:1px dashed var(--border-subtle);padding:6px;border-radius:4px;">
        <span style="font-size:11px;color:var(--text-muted);display:block;padding:8px 0;">Drop corner photos here...</span>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn-secondary btn-sm build-place-btn">Build Establishing Shot Prompt</button>
      </div>
    `;

    const notesInput = card.querySelector('.place-notes-input');
    notesInput.addEventListener('input', (e) => {
      place.notes = cleanText(e.target.value);
      triggerAutoSave();
    });

    const btn = card.querySelector('.build-place-btn');
    btn.addEventListener('click', () => {
      const prompt = buildPlaceCardPrompt(place);
      openPromptModal(`Establishing Shot: ${place.label}`, prompt);
    });

    // Drag and drop onto place card
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('dragover');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('dragover');
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await handleDroppedFiles(e.dataTransfer.files, place.key, 'place');
        renderPlacePhotos(place);
      }
    });

    grid.appendChild(card);
    renderPlacePhotos(place);
  });
}

// -----------------------------------------------------------------------------
// Canon Ledger Screen (View 5)
// -----------------------------------------------------------------------------
function renderLedger() {
  setupLedgerTabs();
  renderCanonConfirmed();
  renderOpenQuestions();
  renderCanonRejected();
  renderExactPhrases();
  renderGasGag();
}

function setupLedgerTabs() {
  const tabs = document.querySelectorAll('.ledger-tab-btn');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.ledger-tab-panel').forEach(p => p.style.display = 'none');
      const panel = document.getElementById(`tab-${target}`);
      if (panel) panel.style.display = 'block';
    };
  });
}

function renderCanonConfirmed() {
  const container = document.getElementById('canonConfirmedList');
  if (!container || !appState?.canon) return;
  container.innerHTML = '';

  appState.canon.forEach(c => {
    const item = document.createElement('div');
    item.className = 'ledger-item';
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="chip chip-confirmed">CONFIRMED</span>
        <span style="font-size:11px;color:var(--text-muted);">${c.source || 'Thomas'} · ${c.date || '2026-09-21'}</span>
      </div>
      <div style="font-size:13.5px;color:#f1f5f9;margin-top:4px;">${c.fact}</div>
    `;
    container.appendChild(item);
  });
}

function renderOpenQuestions() {
  const container = document.getElementById('openQuestionsList');
  if (!container || !appState?.openQuestions) return;
  container.innerHTML = '';

  appState.openQuestions.forEach(q => {
    const isAnswered = Boolean(q.answer && q.answer.trim().length > 0);
    const item = document.createElement('div');
    item.className = `ledger-item ${isAnswered ? 'answered' : ''}`;
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="chip ${isAnswered ? 'chip-confirmed' : 'chip-needs'}">${isAnswered ? 'ANSWERED & CONFIRMED' : 'OPEN QUESTION'}</span>
        <span style="font-size:11px;color:var(--text-muted);">${q.id.toUpperCase()}</span>
      </div>
      <div class="q-text" style="font-size:14px;font-weight:700;color:var(--accent-gold);margin-top:6px;">${q.question}</div>
      <div class="form-field" style="margin-top:8px;">
        <label style="font-size:11px;">Answer (promotes to confirmed fact):</label>
        <textarea class="q-answer-input" style="width:100%;height:54px;background:#0d161c;border:1px solid var(--border-subtle);color:#e2e8f0;padding:6px;font-size:12.5px;border-radius:4px;" placeholder="Thomas's answer...">${q.answer || ''}</textarea>
      </div>
    `;

    const input = item.querySelector('.q-answer-input');
    input.addEventListener('input', (e) => {
      const ans = cleanText(e.target.value);
      q.answer = ans;
      if (ans.trim()) {
        q.answeredDate = new Date().toISOString().slice(0, 10);
        // Promote to confirmed fact if not already there
        const factText = `Answer to question "${q.question}": ${ans}`;
        let existing = appState.canon.find(c => c.id === `canon-${q.id}`);
        if (!existing) {
          appState.canon.push({
            id: `canon-${q.id}`,
            fact: factText,
            label: 'confirmed',
            source: 'Thomas (Open Question)',
            date: q.answeredDate
          });
        } else {
          existing.fact = factText;
        }
      }
      triggerAutoSave();
      renderCanonConfirmed();
    });

    container.appendChild(item);
  });
}

function renderCanonRejected() {
  const container = document.getElementById('canonRejectedList');
  if (!container || !appState?.rejected) return;
  container.innerHTML = '';

  appState.rejected.forEach(r => {
    const item = document.createElement('div');
    item.className = 'ledger-item';
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="chip chip-needs">DO NOT REINTRODUCE</span>
        <span style="font-size:11px;color:var(--text-muted);">${r.date || '2026-09-21'}</span>
      </div>
      <div style="font-size:13.5px;color:#fca5a5;margin-top:4px;">${r.fact}</div>
      ${r.why ? `<div style="font-size:11px;color:var(--text-muted);font-style:italic;">Reason: ${r.why}</div>` : ''}
    `;
    container.appendChild(item);
  });
}

function renderExactPhrases() {
  const container = document.getElementById('exactPhrasesAllList');
  if (!container) return;
  container.innerHTML = '';

  const phrases = [];
  (appState.missions || []).forEach(m => {
    (m.anecdotes || []).forEach(a => {
      (a.exactPhrases || []).forEach(p => {
        if (!phrases.includes(p)) phrases.push(p);
      });
    });
  });

  if (phrases.length === 0) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">No exact phrases marked yet. Highlight text in any mission memory box and click "Mark as exact phrase".</div>';
    return;
  }

  phrases.forEach(p => {
    const item = document.createElement('div');
    item.className = 'exact-phrase-item';
    item.innerHTML = `<span>&ldquo;${p}&rdquo;</span><span class="chip chip-confirmed">EXACT VERBATIM</span>`;
    container.appendChild(item);
  });
}

function renderGasGag() {
  const container = document.getElementById('gasGagList');
  if (!container || !appState?.gasGag) return;
  container.innerHTML = `
    <div style="background:rgba(255,201,77,0.08);border-left:3px solid var(--accent-gold);padding:10px;font-size:12px;margin-bottom:12px;color:#fef08a;">
      <strong>Spacing Rule (docs/STORY-RESEARCH-NOTES.md):</strong> Never two gas beats in consecutive missions after beat 3. Planted straight in mission 1 with no joke, hosted in completion toasts only.
    </div>
  `;

  appState.gasGag.forEach(g => {
    const item = document.createElement('div');
    item.className = 'ledger-item';
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="chip chip-proposal">BEAT ${g.beat.toUpperCase()}</span>
        <span style="font-size:11px;color:var(--text-muted);">Mission: ${g.missionId} · Form: ${g.form}</span>
      </div>
      <div style="font-size:14px;color:var(--accent-gold);margin-top:4px;">&ldquo;${g.line}&rdquo;</div>
    `;
    container.appendChild(item);
  });
}

// -----------------------------------------------------------------------------
// Export Screen (View 6)
// -----------------------------------------------------------------------------
function setupExportControls() {
  const fsBtn = document.getElementById('exportFsBtn');
  const dlJsonBtn = document.getElementById('downloadJsonBtn');
  const dlMdBtn = document.getElementById('downloadMdBtn');
  const copyPromptBtn = document.getElementById('copyClaudePromptBtn');
  const importFile = document.getElementById('importJsonFileInput');
  const scopeSelect = document.getElementById('exportScopeSelect');

  function getScope() {
    return document.getElementById('exportScopeSelect')?.value || 'modified';
  }

  if (scopeSelect) {
    scopeSelect.addEventListener('change', () => {
      updateMarkdownPreview();
    });
  }

  if (fsBtn) {
    fsBtn.addEventListener('click', async () => {
      try {
        fsBtn.textContent = 'Writing files...';
        const res = await exportToFileSystem(appState, appState.photos, getScope());
        alert(`Export complete!\n- Wrote ${res.jsonPath}\n- Wrote ${res.mdPath}\n- Saved ${res.photoCount} photos to ${res.storyDir}`);
      } catch (err) {
        console.error('File System Access export error:', err);
        alert(`Export failed: ${err.message}\nUse the direct download buttons instead.`);
      } finally {
        fsBtn.innerHTML = '&#128190; Save Directly to Repo (File System Access)';
      }
    });
  }

  if (dlJsonBtn) {
    dlJsonBtn.addEventListener('click', () => {
      const jsonDoc = generateSubmissionJSON(appState);
      downloadFile('story-submission.json', JSON.stringify(jsonDoc, null, 2), 'application/json');
    });
  }

  if (dlMdBtn) {
    dlMdBtn.addEventListener('click', () => {
      const mdDoc = generateSubmissionMarkdown(appState, getScope());
      downloadFile('STORY-SUBMISSION.md', mdDoc, 'text/markdown');
    });
  }

  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', async () => {
      const mdDoc = generateSubmissionMarkdown(appState, getScope());
      const prompt = buildClaudeSubmissionPrompt(mdDoc);
      const ok = await copyToClipboard(prompt);
      if (ok) alert('Prompt and Markdown copied to clipboard! Ready to paste into Claude Code.');
    });
  }

  if (importFile) {
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (imported.missions) {
          appState = imported;
          await saveState(appState);
          renderBoard();
          renderMissionDetail(currentMissionId);
          renderPeople();
          renderPlaces();
          renderLedger();
          updateMarkdownPreview();
          alert('Successfully imported story submission!');
        } else {
          alert('Invalid story-submission.json format.');
        }
      } catch (err) {
        alert(`Import error: ${err.message}`);
      }
    });
  }
}

function updateMarkdownPreview() {
  const box = document.getElementById('markdownPreviewBox');
  if (box && appState) {
    box.textContent = generateSubmissionMarkdown(appState);
  }
}

// -----------------------------------------------------------------------------
// Global Hotkeys
// -----------------------------------------------------------------------------
function setupGlobalHotkeys() {
  window.addEventListener('keydown', (e) => {
    // If typing in an input or textarea, don't trigger J/K shortcuts
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('dialog[open]');
      modals.forEach(m => m.close());
      clearPreviewTimers();
      return;
    }

    if (isTyping) return;

    if (e.key === 'j' || e.key === 'J') {
      const detailSec = document.getElementById('view-detail');
      if (detailSec && detailSec.classList.contains('active')) {
        navigateMission(1);
      }
    } else if (e.key === 'k' || e.key === 'K') {
      const detailSec = document.getElementById('view-detail');
      if (detailSec && detailSec.classList.contains('active')) {
        navigateMission(-1);
      }
    } else if (e.key === 'm' || e.key === 'M') {
      const detailSec = document.getElementById('view-detail');
      if (detailSec && detailSec.classList.contains('active')) {
        const memInput = document.getElementById('memoryRawInput');
        if (memInput) {
          e.preventDefault();
          memInput.focus();
        }
      }
    }
  });
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
