// tools/story-editor/js/validator.js
// Enforces Section A dialogue rules from docs/STORY-RESEARCH-NOTES.md:
// - Bubble length: <= 12 words, <= 70 chars.
// - On-screen time: 0.3s per word + 1.0s floor, clamped to [2.5s, 5.0s].
// - No consecutive lines from the same speaker.
// - Total reading time for a mission <= 12.0 seconds.

export const LIMITS = {
  MAX_WORDS: 12,
  WARN_WORDS: 10,
  MAX_CHARS: 70,
  WARN_CHARS: 55,
  MAX_MISSION_TIME: 12.0
};

export function countWords(str) {
  if (!str) return 0;
  const cleaned = str.trim().replace(/[«»"'’]/g, '');
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function countChars(str) {
  if (!str) return 0;
  return str.trim().length;
}

export function computeOnScreenTime(words) {
  // 0.3 s per word + 1.0 s floor, clamped 2.5 to 5.0 s (Section A rule)
  const raw = Math.max(1.0, 0.3 * words + 1.0);
  return Math.min(5.0, Math.max(2.5, raw));
}

export function validateLine(lineObj) {
  const text = (lineObj && (lineObj.line || lineObj.text)) || '';
  const words = countWords(text);
  const chars = countChars(text);
  const estTime = computeOnScreenTime(words);

  let wordStatus = 'green';
  if (words > LIMITS.MAX_WORDS) {
    wordStatus = 'red';
  } else if (words >= LIMITS.WARN_WORDS) {
    wordStatus = 'amber';
  }

  let charStatus = 'green';
  if (chars > LIMITS.MAX_CHARS) {
    charStatus = 'red';
  } else if (chars >= LIMITS.WARN_CHARS) {
    charStatus = 'amber';
  }

  const warnings = [];
  if (words > LIMITS.MAX_WORDS) {
    warnings.push(`Exceeds 12-word limit (${words} words)`);
  }
  if (chars > LIMITS.MAX_CHARS) {
    warnings.push(`Exceeds 70-character limit (${chars} chars)`);
  }

  return {
    words,
    chars,
    estTime: Number(estTime.toFixed(1)),
    wordStatus,
    charStatus,
    warnings,
    isValid: words <= LIMITS.MAX_WORDS && chars <= LIMITS.MAX_CHARS
  };
}

export function validateMissionSequence(proposed) {
  if (!proposed) return { totalTime: 0, warnings: [], isValid: true };

  const startLines = proposed.start || [];
  const roadLines = proposed.road || [];
  const endLines = proposed.end || [];
  const allLines = [...startLines, ...roadLines, ...endLines];

  let totalTime = 0;
  for (const l of allLines) {
    const v = validateLine(l);
    totalTime += v.estTime;
  }

  const warnings = [];

  // Check consecutive speakers in each section
  function checkConsecutive(lines, sectionName) {
    for (let i = 1; i < lines.length; i++) {
      const prev = (lines[i - 1].who || '').trim().toLowerCase();
      const curr = (lines[i].who || '').trim().toLowerCase();
      if (prev && curr && prev === curr) {
        warnings.push(`Consecutive lines from same speaker (${lines[i].who}) in ${sectionName}`);
      }
    }
  }

  checkConsecutive(startLines, 'start');
  checkConsecutive(roadLines, 'on the road');
  checkConsecutive(endLines, 'end');

  if (totalTime > LIMITS.MAX_MISSION_TIME) {
    warnings.push(`Total reading time (${totalTime.toFixed(1)}s) exceeds 12s cumulative glance budget`);
  }

  return {
    totalTime: Number(totalTime.toFixed(1)),
    warnings,
    isValid: warnings.length === 0 && allLines.every(l => validateLine(l).isValid)
  };
}
