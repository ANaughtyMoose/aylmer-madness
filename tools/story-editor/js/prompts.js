// tools/story-editor/js/prompts.js
// Assembles ChatGPT / image generator prompts from docs/ART-PHOTO-BRIEF.md.
// The STYLE_BLOCK constant is copied byte-for-byte and NEVER paraphrased.

export const STYLE_BLOCK =
  'STYLE: early-2000s illustrated video game cover art. Heavy black ink outlines, flat posterised colour in a limited palette of six colours, cel shading with one hard shadow, slight halftone grain, sun-bleached Kodak Gold warmth. Summer 2004, Aylmer, Quebec. No photorealism, no soft gradients, no text, no logos, no watermark, no lens blur. 4:3 aspect.';

export function buildCharacterSheetPrompt(person) {
  const name = person.name || 'Unknown';
  const age = person.ageIn2004 ? `${person.ageIn2004} years old in 2004` : 'approx 18';
  const desc = (person.descriptors && person.descriptors.length > 0)
    ? person.descriptors.join(', ')
    : 'neutral expression, authentic 2004 style';

  return `Make a character reference sheet for a video game, based on the attached photos of the same real person. Keep the face, hair, build and glasses exactly as in the photos. Show three views on one plain light-grey sheet: front, three-quarter, profile. Neutral expression, even daylight, plain dark tee, no props. Same line weight in all three.

${STYLE_BLOCK}

SUBJECT: ${name}, ${age}, ${desc}.`;
}

export function buildMissionCardPrompt(mission, giverPerson, fields = {}) {
  const giverName = giverPerson?.name || mission.giver || 'Tom';
  const age = giverPerson?.ageIn2004 ? `${giverPerson.ageIn2004}` : '18';
  const desc = (giverPerson?.descriptors && giverPerson.descriptors.length > 0)
    ? giverPerson.descriptors.join(', ')
    : 'authentic Outaouais youth, summer 2004';

  const shot = fields.shot || 'medium close, three-quarter view, eye level, the person on the right third of the frame, looking slightly off-camera';
  const action = fields.action || `standing next to the white 1993 Ford Ranger XL during "${mission.title}"`;
  const place = fields.place || 'suburban Aylmer, morning light, summer 2004';
  const mood = fields.mood || (mission.toneTag || 'suspicious');

  const warnings = [];
  if (giverPerson && !giverPerson.hasApprovedSheet) {
    warnings.push(`Warning: ${giverPerson.name} does not have an approved reference sheet yet. Pipeline requires the reference sheet first to prevent facial drift.`);
  }

  const promptText = `Make a mission briefing illustration for a video game. Use the attached character sheet for the person's face, hair and build; do not change them. Match the line weight and colours of the attached example card.

${STYLE_BLOCK}

SUBJECT: ${giverName}, ${age}, ${desc}.
SHOT: ${shot}.
ACTION: ${action}.
PLACE: ${place}.
MOOD: ${mood}.`;

  return {
    prompt: promptText,
    warnings
  };
}

export function buildPlaceCardPrompt(place, timeOfDay = 'day') {
  const label = place.label || place.key || 'rue Principale, Aylmer, Quebec';
  const timeDesc = timeOfDay === 'morning' ? 'morning light'
    : timeOfDay === 'dusk' ? 'dusk golden hour'
    : timeOfDay === 'night' ? 'sodium-orange night light'
    : 'bright afternoon summer light';

  return `Redraw the attached photograph of a real street in Aylmer, Quebec as a video game establishing shot, keeping the building shapes, sign positions and road layout exactly. Replace any readable text on signs with blank sign shapes. Summer, ${timeDesc}, a white 1993 Ford Ranger pickup parked at the kerb. Location: ${label}.

${STYLE_BLOCK}`;
}

export function buildChapterCardPrompt(placeDesc = 'the marina at Aylmer at dusk, the river behind, one white pickup with the tailgate down') {
  return `Make a wide establishing illustration for a chapter title screen. ${placeDesc}. No people or two people seen from behind, sitting on the tailgate. Leave the lower third empty for a title.

${STYLE_BLOCK}`;
}
