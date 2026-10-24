// tools/story-editor/js/export.js
// Exports story submission data, Markdown briefs, and photo bundles.
// Adheres strictly to the standing rule: No em dashes anywhere. Use spaced hyphens (' - ').

import { getPhotoBlob, saveDirectoryHandle, getDirectoryHandle } from './db.js';

function noEmDashes(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/—/g, ' - ').replace(/–/g, ' - ');
}

export function buildPhotoManifest(photos = []) {
  return photos.map(p => ({
    id: p.id,
    filename: noEmDashes(p.filename),
    kind: p.kind || 'person',
    subjectId: p.subjectId || '',
    year: p.year || '2004',
    caption: noEmDashes(p.caption || '')
  }));
}

export function generateSubmissionJSON(state) {
  const manifest = buildPhotoManifest(state.photos);
  const doc = {
    version: state.version || 1,
    updated: new Date().toISOString(),
    missions: state.missions || [],
    people: state.people || [],
    places: state.places || [],
    canon: state.canon || [],
    rejected: state.rejected || [],
    openQuestions: state.openQuestions || [],
    gasGag: state.gasGag || [],
    photoManifest: manifest
  };

  return JSON.parse(JSON.stringify(doc, (k, v) => noEmDashes(v)));
}

export function generateSubmissionMarkdown(state, scope = 'modified') {
  const lines = [];
  lines.push('# Aylmer Madness Story Submission');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('> Instruction for Claude Code: Apply only lines marked approved, text only, one commit per mission.');
  lines.push('');

  // 1. Answered questions / Canon additions
  const answered = (state.openQuestions || []).filter(q => q.answer && q.answer.trim().length > 0);
  if (answered.length > 0) {
    lines.push('## Confirmed Facts from Open Questions');
    for (const a of answered) {
      lines.push(`- **${a.question}**`);
      lines.push(`  Answer: ${a.answer} (Confirmed ${a.answeredDate || 'today'})`);
    }
    lines.push('');
  }

  // 2. Modified missions filtered by scope
  const modifiedMissions = (state.missions || []).filter(m => {
    if (scope === 'all') return true;
    if (scope === 'drafted') return m.status === 'drafted' || m.status === 'approved' || m.status === 'applied';

    // Default 'modified': only missions with actual user changes or explicit touches in this session
    const hasVerdicts = Object.keys(m.verdicts || {}).length > 0;
    const hasMemories = (m.anecdotes || []).some(a => (a.raw && a.raw.trim().length > 0) || (a.exactPhrases && a.exactPhrases.length > 0));
    const hasPhotos = (m.photoIds || []).length > 0;
    const isExplicitlyModified = m.userModified === true;
    const isApprovedOrApplied = m.status === 'approved' || m.status === 'applied';

    return isExplicitlyModified || hasVerdicts || hasMemories || hasPhotos || isApprovedOrApplied;
  });

  lines.push(`## Updated Missions (${modifiedMissions.length} of ${(state.missions || []).length})`);
  lines.push('');
  if (modifiedMissions.length === 0) {
    lines.push('*(No missions have been modified in this session yet. Select and edit a mission on the board to see it here.)*');
    return noEmDashes(lines.join('\n'));
  }

  for (const m of modifiedMissions) {
    lines.push(`### ${m.order}. ${m.title} (${m.id})`);
    lines.push(`- **Status**: ${m.status.toUpperCase()} | **Tone Tag**: ${m.toneTag || 'none'}`);
    lines.push(`- **Fixed Gameplay (cannot change)**:`);
    lines.push(`  - Giver: ${m.fixed?.giver || 'home'}, Time of Day: ${m.fixed?.timeOfDay || 'day'}`);
    if (m.fixed?.stages) {
      lines.push(`  - Stages (${m.fixed.stages.length}):`);
      m.fixed.stages.forEach((s, idx) => {
        lines.push(`    ${idx + 1}. ${s.text}${s.money ? ` [Reward: $${s.money}]` : ''}`);
      });
    }
    lines.push('');

    // Memories & exact phrases
    if (m.anecdotes && m.anecdotes.length > 0) {
      lines.push(`- **Thomas's Memories**:`);
      for (const anec of m.anecdotes) {
        if (anec.raw) {
          lines.push(`  ${anec.raw}`);
        }
        if (anec.exactPhrases && anec.exactPhrases.length > 0) {
          lines.push('  > Exact phrases preserved verbatim:');
          for (const ep of anec.exactPhrases) {
            lines.push(`  > - "${ep}"`);
          }
        }
      }
      lines.push('');
    }

    // Proposed Lines
    lines.push(`- **Proposed Script**:`);
    if (m.proposed?.brief) {
      const v = m.verdicts?.brief ? ` [Verdict: ${m.verdicts.brief.toUpperCase()}]` : '';
      lines.push(`  - **Brief**: "${m.proposed.brief}"${v}`);
    }

    if (m.proposed?.start && m.proposed.start.length > 0) {
      lines.push(`  - **Start Lines**:`);
      m.proposed.start.forEach((l, idx) => {
        const v = m.verdicts?.[`start-${idx}`] ? ` [Verdict: ${m.verdicts[`start-${idx}`].toUpperCase()}]` : '';
        const chip = l.label ? ` [${l.label}]` : '';
        lines.push(`    - ${l.who} (${l.lang || 'en'}): "${l.line}"${chip}${v}`);
      });
    }

    if (m.proposed?.road && m.proposed.road.length > 0) {
      lines.push(`  - **On the Road Lines**:`);
      m.proposed.road.forEach((l, idx) => {
        const stageNum = l.atStage ? ` (Stage ${l.atStage})` : '';
        const v = m.verdicts?.[`road-${idx}`] ? ` [Verdict: ${m.verdicts[`road-${idx}`].toUpperCase()}]` : '';
        const chip = l.label ? ` [${l.label}]` : '';
        lines.push(`    - ${l.who}${stageNum}: "${l.line}"${chip}${v}`);
      });
    }

    if (m.proposed?.end && m.proposed.end.length > 0) {
      lines.push(`  - **End Lines**:`);
      m.proposed.end.forEach((l, idx) => {
        const v = m.verdicts?.[`end-${idx}`] ? ` [Verdict: ${m.verdicts[`end-${idx}`].toUpperCase()}]` : '';
        const chip = l.label ? ` [${l.label}]` : '';
        lines.push(`    - ${l.who} (${l.lang || 'en'}): "${l.line}"${chip}${v}`);
      });
    }

    if (m.proposed?.toast) {
      const v = m.verdicts?.toast ? ` [Verdict: ${m.verdicts.toast.toUpperCase()}]` : '';
      lines.push(`  - **Completion Toast**: "${m.proposed.toast}"${v}`);
    }

    if (m.notes) {
      lines.push(`  - **Notes**: ${m.notes}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return noEmDashes(lines.join('\n'));
}

export function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error('Clipboard copy failed:', e);
    return false;
  }
}

export function buildClaudeSubmissionPrompt(markdownContent) {
  const prompt = `Please review and apply the approved story changes from this Aylmer Madness story brief.

Rules for applying:
1. Apply only lines and missions marked APPROVED.
2. Text only - do not alter mission mechanics, checkpoints, timers, or triggers.
3. Keep one commit per mission with clean, descriptive commit messages.
4. Replace any em dashes with spaced hyphens (' - ').

---

${markdownContent}`;
  return noEmDashes(prompt);
}

export async function pickRepositoryDirectory() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('File System Access API is not supported in this browser. Use direct download instead.');
  }
  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents'
  });
  await saveDirectoryHandle(handle);
  return handle;
}

export async function exportToFileSystem(state, photos = [], scope = 'modified') {
  let dirHandle = await getDirectoryHandle();
  if (!dirHandle) {
    dirHandle = await pickRepositoryDirectory();
  }

  // Request write permission if needed
  if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    const status = await dirHandle.requestPermission({ mode: 'readwrite' });
    if (status !== 'granted') {
      throw new Error('Permission to write to directory was denied.');
    }
  }

  // 1. Write story-submission.json
  const jsonDoc = generateSubmissionJSON(state);
  const jsonFileHandle = await dirHandle.getFileHandle('story-submission.json', { create: true });
  const jsonWritable = await jsonFileHandle.createWritable();
  await jsonWritable.write(JSON.stringify(jsonDoc, null, 2));
  await jsonWritable.close();

  // 2. Write STORY-SUBMISSION.md
  const mdContent = generateSubmissionMarkdown(state, scope);
  const mdFileHandle = await dirHandle.getFileHandle('STORY-SUBMISSION.md', { create: true });
  const mdWritable = await mdFileHandle.createWritable();
  await mdWritable.write(mdContent);
  await mdWritable.close();

  // 3. Write photos to references/story/
  let refDir;
  try {
    refDir = await dirHandle.getDirectoryHandle('references', { create: true });
  } catch (e) {
    refDir = dirHandle;
  }
  const storyDir = await refDir.getDirectoryHandle('story', { create: true });

  let photoCount = 0;
  for (const photo of photos) {
    const blob = await getPhotoBlob(photo.id);
    if (blob) {
      const filename = noEmDashes(photo.filename || `photo_${photo.id}.jpg`);
      const fileHandle = await storyDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      photoCount++;
    }
  }

  return {
    success: true,
    photoCount,
    jsonPath: 'story-submission.json',
    mdPath: 'STORY-SUBMISSION.md',
    storyDir: 'references/story/'
  };
}
