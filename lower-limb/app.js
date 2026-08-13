const data = window.STUDY_DATA;
let learningCoach = null;
let learningVariants = [];

const state = {
  view: 'dashboard',
  search: '',
  boneRegion: 'All',
  labelingRegion: 'All',
  practicalLabelingRegion: 'All',
  muscleGroup: 'All',
  visualCategory: 'All',
  labelingOrder: [],
  labelingIndex: 0,
  labelingKey: '',
  practicalLabelingOrder: [],
  practicalLabelingIndex: 0,
  practicalLabelingKey: '',
  visualOrder: [],
  visualIndex: 0,
  visualKey: '',
  activity: {
    mode: 'today',
    sessionKey: '',
    cards: [],
    index: 0,
    revealed: false,
    correct: 0,
    missed: 0,
    complete: false,
    region: 'Coxal Bone',
    flashFilter: 'all',
    hotspotRegion: 'Coxal Bone',
    hotspotOrder: [],
    hotspotIndex: 0,
    hotspotFeedback: null,
    hotspotCorrect: 0,
    hotspotMissed: 0,
    confidence: '',
    results: []
  },
  checked: loadJson('ll_checked', {}),
  drill: loadJson('ll_drill', {}),
  drillAnswers: loadJson('ll_drill_answers', {}),
  oiaSelections: loadJson('ll_oia_selections', {}),
  deckStatusVisible: false,
  drillMode: 'oiaReverse',
  deckName: 'OIA reverse recall',
  deckIndex: 0,
  deckOrder: [],
  objectiveRecordedCard: '',
  leftRightQuiz: { active: false, complete: false, size: 5, order: [], index: 0, results: [], sideChoice: '', viewChoice: '' },
  practicalMode: {
    active: false,
    complete: false,
    size: 10,
    selectedTypes: ['sticker', 'leftRight', 'model', 'oia'],
    order: [],
    index: 0,
    results: [],
    revealed: false,
    answers: {},
    sideChoices: {},
    viewChoices: {},
    confidenceChoices: {}
  },
  historyStack: []
};

const byId = (id) => document.getElementById(id);

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (_error) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function conceptSlug(value) {
  return normalize(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function boneConcept(value) {
  return `bone:${conceptSlug(value)}`;
}

function muscleIdConcept(value) {
  return `muscle-id:${conceptSlug(String(value || '').split(';')[0])}`;
}

function oiaConcept(value) {
  return `oia:${conceptSlug(value)}`;
}

function cardLearningMetadata(card, deckName = '') {
  const name = normalize(deckName);
  const answer = deckStatusLabel(card);
  let conceptId = `recall:${conceptSlug(answer || card.id)}`;
  let mode = 'retrieval';
  if (name.includes('bone') || card.id?.startsWith('bone-image-') || card.id?.startsWith('sticker-bone-')) {
    conceptId = boneConcept(answer);
    mode = name.includes('sticker') ? 'sticker' : 'bone-image';
  } else if (name.includes('model') || name.includes('muscle') || card.id?.startsWith('sticker-muscle-')) {
    conceptId = muscleIdConcept(answer);
    mode = name.includes('sticker') ? 'sticker' : 'muscle-id';
  }
  if (name === 'oia practice' || card.id?.startsWith('oia-bank-')) {
    conceptId = oiaConcept(card.label || answer);
    mode = 'oia-bank';
  } else if (name === 'oia reverse recall') {
    conceptId = oiaConcept(answer);
    mode = 'oia-reverse';
  } else if (name === 'action lookup') {
    conceptId = `action:${conceptSlug(card.prompt)}`;
    mode = 'action-lookup';
  } else if (name.includes('left/right')) {
    conceptId = `orientation:${conceptSlug(card.statusLabel || card.label)}`;
    mode = 'left-right';
  }
  return {
    ...card,
    conceptId,
    variantId: card.id,
    mode
  };
}

function legacyStatusForResult(result) {
  return result === 'good' || result === 'correct' ? 'correct' : 'missed';
}

function recordLearningAttempt(card, result, mode = '', confidence = '') {
  if (!learningCoach || !card?.conceptId) return null;
  const normalizedResult = result === 'correct' ? 'good' : (result === 'missed' ? 'again' : result);
  const record = learningCoach.recordAttempt({
    conceptId: card.conceptId,
    variantId: card.variantId || card.id || card.conceptId,
    mode: mode || card.mode || 'practice',
    result: normalizedResult,
    confidence,
    availableEvidenceCount: learningVariants.filter((variant) => variant.conceptId === card.conceptId).length
  });
  const statusId = card.sourceCardId || card.variantId || card.id;
  if (statusId) {
    state.drill[statusId] = legacyStatusForResult(normalizedResult);
    saveJson('ll_drill', state.drill);
  }
  return record;
}

function includesSearch(...values) {
  if (!state.search) return true;
  const normalizedValues = values.map((value) => normalize(value));
  if (normalizedValues.some((value) => value.includes(state.search))) return true;
  return data.abbreviations.some((item) => {
    const abbr = normalize(item.abbr);
    const expansion = normalize(item.expansion);
    return abbr.includes(state.search) && normalizedValues.some((value) => value.includes(expansion));
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function abbreviationFor(targetType, targetId) {
  return data.abbreviations.find((item) => item.targetType === targetType && item.targetId === targetId);
}

function renderLabeledTerm(label, targetType, targetId) {
  const abbreviation = abbreviationFor(targetType, targetId);
  const note = abbreviation ? ` <span class="abbr-note">(${escapeHtml(abbreviation.abbr)})</span>` : '';
  return `${escapeHtml(label)}${note}`;
}

function checkedKey(kind, id) {
  return `${kind}:${id}`;
}

function setChecked(kind, id, value) {
  state.checked[checkedKey(kind, id)] = value;
  saveJson('ll_checked', state.checked);
  learningCoach?.setCoverage(checkedKey(kind, id), value);
  renderDashboard();
}

function isChecked(kind, id) {
  return Boolean(state.checked[checkedKey(kind, id)]);
}

function unique(values) {
  return [...new Set(values)];
}

function renderSegmented(container, values, active, onClick) {
  container.innerHTML = values.map((value) => `
    <button class="segment ${value === active ? 'active' : ''}" type="button" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>
  `).join('');
  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => onClick(button.dataset.value));
  });
}

function renderSelectFilter(container, values, active, onChange, label = 'Image set') {
  if (!container) return;
  container.innerHTML = `
    <label class="filter-select-label">
      <span>${escapeHtml(label)}</span>
      <select class="filter-select">
        ${values.map((value) => `<option value="${escapeHtml(value)}" ${value === active ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
      </select>
    </label>
  `;
  const select = container.querySelector('select');
  select.addEventListener('change', () => onChange(select.value));
}

function ensureCardOrder(kind, items, key) {
  const orderProp = `${kind}Order`;
  const indexProp = `${kind}Index`;
  const keyProp = `${kind}Key`;
  if (
    state[keyProp] !== key ||
    !state[orderProp].length ||
    state[orderProp].length !== items.length ||
    state[orderProp].some((index) => index >= items.length)
  ) {
    state[orderProp] = shuffledDeckOrder(items);
    state[indexProp] = 0;
    state[keyProp] = key;
  }
}

function currentOrderedItem(kind, items) {
  if (!items.length) return null;
  const orderProp = `${kind}Order`;
  const indexProp = `${kind}Index`;
  return items[state[orderProp][state[indexProp]] || 0] || items[0];
}

function nextOrderedItem(kind, items, renderFn) {
  if (!items.length) return;
  const indexProp = `${kind}Index`;
  state[indexProp] = (state[indexProp] + 1) % items.length;
  renderFn();
}

function previousOrderedItem(kind, items, renderFn) {
  if (!items.length) return;
  const indexProp = `${kind}Index`;
  state[indexProp] = (state[indexProp] - 1 + items.length) % items.length;
  renderFn();
}

function scrollSectionToTop(sectionId) {
  setTimeout(() => {
    const target = byId(sectionId);
    if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, 0);
}

const NAVIGATION_STATE_KEYS = [
  'view',
  'search',
  'boneRegion',
  'labelingRegion',
  'practicalLabelingRegion',
  'muscleGroup',
  'visualCategory',
  'labelingOrder',
  'labelingIndex',
  'labelingKey',
  'practicalLabelingOrder',
  'practicalLabelingIndex',
  'practicalLabelingKey',
  'visualOrder',
  'visualIndex',
  'visualKey',
  'deckStatusVisible',
  'drillMode',
  'deckName',
  'deckIndex',
  'deckOrder'
];

function navigationSnapshot() {
  const snapshot = {};
  NAVIGATION_STATE_KEYS.forEach((key) => {
    const value = state[key];
    snapshot[key] = Array.isArray(value) ? [...value] : value;
  });
  snapshot.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  return snapshot;
}

function updateBackButton() {
  const button = byId('appBack');
  if (!button) return;
  button.classList.toggle('hidden', !state.historyStack.length);
}

function pushNavigationHistory() {
  state.historyStack.push(navigationSnapshot());
  if (state.historyStack.length > 40) state.historyStack.shift();
  updateBackButton();
}

function restoreNavigationSnapshot(snapshot) {
  if (!snapshot) return;
  NAVIGATION_STATE_KEYS.forEach((key) => {
    if (!(key in snapshot)) return;
    const value = snapshot[key];
    state[key] = Array.isArray(value) ? [...value] : value;
  });
  const searchInput = byId('globalSearch');
  if (searchInput) searchInput.value = state.search;
  renderSearchResults();
  activateView(state.view || 'dashboard', { skipHistory: true });
  setTimeout(() => window.scrollTo({ top: snapshot.scrollY || 0, behavior: 'auto' }), 0);
}

function goBackInSite() {
  const snapshot = state.historyStack.pop();
  updateBackButton();
  restoreNavigationSnapshot(snapshot);
}

function shuffleOrderedItems(kind, items, renderFn) {
  if (!items.length) return;
  const orderProp = `${kind}Order`;
  const indexProp = `${kind}Index`;
  state[orderProp] = shuffledDeckOrder(items);
  state[indexProp] = 0;
  renderFn();
}

function tableHtml(headers, rows, options = {}) {
  const widths = options.widths || [];
  return `
    <thead><tr>${headers.map((header, index) => `<th style="${widths[index] ? `width:${widths[index]}` : ''}">${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  `;
}

function renderTextLinks(text) {
  const source = String(text ?? '');
  const patterns = [
    ...data.bones
      .filter((bone) => bone.term.length > 4)
      .map((bone) => ({
        label: bone.term,
        title: bone.term,
        abbr: abbreviationFor('bone', bone.id)?.abbr || '',
        targetType: 'bone',
        targetId: bone.id
      })),
    ...data.muscles.map((muscle) => ({
      label: muscle.muscle,
      title: muscle.muscle,
      targetType: 'muscle',
      targetId: muscle.muscle
    })),
    ...data.abbreviations.map((item) => ({
      label: item.abbr,
      title: `${item.abbr}: ${item.expansion}`,
      targetType: item.targetType,
      targetId: item.targetId
    }))
  ].sort((a, b) => b.label.length - a.label.length);
  const occupied = Array(source.length).fill(false);
  const matches = [];
  patterns.forEach((pattern) => {
    const regex = new RegExp(`\\b${escapeRegex(pattern.label)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.slice(start, end).some(Boolean)) continue;
      occupied.fill(true, start, end);
      matches.push({ start, end, label: match[0], pattern });
    }
  });
  matches.sort((a, b) => a.start - b.start);
  let output = '';
  let cursor = 0;
  matches.forEach((match) => {
    output += escapeHtml(source.slice(cursor, match.start));
    output += renderJumpButton(match.label, match.pattern);
    cursor = match.end;
  });
  output += escapeHtml(source.slice(cursor));
  return output;
}

function renderJumpButton(label, pattern) {
  const targetAttribute = pattern.targetType === 'muscle'
    ? `data-muscle="${escapeHtml(pattern.targetId)}"`
    : `data-bone="${escapeHtml(pattern.targetId)}"`;
  const jumpClass = pattern.targetType === 'muscle' ? 'muscle-jump' : 'bone-jump';
  const labelHtml = pattern.abbr
    ? `${escapeHtml(label)} <span class="abbr-note">(${escapeHtml(pattern.abbr)})</span>`
    : escapeHtml(label);
  return `<button class="link-button ${jumpClass}" type="button" ${targetAttribute} title="Open ${escapeHtml(pattern.title)}">${labelHtml}</button>`;
}

function externalLinks(...links) {
  return `<div class="external-links">${links.filter((link) => link.url).map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`).join('')}</div>`;
}

function imageLink(image, labelHtml, title) {
  if (!image) return labelHtml;
  return `<a class="image-text-link" href="${escapeHtml(image)}" target="_blank" rel="noopener" title="Open image for ${escapeHtml(title)}">${labelHtml}</a>`;
}

function visualLink(visualId, fallbackImage, labelHtml, title) {
  if (!visualId) return imageLink(fallbackImage, labelHtml, title);
  return `<a class="image-text-link visual-jump" href="#visuals" data-visual-id="${escapeHtml(visualId)}" title="Open Visuals card for ${escapeHtml(title)}">${labelHtml}</a>`;
}

function renderImageAnchor(image, contentHtml, title) {
  if (!image) return contentHtml;
  return `<a class="image-open-link" href="${escapeHtml(image)}" target="_blank" rel="noopener" title="Open full-size image for ${escapeHtml(title)}">${contentHtml}</a>`;
}

function clearSearchInput() {
  state.search = '';
  const searchInput = byId('globalSearch');
  if (searchInput) searchInput.value = '';
  renderSearchResults();
}

function addSearchResult(results, kind, target, title, detail) {
  results.push({ kind, target, title, detail });
}

function searchResults() {
  if (!state.search) return [];
  const results = [];
  data.bones
    .filter((bone) => includesSearch(bone.region, bone.term, bone.references.map((ref) => ref.muscle).join(' ')))
    .slice(0, 8)
    .forEach((bone) => addSearchResult(results, 'bone', bone.id, bone.term, `Bone and marking | ${bone.region}`));
  data.muscles
    .filter((muscle) => includesSearch(muscle.group, muscle.muscle, muscle.origin, muscle.insertion, muscle.action))
    .slice(0, 8)
    .forEach((muscle) => addSearchResult(results, 'muscle', muscle.muscle, muscle.muscle, `Muscle OIA | ${muscle.group}`));
  data.modelKey
    .filter((row) => includesSearch(row.number, row.item, row.note))
    .slice(0, 6)
    .forEach((row) => addSearchResult(results, 'model', row.number, `${row.number}. ${row.item}`, 'Muscles to ID'));
  (data.practicalLabelingCards || [])
    .filter((card) => includesSearch(card.label, card.region, card.sourceTitle))
    .slice(0, 6)
    .forEach((card) => addSearchResult(results, 'practice', card.id, card.label, `Practical-Style Labeling | ${card.region}`));
  visualItems()
    .filter((item) => includesSearch(item.title, item.subtitle, item.category))
    .slice(0, 8)
    .forEach((item) => addSearchResult(results, 'visual', item.id, item.title, `Visuals | ${item.category}`));
  return results.slice(0, 18);
}

function renderSearchResults() {
  const container = byId('searchResults');
  if (!container) return;
  if (!state.search) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  const results = searchResults();
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="search-results-heading">${results.length ? `Search filters the current page. Jump to a match:` : 'No matching items found.'}</div>
    ${results.length ? `<div class="search-result-grid">
      ${results.map((result) => `<button class="search-result" type="button" data-search-kind="${escapeHtml(result.kind)}" data-search-target="${escapeHtml(result.target)}">
        <strong>${escapeHtml(result.title)}</strong>
        <span>${escapeHtml(result.detail)}</span>
      </button>`).join('')}
    </div>` : ''}
  `;
  bindSearchResults();
}

function bindSearchResults() {
  document.querySelectorAll('.search-result').forEach((button) => {
    button.addEventListener('click', () => jumpToSearchResult(button.dataset.searchKind, button.dataset.searchTarget));
  });
}

function jumpToSearchResult(kind, target) {
  if (kind === 'bone') {
    clearSearchInput();
    state.boneRegion = 'All';
    activateView('bones');
    setTimeout(() => document.querySelector(`[data-bone-row="${CSS.escape(target)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    return;
  }
  if (kind === 'muscle') {
    clearSearchInput();
    jumpToMuscle(target);
    return;
  }
  if (kind === 'model') {
    clearSearchInput();
    jumpToModel(target);
    return;
  }
  if (kind === 'practice') {
    clearSearchInput();
    jumpToPracticalLabeling(target);
    return;
  }
  if (kind === 'visual') {
    jumpToVisual(target);
  }
}

function renderBones() {
  const regions = ['All', ...unique(data.bones.map((bone) => bone.region))];
  renderSegmented(byId('boneFilters'), regions, state.boneRegion, (region) => {
    state.boneRegion = region;
    renderBones();
  });
  const rows = data.bones
    .filter((bone) => state.boneRegion === 'All' || bone.region === state.boneRegion)
    .filter((bone) => includesSearch(bone.region, bone.term, bone.references.map((ref) => ref.muscle).join(' ')))
    .map((bone) => {
      const refs = bone.references.length
        ? bone.references.map((ref) => `<button class="link-button muscle-jump" data-muscle="${escapeHtml(ref.muscle)}">${escapeHtml(ref.muscle)} (${escapeHtml(ref.role)})</button>`).join('; ')
        : '<span class="muted">-</span>';
      const term = visualLink(bone.visualId, bone.image, renderLabeledTerm(bone.term, 'bone', bone.id), bone.term);
      return `<tr data-bone-row="${escapeHtml(bone.id)}">
        <td>${escapeHtml(bone.region)}</td>
        <td><strong>${term}</strong></td>
        <td>${refs}</td>
        <td>${externalLinks({ label: 'Image', url: bone.image }, { label: 'Complete Anatomy', url: bone.completeAnatomy }, { label: 'Kenhub', url: bone.kenhub })}</td>
        <td class="check-cell"><input class="row-check" type="checkbox" ${isChecked('bone', bone.id) ? 'checked' : ''} data-check-kind="bone" data-check-id="${escapeHtml(bone.id)}" aria-label="Mark ${escapeHtml(bone.term)} done"></td>
      </tr>`;
    });
  byId('bonesTable').innerHTML = tableHtml(['Region', 'Structure or marking', 'Muscles using landmark', 'Links', 'Done'], rows, { widths: ['14%', '25%', '34%', '18%', '9%'] });
  bindChecks();
  bindJumps();
}

function renderModels() {
  const hasImages = data.modelKey.some((row) => modelImageItems(row).length);
  const sourceSummary = byId('modelSourceSummary');
  if (sourceSummary) sourceSummary.innerHTML = renderModelSourceSummary();
  const rows = data.modelKey
    .filter((row) => includesSearch(row.number, row.item, row.note))
    .map((row) => `<tr data-model-row="${escapeHtml(row.number)}">
      <td><strong>${escapeHtml(row.number)}</strong></td>
      ${hasImages ? `<td>${renderModelImage(row)}</td>` : ''}
      <td>${visualLink(row.visualId, data.muscleImageLookup[row.item], escapeHtml(row.item), row.item)}</td>
      <td>${row.note ? renderTextLinks(row.note) : '<span class="muted">-</span>'}</td>
      <td class="check-cell"><input class="row-check" type="checkbox" ${isChecked('model', row.number) ? 'checked' : ''} data-check-kind="model" data-check-id="${escapeHtml(row.number)}" aria-label="Mark muscle ID ${escapeHtml(row.number)} ${escapeHtml(row.item)} done"></td>
    </tr>`);
  const headers = hasImages ? ['Muscle ID #', 'Practice image bank', 'Structure', 'Study note', 'Done'] : ['Muscle ID #', 'Structure', 'Study note', 'Done'];
  const widths = hasImages ? ['8%', '18%', '30%', '34%', '10%'] : ['10%', '36%', '44%', '10%'];
  byId('modelKeyTable').innerHTML = tableHtml(headers, rows, { widths });
  bindChecks();
  bindJumps();
}

function renderModelImage(row) {
  const items = modelImageItems(row);
  if (!items.length) return '<span class="muted">No repository image yet</span>';
  const primary = items[0];
  const practiceCount = items.filter((item) => item.questionReady !== false).length;
  const referenceCount = items.length - practiceCount;
  const counts = [
    practiceCount ? `${practiceCount} practice ${practiceCount === 1 ? 'view' : 'views'}` : '',
    referenceCount ? `${referenceCount} reference-only` : ''
  ].filter(Boolean).join(' | ');
  return `<div class="model-image-stack">
    ${renderImageAnchor(primary.image, `<img class="model-thumb" src="${escapeHtml(primary.image)}" alt="${escapeHtml(primary.sourceTypeLabel || 'Practice image')} for ${escapeHtml(row.item)}">`, row.item)}
    <span class="image-source-badge" data-source-kind="${escapeHtml(primary.sourceKind || '')}">${escapeHtml(primary.sourceTypeLabel || 'Repository image')}</span>
    ${primary.assessmentContextLabel ? `<span class="assessment-context-badge" data-assessment-context="${escapeHtml(primary.assessmentContext || '')}">${escapeHtml(primary.assessmentContextLabel)}</span>` : ''}
    <span class="muted">${escapeHtml(counts)}</span>
  </div>`;
}

function modelImageItems(row, questionOnly = false) {
  const items = imageItems(row.images, row.image);
  return questionOnly ? items.filter((item) => item.questionReady !== false) : items;
}

function renderModelSourceSummary() {
  const stats = data.modelImageBankStats || {};
  const counts = stats.sourceCounts || {};
  const contextCounts = stats.contextCounts || {};
  const contexts = data.modelAssessmentContextLegend || {};
  const structures = stats.structuresWithQuestionImages || 0;
  const totalStructures = stats.structures || data.modelKey.length;
  const modelPhotos = counts['lab-model-photo'] || 0;
  const contextSummary = Object.entries(contextCounts)
    .filter(([, count]) => count)
    .map(([context, count]) => `<span class="assessment-context-badge" data-assessment-context="${escapeHtml(context)}">${escapeHtml(contexts[context]?.label || context)}: ${count}</span>`)
    .join('');
  return `<div class="model-source-summary-title">
      <strong>Assessment image plan</strong>
      <span>${structures} of ${totalStructures} muscles currently have question-ready images.</span>
    </div>
    <p class="model-assessment-summary">${escapeHtml(data.modelAssessmentProfile?.summary || '')}</p>
    <div class="assessment-context-list">${contextSummary}</div>
    <div class="model-source-key">
      <span class="image-source-badge" data-source-kind="pal-atlas-substitute">PAL atlas substitute</span><span>Highlighted atlas art, not a Belmont lab-model photo (${counts['pal-atlas-substitute'] || 0}).</span>
      ${counts['course-model-reference'] ? `<span class="image-source-badge" data-source-kind="course-model-reference">Course model reference</span><span>Existing multi-label course model views, kept reference-only (${counts['course-model-reference']}).</span>` : ''}
      <span class="image-source-badge" data-source-kind="course-practical-image">Course practical image</span><span>Existing course material, labeled separately (${counts['course-practical-image'] || 0}).</span>
      <span class="image-source-badge" data-source-kind="lab-model-photo">Lab model photo</span><span>Actual physical-model photographs only (${modelPhotos}).</span>
    </div>
    ${modelPhotos ? '' : '<p>No Belmont lab-model photos are currently claimed in this image bank.</p>'}`;
}

function renderLabeling() {
  const cards = data.practicalLabelingCards || [];
  const regions = ['All', ...unique(cards.map((card) => card.region).filter(Boolean))];
  if (!regions.includes(state.labelingRegion)) state.labelingRegion = 'All';
  renderSelectFilter(byId('labelingFilters'), regions, state.labelingRegion, (region) => {
    state.labelingRegion = region;
    state.labelingOrder = [];
    renderLabeling();
  }, 'Image set');
  const filtered = cards
    .filter((card) => state.labelingRegion === 'All' || card.region === state.labelingRegion)
    .filter((card) => includesSearch(card.label, card.region, card.sourceTitle, ...(card.terms || [])));
  const key = `${state.labelingRegion}|${state.search}|${filtered.map((card) => card.id).join(',')}`;
  ensureCardOrder('labeling', filtered, key);
  const card = currentOrderedItem('labeling', filtered);
  byId('labelingCards').innerHTML = card
    ? `<article class="labeling-card single-study-card practical-labeling-card">
      <div class="study-card-topline">
        <span class="muted">Card ${state.labelingIndex + 1} of ${filtered.length}</span>
        <div class="visual-top-actions">
          <button class="secondary-button mini-button" id="previousLabelingCard" type="button">Previous card</button>
          <button class="secondary-button mini-button" id="shuffleLabeling" type="button">Shuffle</button>
          <button class="primary-button mini-button" id="nextLabelingCard" type="button">Next card</button>
        </div>
      </div>
      ${renderImageAnchor(card.reviewImage, `<img class="labeling-image" src="${escapeHtml(card.reviewImage)}" alt="Blank labeling image">`, card.label)}
      <div class="word-bank" aria-label="Word bank">
        ${(card.terms || []).map((term) => `<span class="word-chip">${escapeHtml(term)}</span>`).join('')}
      </div>
      <div class="study-card-actions">
        <button class="secondary-button label-toggle" type="button" data-answer="${escapeHtml(card.id)}">Show labeled answer</button>
      </div>
      <div class="label-answer hidden" id="label-answer-${escapeHtml(card.id)}">
        ${renderImageAnchor(card.labeledImage, `<img class="labeling-image" src="${escapeHtml(card.labeledImage)}" alt="Labeled answer image">`, card.label)}
        <div class="labeling-rating">${learningRatingButtons('data-label-rating')}</div>
      </div>
    </article>`
    : '<section class="panel"><span class="muted">No matching labeling images found.</span></section>';
  const toggle = document.querySelector('.label-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const answer = byId(`label-answer-${toggle.dataset.answer}`);
      const isHidden = answer.classList.toggle('hidden');
      toggle.textContent = isHidden ? 'Show labeled answer' : 'Hide labeled answer';
    });
  }
  document.querySelectorAll('[data-label-rating]').forEach((button) => {
    button.addEventListener('click', () => {
      recordLearningAttempt(labelingLearningCard(card, 'word-bank-labeling'), button.dataset.labelRating, 'word-bank-labeling');
      nextOrderedItem('labeling', filtered, renderLabeling);
      renderDashboard();
      scrollSectionToTop('labeling');
    });
  });
  const nextButton = byId('nextLabelingCard');
  if (nextButton) nextButton.addEventListener('click', () => {
    nextOrderedItem('labeling', filtered, renderLabeling);
    scrollSectionToTop('labeling');
  });
  const previousButton = byId('previousLabelingCard');
  if (previousButton) previousButton.addEventListener('click', () => {
    previousOrderedItem('labeling', filtered, renderLabeling);
    scrollSectionToTop('labeling');
  });
  const shuffleButton = byId('shuffleLabeling');
  if (shuffleButton) shuffleButton.addEventListener('click', () => {
    shuffleOrderedItems('labeling', filtered, renderLabeling);
    scrollSectionToTop('labeling');
  });
}

function renderPracticalLabeling() {
  const cards = data.practicalLabelingCards || [];
  const regions = ['All', ...unique(cards.map((card) => card.region).filter(Boolean))];
  if (!regions.includes(state.practicalLabelingRegion)) state.practicalLabelingRegion = 'All';
  renderSelectFilter(byId('practicalLabelingFilters'), regions, state.practicalLabelingRegion, (region) => {
    state.practicalLabelingRegion = region;
    state.practicalLabelingOrder = [];
    renderPracticalLabeling();
  }, 'Image set');
  const filtered = cards
    .filter((card) => state.practicalLabelingRegion === 'All' || card.region === state.practicalLabelingRegion)
    .filter((card) => includesSearch(card.label, card.region, card.sourceTitle));
  const key = `${state.practicalLabelingRegion}|${state.search}|${filtered.map((card) => card.id).join(',')}`;
  ensureCardOrder('practicalLabeling', filtered, key);
  const card = currentOrderedItem('practicalLabeling', filtered);
  byId('practicalLabelingCards').innerHTML = card
    ? `<article class="labeling-card single-study-card practical-labeling-card">
      <div class="study-card-topline">
        <span class="muted">Card ${state.practicalLabelingIndex + 1} of ${filtered.length}</span>
        <div class="visual-top-actions">
          <button class="secondary-button mini-button" id="previousPracticalLabelingCard" type="button">Previous card</button>
          <button class="secondary-button mini-button" id="shufflePracticalLabeling" type="button">Shuffle</button>
          <button class="primary-button mini-button" id="nextPracticalLabelingCard" type="button">Next card</button>
        </div>
      </div>
      ${renderImageAnchor(card.reviewImage, `<img class="labeling-image" src="${escapeHtml(card.reviewImage)}" alt="Blank practical labeling image">`, card.label)}
      <div class="study-card-actions">
        <button class="secondary-button practical-label-toggle" type="button" data-answer="${escapeHtml(card.id)}">Show labeled answer</button>
      </div>
      <div class="label-answer hidden" id="practical-label-answer-${escapeHtml(card.id)}">
        ${renderImageAnchor(card.labeledImage, `<img class="labeling-image" src="${escapeHtml(card.labeledImage)}" alt="Labeled answer image">`, card.label)}
        <div class="labeling-rating">${learningRatingButtons('data-practical-label-rating')}</div>
      </div>
    </article>`
    : '<section class="panel"><span class="muted">No matching practical labeling images found.</span></section>';
  const toggle = document.querySelector('.practical-label-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const answer = byId(`practical-label-answer-${toggle.dataset.answer}`);
      const isHidden = answer.classList.toggle('hidden');
      toggle.textContent = isHidden ? 'Show labeled answer' : 'Hide labeled answer';
    });
  }
  document.querySelectorAll('[data-practical-label-rating]').forEach((button) => {
    button.addEventListener('click', () => {
      recordLearningAttempt(labelingLearningCard(card, 'practical-labeling'), button.dataset.practicalLabelRating, 'practical-labeling');
      nextOrderedItem('practicalLabeling', filtered, renderPracticalLabeling);
      renderDashboard();
      scrollSectionToTop('practicalLabeling');
    });
  });
  const nextButton = byId('nextPracticalLabelingCard');
  if (nextButton) nextButton.addEventListener('click', () => {
    nextOrderedItem('practicalLabeling', filtered, renderPracticalLabeling);
    scrollSectionToTop('practicalLabeling');
  });
  const previousButton = byId('previousPracticalLabelingCard');
  if (previousButton) previousButton.addEventListener('click', () => {
    previousOrderedItem('practicalLabeling', filtered, renderPracticalLabeling);
    scrollSectionToTop('practicalLabeling');
  });
  const shuffleButton = byId('shufflePracticalLabeling');
  if (shuffleButton) shuffleButton.addEventListener('click', () => {
    shuffleOrderedItems('practicalLabeling', filtered, renderPracticalLabeling);
    scrollSectionToTop('practicalLabeling');
  });
}

function renderMuscles() {
  const groups = ['All', ...unique(data.muscles.map((muscle) => muscle.group))];
  renderSelectFilter(byId('muscleFilters'), groups, state.muscleGroup, (group) => {
    state.muscleGroup = group;
    renderMuscles();
  }, 'Muscle group');
  const root = byId('muscleTables');
  root.innerHTML = '';
  groups.filter((group) => group !== 'All').forEach((group) => {
    if (state.muscleGroup !== 'All' && state.muscleGroup !== group) return;
    const muscles = data.muscles
      .filter((muscle) => muscle.group === group)
      .filter((muscle) => includesSearch(muscle.group, muscle.muscle, muscle.origin, muscle.insertion, muscle.action));
    if (!muscles.length) return;
    const rows = muscles.map((muscle) => `<tr data-muscle-row="${escapeHtml(muscle.muscle)}">
      <td><strong>${visualLink(muscle.visualId, muscle.image, escapeHtml(muscle.muscle), muscle.muscle)}</strong></td>
      <td>${renderTextLinks(muscle.origin)}</td>
      <td>${renderTextLinks(muscle.insertion)}</td>
      <td>${escapeHtml(muscle.action)}</td>
      <td>${externalLinks({ label: 'Kenhub', url: muscle.kenhub })}</td>
      <td class="check-cell"><input class="row-check" type="checkbox" ${isChecked('muscle', muscle.muscle) ? 'checked' : ''} data-check-kind="muscle" data-check-id="${escapeHtml(muscle.muscle)}" aria-label="Mark ${escapeHtml(muscle.muscle)} OIA done"></td>
    </tr>`);
    const section = document.createElement('section');
    section.className = 'muscle-section';
    section.innerHTML = `<h3>${escapeHtml(group)}</h3><div class="table-wrap"><table class="data-table">${tableHtml(['Muscle', 'Origin', 'Insertion', 'Action', 'Links', 'Done'], rows, { widths: ['17%', '23%', '23%', '22%', '8%', '7%'] })}</table></div>`;
    root.append(section);
  });
  bindChecks();
  bindJumps();
}

function visualItems() {
  const boneLeaderItems = (data.boneLeaderCards || []).map((row) => ({
    id: row.id,
    kind: 'bone-leader',
    category: row.category || 'Bone ID',
    title: row.label || row.sourceTitle || 'Bone or marking',
    subtitle: [row.region || '', row.imageCount ? `${row.imageCount} views` : ''].filter(Boolean).join(' | '),
    code: '',
    reviewImage: row.reviewImage,
    reviewImages: row.reviewImages || [],
    labeledImage: row.labeledImage,
    labeledImages: row.labeledImages || [],
    answer: row.answer || 'Use the labeled answer image to check yourself.'
  }));
  const structureItems = (data.muscleImageCards || []).map((row) => ({
    id: row.id,
    kind: 'structure',
    category: row.category || 'Image ID',
    title: row.label || row.answer,
    subtitle: row.imageCount ? `${row.imageCount} views` : (row.sourceTitle || ''),
    code: '',
    reviewImage: row.reviewImage,
    reviewImages: row.reviewImages || [],
    labeledImage: row.labeledImage,
    labeledImages: row.labeledImages || [],
    answer: row.answer || row.label
  }));
  return [...boneLeaderItems, ...structureItems].filter((item) => item.reviewImage || item.labeledImage);
}

function imageItems(images, fallbackImage = '') {
  const rawItems = Array.isArray(images) && images.length ? images : (fallbackImage ? [{ image: fallbackImage }] : []);
  return rawItems
    .map((item) => typeof item === 'string' ? { image: item } : item)
    .filter((item) => item?.image);
}

function renderVisualImage(label, image, title) {
  return renderVisualImages(label, image ? [{ image }] : [], title);
}

function visualImageCaption(label, item, index) {
  return item.sourceTitle || item.sourceLabel || `${label} ${index + 1}`;
}

function renderVisualImageBlock(label, item, title, index = 0) {
  const caption = visualImageCaption(label, item, index);
  return `<div class="visual-image-block">
    ${renderImageAnchor(item.image, `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(label)}: ${escapeHtml(title)}">`, title)}
    <span class="visual-caption">${escapeHtml(caption)}</span>
  </div>`;
}

function renderVisualImages(label, images, title) {
  const items = imageItems(images);
  if (!items.length) return '';
  return `<div class="visual-image-grid">
    ${items.map((item, index) => renderVisualImageBlock(label, item, title, index)).join('')}
  </div>`;
}

function renderVisualMedia(item) {
  const reviewItems = imageItems(item.reviewImages, item.reviewImage);
  const labeledItems = imageItems(item.labeledImages, item.labeledImage);
  if (reviewItems.length === 1 && labeledItems.length) {
    return `<div class="visual-compare-grid">
      <section class="visual-compare-panel">
        <h4>Highlighted view</h4>
        ${renderVisualImageBlock('Highlighted view', reviewItems[0], item.title)}
      </section>
      <section class="visual-compare-panel">
        <h4>Labeled reference</h4>
        ${labeledItems.length === 1 ? renderVisualImageBlock('Labeled reference', labeledItems[0], item.title) : renderVisualImages('Labeled reference', labeledItems, item.title)}
      </section>
    </div>`;
  }
  return `
    ${renderVisualImages('Highlighted view', reviewItems, item.title)}
    ${labeledItems.length ? `<div class="visual-reference">
      <h4>Labeled reference</h4>
      ${renderVisualImages('Labeled reference', labeledItems, item.title)}
    </div>` : ''}
  `;
}

function renderVisualQuickLinks(items, currentItem) {
  if (!items.length) return '';
  const heading = state.visualCategory === 'All' ? 'Visual Library' : state.visualCategory;
  return `<aside class="visual-quick-panel" aria-label="Visual library quick links">
    <h3>${escapeHtml(heading)}</h3>
    <div class="visual-quick-list">
      ${items.map((item) => `<button class="visual-quick-link visual-jump ${item.id === currentItem.id ? 'active' : ''}" type="button" data-visual-id="${escapeHtml(item.id)}" ${item.id === currentItem.id ? 'aria-current="true"' : ''}>${escapeHtml(item.title)}</button>`).join('')}
    </div>
  </aside>`;
}

function scrollVisualToTop() {
  scrollSectionToTop('visuals');
}

function renderDrillImages(images, fallbackImage, label, options = {}) {
  const items = imageItems(images, fallbackImage);
  if (!items.length) return '';
  const showCaptions = options.showCaptions !== false;
  const altText = options.hideAnswerMetadata ? '' : label;
  const anchorLabel = options.hideAnswerMetadata ? 'Open full-size question image' : label;
  return `<div class="drill-image-grid">
    ${items.map((item) => `<figure>
      <span class="drill-image-frame">
        ${item.mirrored
          ? `<img class="mirrored-drill-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(altText)}">`
          : renderImageAnchor(item.image, `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(altText)}">`, anchorLabel)}
        ${item.stickerCode ? `<span class="sticker-badge" aria-label="Sticker code ${escapeHtml(item.stickerCode)}">${escapeHtml(item.stickerCode)}</span>` : ''}
        ${item.hideSideCues ? '<span class="side-cue-mask side-cue-mask-top" aria-hidden="true"></span><span class="side-cue-mask side-cue-mask-left" aria-hidden="true"></span>' : ''}
      </span>
      ${showCaptions && (item.sourceTitle || item.mirrored) ? `<figcaption>${escapeHtml(item.sourceTitle || '')}${item.mirrored ? `${item.sourceTitle ? ' | ' : ''}Mirrored for left/right practice` : ''}</figcaption>` : ''}
    </figure>`).join('')}
  </div>`;
}

function renderDrillBank(card) {
  if (!card?.banks) return '';
  const selections = state.oiaSelections[card.id] || {};
  if (card.correctSelections) {
    return Object.entries(card.banks).map(([label, values]) => `
      <section class="bank-group">
        <h4>${escapeHtml(label)}</h4>
        <select class="bank-select" data-oia-select="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
          <option value="">Choose ${escapeHtml(label.toLowerCase())}</option>
          ${(values || []).map((value) => `<option value="${escapeHtml(value)}" ${selections[label] === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
        </select>
        <span class="selection-feedback" data-oia-feedback="${escapeHtml(label)}"></span>
      </section>
    `).join('');
  }
  return Object.entries(card.banks).map(([label, values]) => `
    <section class="bank-group">
      <h4>${escapeHtml(label)}</h4>
      <div class="bank-chip-list">
        ${(values || []).map((value) => `<span class="bank-chip">${escapeHtml(value)}</span>`).join('')}
      </div>
    </section>
  `).join('');
}

function bindOiaSelectors(card) {
  document.querySelectorAll('[data-oia-select]').forEach((select) => {
    select.addEventListener('change', () => {
      const label = select.dataset.oiaSelect;
      state.oiaSelections[card.id] = { ...(state.oiaSelections[card.id] || {}), [label]: select.value };
      saveJson('ll_oia_selections', state.oiaSelections);
      state.objectiveRecordedCard = '';
      clearOiaFeedback();
    });
  });
}

function clearOiaFeedback() {
  document.querySelectorAll('[data-oia-feedback]').forEach((node) => {
    node.textContent = '';
    node.classList.remove('correct', 'missed');
  });
}

function updateOiaFeedback(card) {
  if (!card?.correctSelections) return;
  const selections = state.oiaSelections[card.id] || {};
  Object.entries(card.correctSelections).forEach(([label, correct]) => {
    const node = document.querySelector(`[data-oia-feedback="${CSS.escape(label)}"]`);
    if (!node) return;
    const selected = selections[label] || '';
    const isCorrect = selected === correct;
    node.textContent = isCorrect ? 'Correct' : `Correct answer: ${correct}`;
    node.classList.toggle('correct', isCorrect);
    node.classList.toggle('missed', !isCorrect);
  });
}

function drillUsesTextResponse(card) {
  return Boolean(card?.textResponse);
}

function renderDrillResponse(card) {
  if (!drillUsesTextResponse(card)) return '';
  const value = state.drillAnswers[card.id] || '';
  return `<div class="drill-response-card">
    <label>
      <span>Your answer</span>
      <textarea id="drillAnswerInput" placeholder="${escapeHtml(card.responsePlaceholder || 'Type your answer before revealing.')}">${escapeHtml(value)}</textarea>
    </label>
    <span class="answer-feedback" id="drillAnswerFeedback"></span>
  </div>`;
}

function bindDrillResponse(card) {
  const input = byId('drillAnswerInput');
  if (!input) return;
  input.addEventListener('input', () => {
    state.drillAnswers[card.id] = input.value;
    saveJson('ll_drill_answers', state.drillAnswers);
  });
}

function updateTextResponseFeedback(card) {
  if (!drillUsesTextResponse(card)) return;
  const node = byId('drillAnswerFeedback');
  if (!node) return;
  const value = (state.drillAnswers[card.id] || '').trim();
  node.textContent = value ? `You wrote: ${value}` : 'No answer typed before reveal.';
}

function renderVisuals() {
  const items = visualItems();
  const categories = ['All', ...unique(items.map((item) => item.category))];
  if (!categories.includes(state.visualCategory)) state.visualCategory = 'All';
  renderSegmented(byId('visualFilters'), categories, state.visualCategory, (category) => {
    state.visualCategory = category;
    state.visualOrder = [];
    renderVisuals();
  });

  const filtered = items
    .filter((item) => state.visualCategory === 'All' || item.category === state.visualCategory)
    .filter((item) => includesSearch(item.title, item.subtitle, item.code, item.category));
  const key = visualFilterKey(filtered);
  ensureCardOrder('visual', filtered, key);
  const item = currentOrderedItem('visual', filtered);
  byId('visualGallery').innerHTML = item
    ? `<div class="visual-layout">
      <article class="visual-card single-study-card">
        <div class="study-card-topline">
          <span class="muted">Card ${state.visualIndex + 1} of ${filtered.length}</span>
          <div class="visual-top-actions">
            <button class="secondary-button mini-button" id="previousVisualCard" type="button">Previous card</button>
            <button class="secondary-button mini-button" id="shuffleVisuals" type="button">Shuffle</button>
            <button class="primary-button mini-button" id="nextVisualCard" type="button">Next card</button>
          </div>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="visual-card-meta">${escapeHtml(item.category)}${item.subtitle ? ` | ${escapeHtml(item.subtitle)}` : ''}</div>
        ${imageItems(item.reviewImages, item.reviewImage).length > 1 ? '<p class="visual-note">All highlighted images on this card point to the same structure, marking, or muscle.</p>' : ''}
        ${renderVisualMedia(item)}
      </article>
      ${renderVisualQuickLinks(filtered, item)}
    </div>`
    : '<section class="panel"><span class="muted">No matching images found.</span></section>';
  const previousButton = byId('previousVisualCard');
  if (previousButton) previousButton.addEventListener('click', () => {
    previousOrderedItem('visual', filtered, renderVisuals);
    scrollVisualToTop();
  });
  const nextButton = byId('nextVisualCard');
  if (nextButton) nextButton.addEventListener('click', () => {
    nextOrderedItem('visual', filtered, renderVisuals);
    scrollVisualToTop();
  });
  const shuffleButton = byId('shuffleVisuals');
  if (shuffleButton) shuffleButton.addEventListener('click', () => {
    shuffleOrderedItems('visual', filtered, renderVisuals);
    scrollVisualToTop();
  });
  bindJumps();
}

function visualFilterKey(items) {
  return `${state.visualCategory}|${state.search}|${items.map((item) => item.id).join(',')}`;
}

function jumpToVisual(visualId) {
  const items = visualItems();
  const target = items.find((item) => item.id === visualId);
  if (!target) return;
  clearSearchInput();
  state.visualCategory = target.category || 'All';
  const filtered = items.filter((item) => state.visualCategory === 'All' || item.category === state.visualCategory);
  const targetIndex = filtered.findIndex((item) => item.id === visualId);
  state.visualOrder = filtered.map((_item, index) => index);
  state.visualIndex = targetIndex >= 0 ? targetIndex : 0;
  state.visualKey = visualFilterKey(filtered);
  activateView('visuals');
  scrollVisualToTop();
}

function renderSimpleTable(id, headers, rows, keys, widths = []) {
  byId(id).innerHTML = tableHtml(
    headers,
    rows
      .filter((row) => includesSearch(...keys.map((key) => row[key])))
      .map((row) => `<tr>${keys.map((key) => `<td>${renderTextLinks(row[key])}</td>`).join('')}</tr>`),
    { widths }
  );
  bindJumps();
}

function renderDifferentiation() {
  renderSimpleTable('confusablesTable', ['Pair', 'Why it is confusing', 'Fast separator'], data.confusables, ['pair', 'why', 'separator'], ['28%', '32%', '40%']);
  renderSimpleTable('actionLookupTable', ['Action', 'Likely muscles', 'How to narrow it'], data.actionLookup, ['action', 'muscles', 'narrow'], ['24%', '40%', '36%']);
  renderSimpleTable('anchorMapTable', ['Landmark', 'Muscles', 'Role', 'Separator'], data.anchorMaps, ['landmark', 'muscles', 'role', 'separator'], ['25%', '35%', '12%', '28%']);
}

function renderCram() {
  renderSimpleTable('cramTable', ['Final-review cue', 'Say from memory', 'Why it matters'], data.cramSheet, ['cue', 'memory', 'why'], ['25%', '43%', '32%']);
  renderSimpleTable('outLoudTable', ['Prompt type', 'Say this sequence', 'Pass standard'], data.outLoudPrompts, ['type', 'sequence', 'standard'], ['24%', '45%', '31%']);
  renderSimpleTable('reverseTable', ['Prompt', 'Answer'], data.reversePrompts, ['prompt', 'answer'], ['72%', '28%']);
}

const DRILL_MODES = {
  oiaReverse: {
    label: 'OIA Reverse Recall',
    subtitle: 'Recall muscles from origin, insertion, action, and cue prompts.',
    what: 'Reverse prompts that make you produce the answer from memory instead of recognizing it.',
    know: 'Connect course muscle names to their origins, insertions, actions, and shorthand cues.',
    use: 'Answer out loud before revealing, then mark missed cards so they return on the dashboard.'
  },
  actionLookup: {
    label: 'Action Lookup',
    subtitle: 'Start with an action and retrieve the likely muscles.',
    what: 'Action-first cards that ask which muscles can produce a movement and how to narrow the answer.',
    know: 'Know the muscle set for each action and the anatomical clue that separates close options.',
    use: 'Use this after the OIA table when you need to move from movement language back to muscle names.'
  },
  retrieval: {
    label: 'Retrieval Drills',
    subtitle: 'Mixed image and model identification for practical readiness.',
    what: 'Image and model-tag decks for identifying highlighted structures without a word bank.',
    know: 'Recognize bones, markings, muscles, and model tags from the image rather than from list order.',
    use: 'Shuffle decks, reveal only after committing to an answer, and revisit missed cards in Visuals or the checklist pages.'
  },
  leftRight: {
    label: 'Left/Right ID',
    subtitle: 'Practice side recognition on original and mirrored full-bone images.',
    what: 'Full-bone cards shown in their source orientation or mirrored to simulate the opposite side.',
    know: 'Decide whether the image represents a left or right bone. Patella is excluded, and foot images use top or bottom views only.',
    use: 'Use Quiz me for a scored view-and-side check. Muscle ID does not use left/right side calls in this guide.'
  },
  sticker: {
    label: 'Sticker Practical',
    subtitle: 'Answer practical-style sticker prompts from highlighted model images.',
    what: 'Simulated sticker-code questions such as "What is labeled 2B?" using verified highlighted images.',
    know: 'Identify the labeled bone marking or muscle from the image, without a word bank.',
    use: 'Use this as a practice approximation until actual stickered model photos are available.'
  },
  oiaBank: {
    label: 'OIA Practice',
    subtitle: 'Match a muscle to its origin, insertion, and action from dropdown banks.',
    what: 'Muscle OIA prompts with origin, insertion, and action choices shown as dropdown banks.',
    know: 'For each muscle, pick the correct origin, insertion, and action before revealing the answer.',
    use: 'Practice in the same direction as the exam prompt: muscle name first, OIA answer from a bank.'
  }
};

const DECK_DISPLAY_NAMES = {
  'OIA reverse recall': 'OIA Reverse Recall',
  'Action lookup': 'Action Lookup'
};

const STICKER_LETTERS = ['A', 'B', 'C', 'D'];

function sideFromTitle(title) {
  const text = normalize(title);
  if (text.includes('right')) return 'Right';
  if (text.includes('left')) return 'Left';
  return '';
}

function isFullBoneSideVisual(visual) {
  const title = normalize(visual.title);
  if (!visual.reviewImage || !sideFromTitle(visual.title) || normalize(visual.category).includes('muscle')) return false;
  const excluded = ['proximal end', 'distal end', 'hip joint', 'joint', 'articulated', 'pelves', 'pelvis', 'osteon', 'section', 'differences'];
  if (excluded.some((term) => title.includes(term))) return false;
  if (title.includes('patella')) return false;
  if (title.includes('hip bone')) return title.includes('right side') || title.includes('left side');
  if (title.includes('bones of the foot')) return title.includes('superior view') || title.includes('inferior view');
  return ['femur', 'tibia', 'fibula', 'patella', 'bones of the foot'].some((term) => title.includes(term));
}

function oppositeSide(side) {
  return side === 'Right' ? 'Left' : (side === 'Left' ? 'Right' : '');
}

function viewFromTitle(title) {
  const text = normalize(title);
  if (text.includes('anterior view')) return 'Anterior';
  if (text.includes('posterior view')) return 'Posterior';
  if (text.includes('superior view')) return 'Superior';
  if (text.includes('inferior view')) return 'Inferior';
  return '';
}

function sideNeutralTitle(title) {
  const neutral = String(title || 'Bone')
    .replace(/,?\s*(left|right) side/ig, '')
    .replace(/\b(left|right)\s+(ilium|ischium|pubis)\b/ig, '$2')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return neutral || 'Bone';
}

function stickerCode(index) {
  return `${Math.floor(index / STICKER_LETTERS.length) + 1}${STICKER_LETTERS[index % STICKER_LETTERS.length]}`;
}

function imageCardItem(row, options = {}) {
  return {
    image: row.reviewImage,
    sourceTitle: options.sourceTitle ?? row.sourceTitle,
    mirrored: Boolean(options.mirrored),
    stickerCode: options.stickerCode || '',
    hideSideCues: Boolean(options.hideSideCues)
  };
}

function sortedUnique(values) {
  return unique(values.filter(Boolean)).sort((a, b) => a.localeCompare(b));
}

function muscleStatusGroup(muscle) {
  return {
    id: `muscle-${muscle}`,
    statusLabel: muscle,
    statusLinkType: 'muscle',
    statusLinkTarget: muscle
  };
}

function muscleStatusGroupsFromText(text) {
  const source = normalize(text);
  const seen = new Set();
  const groups = [];
  data.muscles.forEach((muscle) => {
    const name = muscle.muscle;
    const key = normalize(name);
    if (!key || !source.includes(key) || seen.has(key)) return;
    seen.add(key);
    groups.push(muscleStatusGroup(name));
  });
  return groups.sort((a, b) => a.statusLabel.localeCompare(b.statusLabel));
}

function modelImagePrompt(item) {
  if (item.sourceKind === 'lab-model-photo') return 'Identify the tagged muscle on this lab model photograph.';
  if (item.sourceKind === 'course-practical-image') return 'Identify the tagged muscle in this course practical image.';
  if (item.assessmentContext === 'face-image') return 'Identify the highlighted facial muscle from this image.';
  if (item.assessmentContext === 'single-leg-model') return 'Identify the highlighted muscle. This PAL image supports practice for the single-leg model.';
  if (item.assessmentContext === 'arm-model') return 'Identify the highlighted muscle. This PAL image supports practice for the arm model.';
  if (item.assessmentContext === 'torso-fallback') return 'Identify the highlighted muscle. This torso-focused PAL image is used because the item is not on a tested limb model.';
  return 'Identify the highlighted muscle. This PAL atlas image is a clearly labeled substitute.';
}

function renderImageSourceNotice(card) {
  if (!card?.sourceTypeLabel) return '';
  const source = data.modelImageSourceLegend?.[card.sourceKind] || {};
  const description = card.sourceDescription || source.description || '';
  return `<div class="image-source-note" data-source-kind="${escapeHtml(card.sourceKind || '')}">
    <span class="image-source-badge" data-source-kind="${escapeHtml(card.sourceKind || '')}">${escapeHtml(card.sourceTypeLabel)}</span>
    ${card.assessmentContextLabel ? `<span class="assessment-context-badge" data-assessment-context="${escapeHtml(card.assessmentContext || '')}">${escapeHtml(card.assessmentContextLabel)}</span>` : ''}
    ${description ? `<span>${escapeHtml(description)}</span>` : ''}
  </div>`;
}

function drillDecks() {
  const decks = {
    'OIA reverse recall': data.reversePrompts.map((row, index) => {
      const statusGroups = muscleStatusGroupsFromText(row.answer);
      return {
        id: `reverse-${index}`,
        prompt: row.prompt,
        answer: row.answer,
        statusLabel: row.answer,
        statusGroups
      };
    }),
    'Action lookup': data.actionLookup.map((row) => {
      const statusGroups = muscleStatusGroupsFromText(row.muscles);
      return {
        id: `action-${row.action}`,
        prompt: row.action,
        answer: `${row.muscles}; ${row.narrow}`,
        statusLabel: row.action,
        statusGroups
      };
    })
  };
  const boneDeckSource = (data.boneLeaderCards || []).length ? data.boneLeaderCards : (data.boneImageCards || []);
  const boneImageCards = boneDeckSource.map((row) => ({
    id: `bone-image-${row.id}`,
    label: row.label || row.sourceTitle || 'Bone or marking',
    prompt: row.reviewImage ? 'Identify the highlighted bone or marking' : 'Identify the course-listed bones or markings you can recognize in this view',
    answer: row.answer,
    image: row.reviewImage,
    images: row.reviewImages || [],
    answerImage: row.labeledImage,
    answerImages: row.labeledImages || [],
    textResponse: true,
    responsePlaceholder: 'Type the highlighted bone or marking before revealing.',
    statusLabel: row.answer || row.label || row.sourceTitle || 'Bone or marking',
    statusLinkType: 'visual',
    statusLinkTarget: row.id
  }));
  const muscleImageCards = (data.muscleImageCards || [])
    .filter((row) => row.reviewImage)
    .map((row) => ({
      id: `muscle-image-${row.id}`,
      label: row.label,
      prompt: 'Identify the highlighted structure',
      answer: row.answer,
      image: row.reviewImage,
      images: row.reviewImages || [],
      answerImage: row.labeledImage,
      answerImages: row.labeledImages || [],
      textResponse: true,
      responsePlaceholder: 'Type the highlighted muscle before revealing.',
      statusLabel: row.answer || row.label,
      statusLinkType: 'visual',
      statusLinkTarget: row.id
    }));
  if (boneImageCards.length) decks['Image ID: Bones'] = boneImageCards;
  if (muscleImageCards.length) decks['Image ID: Muscles'] = muscleImageCards;
  if (boneImageCards.length && muscleImageCards.length) decks['Image ID: Mixed'] = [...boneImageCards, ...muscleImageCards];
  const usingCroppedLeftRight = (data.leftRightImages || []).length > 0;
  const leftRightSource = usingCroppedLeftRight ? data.leftRightImages : (data.palVisuals || []).filter(isFullBoneSideVisual);
  const leftRightCards = leftRightSource
    .flatMap((row) => {
      const sourceSide = row.sourceSide || sideFromTitle(row.title) || 'Right';
      const mirroredSide = oppositeSide(sourceSide);
      const view = viewFromTitle(row.title);
      const label = sideNeutralTitle(row.title);
      const statusGroups = [{
        id: `left-right-source-${row.id}`,
        statusLabel: label,
        statusLinkType: 'image',
        statusLinkTarget: row.reviewImage
      }];
      return [
        {
          id: `left-right-${row.id}-source`,
          label: `${label} (${sourceSide})`,
          prompt: 'Identify the view, then decide whether the bone(s) shown belong to the anatomical left or right side of the body.',
          answer: `${sourceSide} side. View: ${view || 'review the image orientation'}. Source view: ${label}.`,
          images: [imageCardItem(row, { sourceTitle: '', hideSideCues: !usingCroppedLeftRight })],
          side: sourceSide,
          view,
          textResponse: true,
          responsePlaceholder: 'Type left, right, or unsure.',
          statusLabel: label,
          statusLinkType: 'image',
          statusLinkTarget: row.reviewImage,
          statusGroups
        },
        {
          id: `left-right-${row.id}-mirrored`,
          label: `${label} (${mirroredSide})`,
          prompt: 'Identify the view, then decide whether the bone(s) shown belong to the anatomical left or right side of the body.',
          answer: `${mirroredSide} side. View: ${view || 'review the image orientation'}. Source image mirrored from: ${label}.`,
          images: [imageCardItem(row, { mirrored: true, sourceTitle: '', hideSideCues: !usingCroppedLeftRight })],
          side: mirroredSide,
          view,
          textResponse: true,
          responsePlaceholder: 'Type left, right, or unsure.',
          statusLabel: label,
          statusLinkType: 'image',
          statusLinkTarget: row.reviewImage,
          statusGroups
        }
      ];
    });
  if (leftRightCards.length) decks['Left/Right ID: Full Bones'] = leftRightCards;
  const stickerBoneCards = boneDeckSource
    .filter((row) => row.reviewImage)
    .map((row, index) => {
      const code = stickerCode(index);
      const label = row.label || row.sourceTitle || 'Bone or marking';
      return {
        id: `sticker-bone-${row.id}`,
        label: `${code}: ${label}`,
        prompt: `What bone or marking is labeled ${code}?`,
        answer: row.answer || label,
        images: [imageCardItem(row, { stickerCode: code })],
        answerImages: row.labeledImages || [],
        textResponse: true,
        responsePlaceholder: `Type the structure labeled ${code}.`,
        statusLabel: row.answer || label,
        statusLinkType: 'visual',
        statusLinkTarget: row.id
      };
    });
  const stickerMuscleCards = (data.muscleImageCards || [])
    .filter((row) => row.reviewImage)
    .map((row, index) => {
      const code = stickerCode(index + stickerBoneCards.length);
      const label = row.label || 'Muscle';
      return {
        id: `sticker-muscle-${row.id}`,
        label: `${code}: ${label}`,
        prompt: `What muscle is labeled ${code}?`,
        answer: row.answer || label,
        images: [imageCardItem(row, { stickerCode: code })],
        answerImages: row.labeledImages || [],
        textResponse: true,
        responsePlaceholder: `Type the muscle labeled ${code}.`,
        statusLabel: row.answer || label,
        statusLinkType: 'visual',
        statusLinkTarget: row.id
      };
    });
  if (stickerBoneCards.length) decks['Sticker Practical: Bones and Markings'] = stickerBoneCards;
  if (stickerMuscleCards.length) decks['Sticker Practical: Muscles'] = stickerMuscleCards;
  if (stickerBoneCards.length && stickerMuscleCards.length) decks['Sticker Practical: Mixed'] = [...stickerBoneCards, ...stickerMuscleCards];
  const oiaBanks = {
    Origins: sortedUnique(data.muscles.map((muscle) => muscle.origin)),
    Insertions: sortedUnique(data.muscles.map((muscle) => muscle.insertion)),
    Actions: sortedUnique(data.muscles.map((muscle) => muscle.action))
  };
  const oiaBankCards = data.muscles.map((muscle) => ({
    id: `oia-bank-${muscle.muscle}`,
    label: muscle.muscle,
    prompt: `Identify the origin, insertion, and action of ${muscle.muscle}.`,
    answer: `Origin: ${muscle.origin}; Insertion: ${muscle.insertion}; Action: ${muscle.action}`,
    answerHtml: `<strong>Origin:</strong> ${escapeHtml(muscle.origin)}<br><strong>Insertion:</strong> ${escapeHtml(muscle.insertion)}<br><strong>Action:</strong> ${escapeHtml(muscle.action)}`,
    banks: oiaBanks,
    correctSelections: {
      Origins: muscle.origin,
      Insertions: muscle.insertion,
      Actions: muscle.action
    },
    statusLabel: muscle.muscle,
    statusLinkType: 'muscle',
    statusLinkTarget: muscle.muscle
  }));
  if (oiaBankCards.length) decks['OIA Practice'] = oiaBankCards;
  const imageCards = data.modelKey
    .flatMap((row) => {
      const images = modelImageItems(row, true);
      return images.map((item, index) => ({
        id: `model-image-${row.number}-${index}`,
        label: `${item.sourceTypeLabel || 'Muscle ID image'} ${index + 1}`,
        prompt: modelImagePrompt(item),
        answer: `${row.item}${row.note ? `; ${row.note}` : ''}`,
        images: [item],
        answerImages: item.labeledImage ? [{ image: item.labeledImage, sourceTitle: item.sourceTitle || 'Labeled reference' }] : [],
        sourceKind: item.sourceKind,
        sourceTypeLabel: item.sourceTypeLabel,
        sourceDescription: item.sourceDescription,
        assessmentContext: item.assessmentContext,
        assessmentContextLabel: item.assessmentContextLabel,
        samplingKey: row.item,
        textResponse: true,
        responsePlaceholder: 'Type the muscle before revealing.',
        statusLabel: row.item,
        statusLinkType: 'muscle',
        statusLinkTarget: row.item
      }));
    });
  if (imageCards.length) decks['Model Image ID'] = imageCards;
  return Object.fromEntries(
    Object.entries(decks).map(([deckName, cards]) => [
      deckName,
      cards.map((card) => cardLearningMetadata(card, deckName))
    ])
  );
}

function deckDisplayName(deckName) {
  return DECK_DISPLAY_NAMES[deckName] || deckName;
}

function deckNamesForMode(decks, mode = state.drillMode) {
  const names = Object.keys(decks);
  if (mode === 'oiaReverse') return names.filter((name) => name === 'OIA reverse recall');
  if (mode === 'actionLookup') return names.filter((name) => name === 'Action lookup');
  if (mode === 'leftRight') return names.filter((name) => name.startsWith('Left/Right ID'));
  if (mode === 'sticker') return names.filter((name) => name.startsWith('Sticker Practical'));
  if (mode === 'oiaBank') return names.filter((name) => name === 'OIA Practice');
  const retrievalNames = names.filter((name) =>
    name !== 'OIA reverse recall' &&
    name !== 'Action lookup' &&
    !name.startsWith('Left/Right ID') &&
    !name.startsWith('Sticker Practical') &&
    name !== 'OIA Practice'
  );
  return retrievalNames.length ? retrievalNames : names;
}

function drillModeForDeckName(deckName) {
  if (deckName === 'OIA reverse recall') return 'oiaReverse';
  if (deckName === 'Action lookup') return 'actionLookup';
  if (deckName.startsWith('Left/Right ID')) return 'leftRight';
  if (deckName.startsWith('Sticker Practical')) return 'sticker';
  if (deckName === 'OIA Practice') return 'oiaBank';
  return 'retrieval';
}

function setDrillMode(mode, decks = drillDecks()) {
  const previousMode = state.drillMode;
  state.drillMode = DRILL_MODES[mode] ? mode : 'retrieval';
  if (previousMode !== state.drillMode) {
    state.deckStatusVisible = false;
    if (state.drillMode !== 'leftRight') {
      state.leftRightQuiz = { active: false, complete: false, size: 5, order: [], index: 0, results: [], sideChoice: '', viewChoice: '' };
    }
  }
  const deckNames = deckNamesForMode(decks, state.drillMode);
  if (!deckNames.includes(state.deckName)) {
    state.deckName = deckNames[0] || Object.keys(decks)[0] || '';
    state.deckOrder = [];
    state.deckIndex = 0;
  }
}

function renderDrillModeControls() {
  const root = byId('drillModeControls');
  if (!root) return;
  root.innerHTML = Object.entries(DRILL_MODES).map(([mode, config]) => `
    <button class="secondary-button mini-button mode-button ${mode === state.drillMode ? 'active' : ''}" type="button" data-drill-mode="${escapeHtml(mode)}">${escapeHtml(config.label)}</button>
  `).join('');
  root.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.drillMode !== button.dataset.drillMode) pushNavigationHistory();
      setDrillMode(button.dataset.drillMode);
      renderDrills();
      updateNavActive();
      updateBackButton();
    });
  });
}

function renderDrillGuide() {
  const config = DRILL_MODES[state.drillMode] || DRILL_MODES.retrieval;
  const guide = byId('drillGuide');
  byId('drillModeTitle').textContent = config.label;
  byId('drillModeSubtitle').textContent = config.subtitle;
  guide.dataset.collapsed = 'false';
  guide.innerHTML = `
    <div><strong>What this is</strong><span>${escapeHtml(config.what)}</span></div>
    <div><strong>What to know</strong><span>${escapeHtml(config.know)}</span></div>
    <div><strong>How to use it</strong><span>${escapeHtml(config.use)}</span></div>
  `;
  collapseStudyGuide(guide);
}

function findDrillCard(cardId) {
  for (const [deckName, deck] of Object.entries(drillDecks())) {
    const index = deck.findIndex((card) => card.id === cardId);
    if (index >= 0) return { deckName, deck, index, card: deck[index], mode: drillModeForDeckName(deckName) };
  }
  return null;
}

function drillCardLabel(cardId) {
  const card = findDrillCard(cardId)?.card;
  return deckStatusLabel(card) || cardId.replace(/^[^-]+-/, '');
}

function deckStatusLabel(item) {
  return item?.statusLabel || item?.answer || item?.label || item?.prompt || '';
}

function deckStatusLink(item) {
  const label = deckStatusLabel(item);
  if (!label) return '';
  if (item.statusLinkType === 'visual' && item.statusLinkTarget) {
    return `<button class="link-button visual-jump" type="button" data-visual-id="${escapeHtml(item.statusLinkTarget)}">${escapeHtml(label)}</button>`;
  }
  if (item.statusLinkType === 'muscle' && item.statusLinkTarget) {
    return `<button class="link-button muscle-jump" type="button" data-muscle="${escapeHtml(item.statusLinkTarget)}">${escapeHtml(label)}</button>`;
  }
  if (item.statusLinkType === 'bone' && item.statusLinkTarget) {
    return `<button class="link-button bone-jump" type="button" data-bone="${escapeHtml(item.statusLinkTarget)}">${escapeHtml(label)}</button>`;
  }
  if (item.statusLinkType === 'image' && item.statusLinkTarget) {
    return `<a class="image-text-link" href="${escapeHtml(item.statusLinkTarget)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }
  return `<span>${escapeHtml(label)}</span>`;
}

function statusGroupsForCard(card, groupedDeck = false) {
  if (Array.isArray(card.statusGroups) && !card.statusGroups.length && groupedDeck) return [];
  const groups = Array.isArray(card.statusGroups) && card.statusGroups.length ? card.statusGroups : [card];
  return groups.map((group) => ({
    id: group.id || card.id,
    statusLabel: group.statusLabel || group.label || deckStatusLabel(card),
    statusLinkType: group.statusLinkType || group.linkType || card.statusLinkType,
    statusLinkTarget: group.statusLinkTarget || group.linkTarget || card.statusLinkTarget,
    cardIds: [card.id]
  })).filter((group) => group.statusLabel);
}

function aggregateStatus(cardIds) {
  const statuses = cardIds.map((cardId) => state.drill[cardId]).filter(Boolean);
  if (statuses.includes('missed')) return 'missed';
  if (statuses.includes('correct')) return 'correct';
  return '';
}

function deckStatusRows(deck) {
  const groupedDeck = deck.some((card) => Array.isArray(card.statusGroups));
  const grouped = new Map();
  deck.forEach((card) => {
    statusGroupsForCard(card, groupedDeck).forEach((group) => {
      const existing = grouped.get(group.id);
      if (existing) {
        existing.cardIds.push(card.id);
      } else {
        grouped.set(group.id, { ...group, cardIds: [card.id] });
      }
    });
  });
  return [...grouped.values()].map((group) => ({
    ...group,
    status: aggregateStatus(group.cardIds)
  }));
}

function jumpToDrillCard(cardId) {
  const hit = findDrillCard(cardId);
  if (!hit) return;
  state.drillMode = hit.mode;
  state.deckName = hit.deckName;
  state.deckOrder = hit.deck.map((_card, index) => index);
  state.deckIndex = hit.index;
  activateView('drills');
  scrollSectionToTop('drills');
}

function shuffledDeckOrder(deck) {
  return deck
    .map((_card, index) => index)
    .sort(() => Math.random() - 0.5);
}

function ensureDeckOrder(deck) {
  if (!state.deckOrder.length || state.deckOrder.some((index) => index >= deck.length)) {
    state.deckOrder = shuffledDeckOrder(deck);
    state.deckIndex = 0;
  }
}

function leftRightQuizCard(deck) {
  if (state.drillMode !== 'leftRight' || !state.leftRightQuiz.active) return null;
  const index = state.leftRightQuiz.order[state.leftRightQuiz.index];
  return deck[index] || null;
}

function renderLeftRightQuizPanel(deck) {
  const root = byId('leftRightQuizPanel');
  if (!root) return;
  if (state.drillMode !== 'leftRight') {
    root.classList.add('hidden');
    root.innerHTML = '';
    return;
  }
  root.classList.remove('hidden');
  const quiz = state.leftRightQuiz;
  if (quiz.active) {
    const total = quiz.order.length;
    const sideChoices = ['Left', 'Right', 'Unsure'];
    const viewChoices = ['Anterior', 'Posterior', 'Superior', 'Inferior', 'Unsure'];
    root.innerHTML = `
      <h3>Quiz me</h3>
      <p>Question ${quiz.index + 1} of ${total}. Choose the view and the side. Unsure is tracked separately.</p>
      <div class="choice-group">
        <span>View</span>
        <div class="choice-button-row">
          ${viewChoices.map((choice) => `<button class="secondary-button mini-button choice-button ${choice === quiz.viewChoice ? 'active' : ''}" type="button" data-quiz-view="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join('')}
        </div>
        <span>Side</span>
        <div class="choice-button-row">
          ${sideChoices.map((choice) => `<button class="secondary-button mini-button choice-button ${choice === quiz.sideChoice ? 'active' : ''}" type="button" data-quiz-side="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join('')}
        </div>
      </div>
      <div class="quiz-choice-row">
        <button class="primary-button" id="submitLeftRightQuiz" type="button">Submit answer</button>
        <button class="secondary-button" id="cancelLeftRightQuiz" type="button">Cancel quiz</button>
      </div>
    `;
  } else if (quiz.complete) {
    const correct = quiz.results.filter((result) => result.correct).length;
    const unsure = quiz.results.filter((result) => result.sideChoice === 'Unsure' || result.viewChoice === 'Unsure').length;
    const wrong = quiz.results.length - correct - unsure;
    root.innerHTML = `
      <h3>Quiz results</h3>
      <p>Score: ${correct} / ${quiz.results.length}. Wrong: ${wrong}. Unsure: ${unsure}.</p>
      <div class="quiz-controls">
        <button class="primary-button" id="restartLeftRightQuiz" type="button">Start another quiz</button>
        <button class="secondary-button" id="clearLeftRightQuiz" type="button">Clear results</button>
      </div>
      <div class="quiz-results">
        ${quiz.results.map((result) => `<div class="quiz-result-row">
          <span class="status-pill ${result.correct ? '' : 'missed'}">${escapeHtml(result.correct ? 'correct' : 'missed')}</span>
          <span>${escapeHtml(result.label)} | view: ${escapeHtml(result.viewChoice)} / ${escapeHtml(result.correctView || 'not listed')} | side: ${escapeHtml(result.sideChoice)} / ${escapeHtml(result.correctSide)}</span>
        </div>`).join('')}
      </div>
    `;
  } else {
    const max = deck.length;
    const options = [5, 10, 20, 30].filter((count) => count < max);
    options.push(max);
    root.innerHTML = `
      <h3>Quiz me</h3>
      <p>Start a side-and-view quiz with random full-bone images. The quiz hides reveal controls and scores side plus view choices.</p>
      <div class="quiz-controls">
        <label class="quiz-field">
          <span>Number of images</span>
          <select id="leftRightQuizSize">
            ${options.map((count) => `<option value="${count}" ${count === Math.min(5, max) ? 'selected' : ''}>${count === max ? `All ${max}` : count}</option>`).join('')}
          </select>
        </label>
        <button class="primary-button" id="startLeftRightQuiz" type="button">Start quiz</button>
      </div>
    `;
  }
  bindLeftRightQuizControls(deck);
}

function bindLeftRightQuizControls(deck) {
  const start = byId('startLeftRightQuiz');
  if (start) start.addEventListener('click', () => {
    const size = Number(byId('leftRightQuizSize')?.value || 5);
    state.leftRightQuiz = {
      active: true,
      complete: false,
      size,
      order: shuffledDeckOrder(deck).slice(0, Math.min(size, deck.length)),
      index: 0,
      results: [],
      sideChoice: '',
      viewChoice: ''
    };
    renderDrills();
  });
  const cancel = byId('cancelLeftRightQuiz');
  if (cancel) cancel.addEventListener('click', () => {
    state.leftRightQuiz = { active: false, complete: false, size: 5, order: [], index: 0, results: [], sideChoice: '', viewChoice: '' };
    renderDrills();
  });
  const restart = byId('restartLeftRightQuiz');
  if (restart) restart.addEventListener('click', () => {
    state.leftRightQuiz = { active: false, complete: false, size: 5, order: [], index: 0, results: [], sideChoice: '', viewChoice: '' };
    renderDrills();
  });
  const clear = byId('clearLeftRightQuiz');
  if (clear) clear.addEventListener('click', () => {
    state.leftRightQuiz = { active: false, complete: false, size: 5, order: [], index: 0, results: [], sideChoice: '', viewChoice: '' };
    renderDrills();
  });
  document.querySelectorAll('[data-quiz-side]').forEach((button) => {
    button.addEventListener('click', () => {
      state.leftRightQuiz.sideChoice = button.dataset.quizSide;
      renderDrills();
    });
  });
  document.querySelectorAll('[data-quiz-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.leftRightQuiz.viewChoice = button.dataset.quizView;
      renderDrills();
    });
  });
  byId('submitLeftRightQuiz')?.addEventListener('click', () => recordLeftRightQuizChoice(deck));
}

function recordLeftRightQuizChoice(deck) {
  const card = leftRightQuizCard(deck);
  if (!card) return;
  const correctSide = card.side || '';
  const correctView = card.view || '';
  const sideChoice = state.leftRightQuiz.sideChoice || 'Unsure';
  const viewChoice = state.leftRightQuiz.viewChoice || 'Unsure';
  state.leftRightQuiz.results.push({
    cardId: card.id,
    label: card.label,
    sideChoice,
    viewChoice,
    correctSide,
    correctView,
    correct: sideChoice === correctSide && (!correctView || viewChoice === correctView)
  });
  recordLearningAttempt(
    card,
    sideChoice === correctSide && (!correctView || viewChoice === correctView) ? 'good' : 'again',
    'left-right'
  );
  if (state.leftRightQuiz.index + 1 >= state.leftRightQuiz.order.length) {
    state.leftRightQuiz.active = false;
    state.leftRightQuiz.complete = true;
  } else {
    state.leftRightQuiz.index += 1;
    state.leftRightQuiz.sideChoice = '';
    state.leftRightQuiz.viewChoice = '';
  }
  renderDrills();
}

function renderDrills() {
  const decks = drillDecks();
  setDrillMode(state.drillMode, decks);
  document.body.dataset.drillMode = state.drillMode;
  renderDrillGuide();
  renderDrillModeControls();
  const deckNames = deckNamesForMode(decks);
  if (!deckNames.includes(state.deckName)) {
    state.deckName = deckNames[0];
    state.deckOrder = [];
    state.deckIndex = 0;
  }
  const select = byId('deckSelect');
  select.innerHTML = deckNames.map((name) => `<option value="${escapeHtml(name)}" ${name === state.deckName ? 'selected' : ''}>${escapeHtml(deckDisplayName(name))}</option>`).join('');
  select.classList.toggle('hidden', deckNames.length <= 1);
  select.onchange = () => {
    state.deckName = select.value;
    state.drillMode = drillModeForDeckName(state.deckName);
    state.deckOrder = [];
    state.deckIndex = 0;
    renderDrills();
  };
  const deck = decks[state.deckName];
  ensureDeckOrder(deck);
  renderLeftRightQuizPanel(deck);
  const quizActive = state.drillMode === 'leftRight' && state.leftRightQuiz.active;
  const card = leftRightQuizCard(deck) || deck[state.deckOrder[state.deckIndex] || 0];
  const displayIndex = quizActive ? state.leftRightQuiz.index : state.deckIndex;
  const displayLength = quizActive ? state.leftRightQuiz.order.length : deck.length;
  const showCaptions = !['retrieval', 'leftRight', 'sticker'].includes(state.drillMode);
  byId('deckMeta').textContent = `${deckDisplayName(state.deckName)} | ${displayIndex + 1} of ${displayLength}`;
  byId('drillVisual').innerHTML = `${renderImageSourceNotice(card)}${renderDrillImages(card.images, card.image, card.label || card.prompt, { showCaptions, hideAnswerMetadata: true })}`;
  byId('drillPrompt').innerHTML = renderTextLinks(card.prompt);
  byId('drillBank').innerHTML = renderDrillBank(card);
  byId('drillResponse').innerHTML = quizActive ? '' : renderDrillResponse(card);
  byId('drillAnswer').innerHTML = `${card.answerHtml || renderTextLinks(card.answer)}${renderDrillImages(card.answerImages, card.answerImage, `Labeled answer image for ${card.label || card.prompt}`, { showCaptions })}`;
  byId('drillAnswer').classList.add('hidden');
  setRevealButtonState(false);
  const statusRows = deckStatusRows(deck);
  byId('deckStatus').textContent = `${countDeckStatus(deck, 'correct')} correct / ${countDeckStatus(deck, 'missed')} missed`;
  byId('deckStatusPanel').classList.toggle('hidden', !state.deckStatusVisible);
  byId('drillLayout').classList.toggle('status-hidden', !state.deckStatusVisible);
  byId('toggleDeckStatus').textContent = state.deckStatusVisible ? 'Hide Review List' : 'Show Review List';
  byId('cardNavActions').classList.toggle('hidden', quizActive);
  byId('revealActions').classList.toggle('hidden', quizActive);
  const alphabeticalDeck = statusRows.sort((a, b) => deckStatusLabel(a).localeCompare(deckStatusLabel(b)));
  byId('deckList').innerHTML = alphabeticalDeck.map((item) => {
    const status = item.status || '';
    return `<div class="missed-row"><span>${deckStatusLink(item)}</span><span class="status-pill ${status === 'missed' ? 'missed' : ''}">${escapeHtml(status || 'new')}</span></div>`;
  }).join('');
  bindOiaSelectors(card);
  bindDrillResponse(card);
  bindJumps();
}

function revealCurrentAnswer() {
  const card = currentCard();
  byId('drillAnswer').classList.remove('hidden');
  setRevealButtonState(true);
  updateOiaFeedback(card);
  updateTextResponseFeedback(card);
  if (card?.correctSelections && state.objectiveRecordedCard !== card.id) {
    const selections = state.oiaSelections[card.id] || {};
    const entries = Object.entries(card.correctSelections);
    if (entries.length && entries.every(([label]) => selections[label])) {
      const correct = entries.every(([label, answer]) => selections[label] === answer);
      recordLearningAttempt(card, correct ? 'good' : 'again', card.mode || 'objective-selector');
      state.objectiveRecordedCard = card.id;
      renderDashboard();
    }
  }
}

function hideCurrentAnswer() {
  byId('drillAnswer').classList.add('hidden');
  setRevealButtonState(false);
  clearOiaFeedback();
  const responseNode = byId('drillAnswerFeedback');
  if (responseNode) {
    responseNode.textContent = '';
    responseNode.classList.remove('correct', 'missed');
  }
}

function setRevealButtonState(isRevealed) {
  const reveal = byId('revealAnswer');
  const hide = byId('hideAnswer');
  if (!reveal || !hide) return;
  reveal.classList.toggle('primary-button', !isRevealed);
  reveal.classList.toggle('secondary-button', isRevealed);
  hide.classList.toggle('primary-button', isRevealed);
  hide.classList.toggle('secondary-button', !isRevealed);
}

function toggleDeckStatus() {
  state.deckStatusVisible = !state.deckStatusVisible;
  renderDrills();
}

function countDeckStatus(deck, status) {
  return deckStatusRows(deck).filter((row) => row.status === status).length;
}

function currentCard() {
  const deck = drillDecks()[state.deckName];
  ensureDeckOrder(deck);
  return leftRightQuizCard(deck) || deck[state.deckOrder[state.deckIndex] || 0];
}

function markCard(status) {
  const card = currentCard();
  recordLearningAttempt(card, status, card.mode || state.drillMode);
  nextCard();
}

function nextCard() {
  const deck = drillDecks()[state.deckName];
  state.objectiveRecordedCard = '';
  state.deckIndex = (state.deckIndex + 1) % deck.length;
  renderDrills();
  renderDashboard();
  scrollSectionToTop('drills');
}

function previousCard() {
  const deck = drillDecks()[state.deckName];
  state.objectiveRecordedCard = '';
  state.deckIndex = (state.deckIndex - 1 + deck.length) % deck.length;
  renderDrills();
  renderDashboard();
  scrollSectionToTop('drills');
}

function shuffleDeck() {
  const deck = drillDecks()[state.deckName];
  state.objectiveRecordedCard = '';
  state.deckOrder = shuffledDeckOrder(deck);
  state.deckIndex = 0;
  renderDrills();
  scrollSectionToTop('drills');
}

const ACTIVITY_MODES = {
  today: {
    label: "Today's Practice",
    subtitle: 'An adaptive session built from due reviews, weak concepts, and up to three new items.'
  },
  quick: {
    label: 'Quick 10',
    subtitle: 'Ten mixed questions for a focused study break.'
  },
  region: {
    label: 'Region Sprint',
    subtitle: 'Work through bones and markings from one lower-limb region.'
  },
  flashcards: {
    label: 'OIA Flashcards',
    subtitle: 'Flip each muscle card, then rate your origin, insertion, and action recall.'
  },
  hotspot: {
    label: 'Find the Sticker',
    subtitle: 'Place the sticker where the individual marking page from the book points.'
  },
  clickLabel: {
    label: 'Click the Label',
    subtitle: 'Choose the correct marker from visible book-matched targets on one image.'
  },
  confusables: {
    label: 'Confusable Pairs',
    subtitle: 'Interleave commonly mixed-up structures and retrieve the feature that separates them.'
  }
};

const BOOK_HOTSPOT_COORDINATES = {
  'bone-leader-pelvic-01-a2097a-a2097a-01-acetabulum': [52.1, 59.6],
  'bone-leader-pelvic-01-a2097a-a2097a-12-anterior-inferior-iliac-spine': [62.3, 47.1],
  'bone-leader-pelvic-01-a2097a-a2097a-11-anterior-superior-iliac-spine': [68.6, 35.2],
  'bone-leader-pelvic-07-a2098-a2098-01-auricular-surface-of-ilium': [55.4, 48.9],
  'bone-leader-pelvic-01-a2097a-a2097a-06-greater-sciatic-notch': [43.8, 48.5],
  'bone-leader-pelvic-01-a2097a-a2097a-10-iliac-crest': [52.1, 9.5],
  'bone-leader-pelvic-02-a2099a-a2099a-07-iliac-fossa': [41.7, 30.0],
  'bone-leader-pelvic-05-a2097c-a2097c-17-inferior-ramus-of-pubis': [57.7, 79.4],
  'bone-leader-pelvic-03-a2097b-a2097b-16-ischial-ramus': [48.0, 85.0],
  'bone-leader-pelvic-03-a2097b-a2097b-13-ischial-spine': [39.6, 61.0],
  'bone-leader-pelvic-03-a2097b-a2097b-15-ischial-tuberosity': [36.1, 75.6],
  'bone-leader-pelvic-03-a2097b-a2097b-14-lesser-sciatic-notch': [39.1, 64.2],
  'bone-leader-pelvic-03-a2097b-a2097b-02-obturator-foramen': [51.6, 76.2],
  'bone-leader-pelvic-07-a2098-a2098-12-posterior-inferior-iliac-spine': [61.0, 52.9],
  'bone-leader-pelvic-07-a2098-a2098-13-posterior-superior-iliac-spine': [61.4, 43.0],
  'bone-leader-pelvic-06-a2099c-a2099c-16-pubic-symphyseal-fossa': [37.1, 83.3],
  'bone-leader-pelvic-05-a2097c-a2097c-19-pubic-tubercle': [65.2, 73.4],
  'bone-leader-pelvic-05-a2097c-a2097c-18-superior-ramus-of-pubis': [59.1, 70.6],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-10-adductor-tubercle': [42.2, 61.9],
  'bone-leader-lower-limb-skeleton-05-a2104a-a2104a-06-gluteal-tuberosity': [51.6, 31.8],
  'bone-leader-lower-limb-skeleton-06-a2104b-a2104b-03-greater-trochanter': [57.0, 27.3],
  'bone-leader-lower-limb-skeleton-09-a2105b-a2105b-02-head': [53.4, 27.1],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-13-intercondylar-fossa': [49.5, 70.4],
  'bone-leader-lower-limb-skeleton-06-a2104b-a2104b-04-intertrochanteric-crest': [52.1, 33.7],
  'bone-leader-lower-limb-skeleton-02-a2102b-a2102b-04-intertrochanteric-line': [49.5, 39.7],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-14-lateral-condyle': [54.7, 69.7],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-15-lateral-epicondyle': [58.7, 66.7],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-09-lateral-supracondylar-line': [55.5, 40.9],
  'bone-leader-lower-limb-skeleton-06-a2104b-a2104b-05-lesser-trochanter': [47.1, 41.8],
  'bone-leader-lower-limb-skeleton-04-a2103-a2103-05-linea-aspera': [50.2, 43.9],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-12-medial-condyle': [42.7, 70.7],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-11-medial-epicondyle': [40.1, 65.1],
  'bone-leader-lower-limb-skeleton-07-a2104c-a2104c-08-medial-supracondylar-line': [56.4, 33.5],
  'bone-leader-lower-limb-skeleton-09-a2105b-a2105b-03-neck': [51.9, 38.8],
  'bone-leader-lower-limb-skeleton-03-a2102c-a2102c-07-patellar-surface': [46.3, 74.2],
  'bone-leader-lower-limb-skeleton-15-a3337b-a3337b-10-distal-tibiofibular-joint': [55.6, 76.7],
  'bone-leader-lower-limb-skeleton-26-a2113-a2113-01-head': [49.8, 13.0],
  'bone-leader-lower-limb-skeleton-26-a2113-a2113-03-lateral-malleolus': [48.5, 88.3],
  'bone-leader-lower-limb-skeleton-15-a3337b-a3337b-09-proximal-tibiofibular-joint': [48.8, 32.3],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-02-cuboid': [63.1, 50.3],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-04-intermediate-cuneiform': [58.3, 36.7],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-05-lateral-cuneiform': [53.1, 36.3],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-03-medial-cuneiform': [59.9, 42.6],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-07-metatarsals': [46.1, 49.0],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-06-navicular': [64.1, 38.0],
  'bone-leader-lower-limb-skeleton-30-a3340b-a3340b-08-phalanges': [25.1, 48.8],
  'bone-leader-lower-limb-skeleton-21-a2109-a2109-05-anterior-crest': [52.9, 43.9],
  'bone-leader-lower-limb-skeleton-21-a2109-a2109-06-fibular-notch': [44.8, 85.9],
  'bone-leader-lower-limb-skeleton-21-a2109-a2109-01-lateral-condyle': [49.1, 12.7],
  'bone-leader-lower-limb-skeleton-21-a2109-a2109-07-medial-malleolus': [50.1, 88.5],
  'bone-leader-lower-limb-skeleton-24-a2111-a2111-01-medial-condyle': [52.4, 12.9],
  'bone-leader-lower-limb-skeleton-21-a2109-a2109-03-tibial-tuberosity': [53.7, 19.9]
};

function cleanBookImageForLabeledImage(labeledImage) {
  const parts = String(labeledImage || '').split('/');
  const labeledIndex = parts.lastIndexOf('labeled');
  const family = labeledIndex > 0 ? parts[labeledIndex - 1] : '';
  const filename = parts.at(-1) || '';
  const match = filename.match(/^\d+-([^.]+)\.[a-z0-9]+$/i);
  return match && ['pelvic', 'lower-limb-skeleton'].includes(family)
    ? `assets/pal/${family}/review/${family}-${match[1]}.jpg`
    : '';
}

function bookHotspotTargets() {
  return (data.boneLeaderCards || []).flatMap((card) => {
    const coordinates = BOOK_HOTSPOT_COORDINATES[card.id];
    const image = cleanBookImageForLabeledImage(card.labeledImage);
    if (!coordinates || !image) return [];
    return [{
      id: card.id,
      region: card.region || card.courseRegion,
      label: card.answer || card.label,
      sourceTitle: card.sourceTitle,
      image,
      markedImage: card.reviewImage,
      x: coordinates[0],
      y: coordinates[1]
    }];
  });
}

function clickLabelQuestions() {
  const groups = new Map();
  bookHotspotTargets().forEach((target) => {
    const key = `${target.region}|${target.image}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        region: target.region,
        image: target.image,
        sourceTitle: target.sourceTitle,
        targets: []
      });
    }
    groups.get(key).targets.push(target);
  });

  return [...groups.values()]
    .filter((group) => group.targets.length >= 2)
    .flatMap((group) => group.targets.map((target) => ({
      ...target,
      groupKey: group.key,
      image: group.image,
      sourceTitle: group.sourceTitle,
      choices: group.targets
    })));
}

function defaultActivityState(overrides = {}) {
  return {
    mode: 'today',
    sessionKey: '',
    cards: [],
    index: 0,
    revealed: false,
    correct: 0,
    missed: 0,
    complete: false,
    region: 'Coxal Bone',
    flashFilter: 'all',
    hotspotRegion: 'Coxal Bone',
    hotspotOrder: [],
    hotspotIndex: 0,
    hotspotFeedback: null,
    hotspotCorrect: 0,
    hotspotMissed: 0,
    clickLabelRegion: 'Coxal Bone',
    clickLabelOrder: [],
    clickLabelIndex: 0,
    clickLabelFeedback: null,
    clickLabelCorrect: 0,
    clickLabelMissed: 0,
    confidence: '',
    results: [],
    ...overrides
  };
}

function setActivityMode(mode) {
  const nextMode = ACTIVITY_MODES[mode] ? mode : 'today';
  if (state.activity.mode === nextMode) return;
  state.activity = defaultActivityState({
    mode: nextMode,
    region: state.activity.region,
    flashFilter: state.activity.flashFilter,
    hotspotRegion: state.activity.hotspotRegion,
    clickLabelRegion: state.activity.clickLabelRegion
  });
  updateNavActive();
}

function renderActivityModeControls() {
  const root = byId('activityModeControls');
  if (!root) return;
  root.innerHTML = Object.entries(ACTIVITY_MODES).map(([mode, config]) => `
    <button class="secondary-button mini-button mode-button ${mode === state.activity.mode ? 'active' : ''}" type="button" data-activity-control="${escapeHtml(mode)}">${escapeHtml(config.label)}</button>
  `).join('');
  root.querySelectorAll('[data-activity-control]').forEach((button) => {
    button.addEventListener('click', () => {
      setActivityMode(button.dataset.activityControl);
      renderActivities();
    });
  });
}

function renderActivities() {
  const config = ACTIVITY_MODES[state.activity.mode] || ACTIVITY_MODES.today;
  byId('activityTitle').textContent = config.label;
  byId('activitySubtitle').textContent = config.subtitle;
  renderActivityModeControls();
  if (state.activity.mode === 'flashcards') {
    renderOiaFlashcards();
  } else if (state.activity.mode === 'hotspot') {
    renderHotspotActivity();
  } else if (state.activity.mode === 'clickLabel') {
    renderClickLabelActivity();
  } else {
    renderActivitySession();
  }
  updateNavActive();
}

function mixedActivityCards() {
  return practicalModeSourceCards(['sticker', 'leftRight', 'model', 'oia']);
}

function confusableActivityCards() {
  return (data.confusables || []).map((row, index) => ({
    id: `confusable-${index}`,
    variantId: `confusable-${index}`,
    conceptId: `confusable:${conceptSlug(row.pair)}`,
    mode: 'confusable-pairs',
    label: row.pair,
    prompt: `How do you distinguish ${row.pair}?`,
    answer: row.separator,
    contrast: row.why,
    statusLabel: row.pair
  }));
}

function labelingLearningCard(card, mode = 'word-bank-labeling') {
  const variantId = `${mode}-${card.id}`;
  return {
    id: variantId,
    variantId,
    conceptId: `labeling:${conceptSlug(card.id)}`,
    mode,
    label: card.label,
    prompt: `Label the structures in ${card.label}.`,
    answer: (card.terms || []).join('; '),
    image: card.reviewImage,
    answerImage: card.labeledImage,
    statusLabel: card.label
  };
}

function labelingLearningVariants() {
  return (data.practicalLabelingCards || []).flatMap((card) => [
    labelingLearningCard(card, 'word-bank-labeling'),
    labelingLearningCard(card, 'practical-labeling')
  ]);
}

function hotspotReviewCards() {
  return bookHotspotTargets().map((target) => ({
    id: `hotspot-${target.id}`,
    variantId: `hotspot-${target.id}`,
    conceptId: boneConcept(target.label),
    mode: 'hotspot',
    label: target.label,
    prompt: `Where should the sticker be placed for ${target.label}?`,
    answer: `Compare your location with the book-matched target for ${target.label}.`,
    image: target.image,
    answerImage: target.markedImage,
    statusLabel: target.label,
    statusLinkType: 'visual',
    statusLinkTarget: target.id
  }));
}

function clickLabelReviewCards() {
  return clickLabelQuestions().map((question) => ({
    id: `click-label-${question.id}`,
    variantId: `click-label-${question.id}`,
    conceptId: boneConcept(question.label),
    mode: 'click-label',
    label: question.label,
    prompt: `Which marker identifies ${question.label}?`,
    answer: `Choose the marker at the book-matched target for ${question.label}.`,
    image: question.image,
    answerImage: question.markedImage,
    statusLabel: question.label,
    statusLinkType: 'visual',
    statusLinkTarget: question.id
  }));
}

function allLearningVariants() {
  const drillCards = Object.values(drillDecks()).flat();
  const variants = [...drillCards, ...hotspotReviewCards(), ...clickLabelReviewCards(), ...confusableActivityCards(), ...labelingLearningVariants()];
  return [...new Map(variants.map((variant) => [variant.variantId || variant.id, variant])).values()];
}

function regionActivityCards(region) {
  return (data.boneLeaderCards || [])
    .filter((row) => row.region === region || row.courseRegion === region)
    .map((row) => ({
      id: `region-${row.id}`,
      sourceCardId: `bone-image-${row.id}`,
      label: row.label || row.sourceTitle || 'Bone or marking',
      prompt: 'Identify the highlighted bone or marking.',
      answer: row.answer || row.label,
      image: row.reviewImage,
      images: row.reviewImages || [],
      answerImage: row.labeledImage,
      answerImages: row.labeledImages || [],
      statusLabel: row.answer || row.label || row.sourceTitle,
      conceptId: boneConcept(row.answer || row.label),
      variantId: `region-${row.id}`,
      mode: 'region-sprint'
    }));
}

function activitySessionCards() {
  if (state.activity.mode === 'region') return regionActivityCards(state.activity.region);
  if (state.activity.mode === 'confusables') return confusableActivityCards();
  return mixedActivityCards();
}

function activitySessionKey() {
  return state.activity.mode === 'region' ? `region:${state.activity.region}` : state.activity.mode;
}

function buildActivitySession() {
  const source = state.activity.mode === 'today' ? learningVariants : activitySessionCards();
  let ordered = state.activity.mode === 'today'
    ? learningCoach.buildTodayQueue(source, { limit: 10, maxNew: 3 })
    : [...source].sort(() => Math.random() - 0.5);
  const size = state.activity.mode === 'region' ? Math.min(12, ordered.length) : Math.min(10, ordered.length);
  state.activity.cards = ordered.slice(0, size);
  state.activity.sessionKey = activitySessionKey();
  state.activity.index = 0;
  state.activity.revealed = false;
  state.activity.correct = 0;
  state.activity.missed = 0;
  state.activity.complete = false;
  state.activity.confidence = '';
  state.activity.results = [];
}

function ensureActivitySession() {
  if (
    state.activity.sessionKey !== activitySessionKey() ||
    !state.activity.cards.length ||
    state.activity.index >= state.activity.cards.length
  ) {
    buildActivitySession();
  }
}

function activityCardProgress(current, total) {
  const percent = total ? Math.round((current / total) * 100) : 0;
  return `<div class="activity-progress" aria-label="Activity progress">
    <span style="width:${percent}%"></span>
  </div>`;
}

function confidencePrompt(selected = '', attribute = 'data-activity-confidence') {
  return `<fieldset class="confidence-prompt">
    <legend>Before checking, how certain are you?</legend>
    <div class="confidence-options">
      ${[
        ['unsure', 'Unsure'],
        ['somewhat', 'Somewhat sure'],
        ['certain', 'Certain']
      ].map(([value, label]) => `<button class="secondary-button mini-button choice-button ${selected === value ? 'active' : ''}" type="button" ${attribute}="${value}">${label}</button>`).join('')}
    </div>
  </fieldset>`;
}

function learningRatingButtons(attribute) {
  return `<div class="learning-rating">
    <p>Again = missed; Hard = recalled with effort; Good = recalled cleanly.</p>
    <div class="activity-rating-actions">
      <button class="secondary-button activity-missed-button" type="button" ${attribute}="again">Again</button>
      <button class="secondary-button" type="button" ${attribute}="hard">Hard</button>
      <button class="primary-button" type="button" ${attribute}="good">Good</button>
    </div>
  </div>`;
}

function renderActivitySession() {
  const root = byId('activityRoot');
  if (!root) return;
  ensureActivitySession();
  if (state.activity.complete) {
    renderActivityResults(root);
    return;
  }
  const card = state.activity.cards[state.activity.index];
  if (!card) {
    root.innerHTML = '<section class="panel"><p>No cards are available for this activity yet.</p></section>';
    return;
  }
  const total = state.activity.cards.length;
  root.innerHTML = `
    ${state.activity.mode === 'region' ? renderRegionActivityChooser() : ''}
    <article class="activity-session-card">
      <div class="activity-session-topline">
        <span>${escapeHtml(ACTIVITY_MODES[state.activity.mode].label)} | ${state.activity.index + 1} of ${total}</span>
        <span>${state.activity.correct} correct | ${state.activity.missed} missed</span>
      </div>
      ${activityCardProgress(state.activity.index, total)}
      <div class="activity-question">
        <p class="eyebrow">Answer before revealing</p>
        <h3>${renderTextLinks(card.prompt)}</h3>
      </div>
      <div class="activity-media">${renderDrillImages(card.images, card.image, card.label || card.prompt, { showCaptions: false, hideAnswerMetadata: true })}</div>
      ${state.activity.revealed ? `
        <div class="activity-answer">
          <span class="eyebrow">Answer</span>
          <h4>${card.answerHtml || renderTextLinks(card.answer)}</h4>
          ${card.contrast ? `<p class="contrast-feedback"><strong>Why it is easy to confuse:</strong> ${escapeHtml(card.contrast)}</p>` : ''}
          ${renderDrillImages(card.answerImages, card.answerImage, `Answer for ${card.label || card.prompt}`, { showCaptions: false })}
        </div>
        ${learningRatingButtons('data-activity-rating')}
      ` : `
        ${state.activity.mode === 'today' ? confidencePrompt(state.activity.confidence) : ''}
        <div class="activity-primary-action">
          <button id="revealActivityAnswer" class="primary-button" type="button">Reveal answer</button>
        </div>
      `}
    </article>
  `;
  bindActivitySession();
}

function renderRegionActivityChooser() {
  const regions = unique((data.boneLeaderCards || []).map((row) => row.region || row.courseRegion).filter(Boolean));
  return `<section class="activity-chooser">
    <span>Choose a region</span>
    <div class="activity-choice-row">
      ${regions.map((region) => `<button class="secondary-button mini-button choice-button ${region === state.activity.region ? 'active' : ''}" type="button" data-activity-region="${escapeHtml(region)}">${escapeHtml(region)}</button>`).join('')}
    </div>
  </section>`;
}

function bindActivitySession() {
  byId('revealActivityAnswer')?.addEventListener('click', () => {
    state.activity.revealed = true;
    renderActivities();
  });
  document.querySelectorAll('[data-activity-rating]').forEach((button) => {
    button.addEventListener('click', () => recordActivityRating(button.dataset.activityRating));
  });
  document.querySelectorAll('[data-activity-confidence]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.confidence = button.dataset.activityConfidence;
      renderActivities();
    });
  });
  document.querySelectorAll('[data-activity-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.region = button.dataset.activityRegion;
      state.activity.sessionKey = '';
      renderActivities();
    });
  });
}

function recordActivityRating(status) {
  const card = state.activity.cards[state.activity.index];
  if (!card) return;
  recordLearningAttempt(card, status, state.activity.mode, state.activity.confidence);
  state.activity.results.push({
    status,
    confidence: state.activity.confidence,
    label: deckStatusLabel(card)
  });
  if (status === 'good') state.activity.correct += 1;
  if (status !== 'good') state.activity.missed += 1;
  if (status === 'again' && state.activity.mode === 'today' && !card.repeatReview) {
    const repeatIndex = Math.min(state.activity.index + 4, state.activity.cards.length);
    state.activity.cards.splice(repeatIndex, 0, { ...card, repeatReview: true });
  }
  if (state.activity.index + 1 >= state.activity.cards.length) {
    state.activity.complete = true;
  } else {
    state.activity.index += 1;
    state.activity.revealed = false;
    state.activity.confidence = '';
  }
  renderActivities();
  renderDashboard();
  scrollSectionToTop('activities');
}

function renderActivityResults(root) {
  const total = state.activity.cards.length;
  const percent = total ? Math.round((state.activity.correct / total) * 100) : 0;
  const confidentlyMissed = state.activity.results.filter((result) => result.confidence === 'certain' && result.status !== 'good');
  const uncertainCorrect = state.activity.results.filter((result) => result.confidence === 'unsure' && result.status === 'good');
  root.innerHTML = `
    ${state.activity.mode === 'region' ? renderRegionActivityChooser() : ''}
    <section class="activity-results panel">
      <p class="eyebrow">Session complete</p>
      <div class="activity-score-ring"><strong>${percent}%</strong><span>${state.activity.correct} of ${total}</span></div>
      <h3>${state.activity.missed ? 'Good work. Your misses are saved for review.' : 'Clean run. Nicely done.'}</h3>
      <p>${state.activity.correct} correct and ${state.activity.missed} missed.</p>
      ${state.activity.mode === 'today' ? `<div class="calibration-summary">
        <div><strong>${confidentlyMissed.length}</strong><span>confident misses to revisit</span></div>
        <div><strong>${uncertainCorrect.length}</strong><span>correct answers to strengthen</span></div>
      </div>` : ''}
      <div class="activity-rating-actions">
        <button id="restartActivitySession" class="primary-button" type="button">Run another session</button>
        <button class="secondary-button" type="button" data-activity-open-dashboard>Back to dashboard</button>
      </div>
    </section>
  `;
  byId('restartActivitySession')?.addEventListener('click', () => {
    state.activity.sessionKey = '';
    renderActivities();
  });
  document.querySelectorAll('[data-activity-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.region = button.dataset.activityRegion;
      state.activity.sessionKey = '';
      renderActivities();
    });
  });
  root.querySelector('[data-activity-open-dashboard]')?.addEventListener('click', () => activateView('dashboard'));
}

function filteredOiaMuscles() {
  return data.muscles.filter((muscle) => {
    const status = state.drill[`oia-bank-${muscle.muscle}`] || '';
    if (state.activity.flashFilter === 'missed') return status === 'missed';
    if (state.activity.flashFilter === 'new') return !status;
    return true;
  });
}

function ensureFlashcardSession() {
  const muscles = filteredOiaMuscles();
  const key = `flashcards:${state.activity.flashFilter}:${muscles.map((muscle) => muscle.muscle).join('|')}`;
  if (state.activity.sessionKey !== key || state.activity.index >= muscles.length) {
    state.activity.sessionKey = key;
    state.activity.cards = muscles.sort(() => Math.random() - 0.5);
    state.activity.index = 0;
    state.activity.revealed = false;
    state.activity.correct = 0;
    state.activity.missed = 0;
    state.activity.complete = false;
  }
}

function renderOiaFlashcards() {
  const root = byId('activityRoot');
  if (!root) return;
  ensureFlashcardSession();
  const filters = [
    ['all', 'All cards'],
    ['missed', 'Missed'],
    ['new', 'New']
  ];
  if (state.activity.complete) {
    renderActivityResults(root);
    return;
  }
  const muscle = state.activity.cards[state.activity.index];
  root.innerHTML = `
    <section class="activity-chooser">
      <span>Show</span>
      <div class="activity-choice-row">
        ${filters.map(([value, label]) => `<button class="secondary-button mini-button choice-button ${value === state.activity.flashFilter ? 'active' : ''}" type="button" data-flash-filter="${value}">${label}</button>`).join('')}
      </div>
    </section>
    ${muscle ? `
      <article class="flashcard ${state.activity.revealed ? 'revealed' : ''}">
        <div class="activity-session-topline">
          <span>Card ${state.activity.index + 1} of ${state.activity.cards.length}</span>
          <span>${state.activity.correct} correct | ${state.activity.missed} missed</span>
        </div>
        ${activityCardProgress(state.activity.index, state.activity.cards.length)}
        <div class="flashcard-face flashcard-front">
          <p class="eyebrow">Muscle</p>
          <h3>${escapeHtml(muscle.muscle)}</h3>
          <p>Recall the origin, insertion, and action before you flip the card.</p>
        </div>
        ${state.activity.revealed ? `
          <div class="flashcard-face flashcard-back">
            <div class="oia-row"><span>O</span><div><strong>Origin</strong><p>${renderTextLinks(muscle.origin)}</p></div></div>
            <div class="oia-row"><span>I</span><div><strong>Insertion</strong><p>${renderTextLinks(muscle.insertion)}</p></div></div>
            <div class="oia-row"><span>A</span><div><strong>Action</strong><p>${renderTextLinks(muscle.action)}</p></div></div>
          </div>
          ${learningRatingButtons('data-flash-rating')}
        ` : `
          <div class="activity-primary-action"><button id="flipOiaCard" class="primary-button" type="button">Flip card</button></div>
        `}
      </article>
    ` : `
      <section class="panel activity-empty-state">
        <h3>No ${escapeHtml(state.activity.flashFilter)} cards right now.</h3>
        <p>Choose another filter or complete some OIA cards first.</p>
      </section>
    `}
  `;
  root.querySelectorAll('[data-flash-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.flashFilter = button.dataset.flashFilter;
      state.activity.sessionKey = '';
      renderActivities();
    });
  });
  byId('flipOiaCard')?.addEventListener('click', () => {
    state.activity.revealed = true;
    renderActivities();
  });
  root.querySelectorAll('[data-flash-rating]').forEach((button) => {
    button.addEventListener('click', () => recordFlashcardRating(button.dataset.flashRating));
  });
  bindJumps();
}

function recordFlashcardRating(status) {
  const muscle = state.activity.cards[state.activity.index];
  if (!muscle) return;
  const card = {
    ...muscle,
    id: `oia-bank-${muscle.muscle}`,
    variantId: `oia-flashcard-${conceptSlug(muscle.muscle)}`,
    conceptId: oiaConcept(muscle.muscle),
    mode: 'oia-flashcard'
  };
  recordLearningAttempt(card, status, 'oia-flashcard');
  if (status === 'good') state.activity.correct += 1;
  if (status !== 'good') state.activity.missed += 1;
  if (state.activity.index + 1 >= state.activity.cards.length) {
    state.activity.complete = true;
  } else {
    state.activity.index += 1;
    state.activity.revealed = false;
  }
  renderActivities();
  renderDashboard();
  scrollSectionToTop('activities');
}

function activeHotspotTargets() {
  const targets = bookHotspotTargets();
  const selected = targets.filter((target) => target.region === state.activity.hotspotRegion);
  if (selected.length) return selected;
  state.activity.hotspotRegion = targets[0]?.region || '';
  return targets.filter((target) => target.region === state.activity.hotspotRegion);
}

function ensureHotspotSession() {
  const targets = activeHotspotTargets();
  if (!state.activity.hotspotOrder.length || state.activity.hotspotOrder.some((index) => index >= targets.length)) {
    state.activity.hotspotOrder = shuffledDeckOrder(targets);
    state.activity.hotspotIndex = 0;
    state.activity.hotspotFeedback = null;
    state.activity.hotspotCorrect = 0;
    state.activity.hotspotMissed = 0;
    state.activity.complete = false;
  }
}

function renderHotspotActivity() {
  const root = byId('activityRoot');
  if (!root) return;
  ensureHotspotSession();
  const targets = activeHotspotTargets();
  if (state.activity.complete) {
    const total = state.activity.hotspotOrder.length;
    const percent = total ? Math.round((state.activity.hotspotCorrect / total) * 100) : 0;
    root.innerHTML = `
      ${renderHotspotRegionChooser()}
      <section class="activity-results panel">
        <p class="eyebrow">Hotspot sprint complete</p>
        <div class="activity-score-ring"><strong>${percent}%</strong><span>${state.activity.hotspotCorrect} of ${total}</span></div>
        <h3>${state.activity.hotspotCorrect} locations found</h3>
        <p>Each target was modeled from the highlighted region or leader-line endpoint on its individual book marking page.</p>
        <div class="activity-rating-actions">
          <button id="restartHotspot" class="primary-button" type="button">Try this region again</button>
          <button class="secondary-button" type="button" data-hotspot-open-visuals>Open Visuals</button>
        </div>
      </section>
    `;
    bindHotspotChooser();
    byId('restartHotspot')?.addEventListener('click', () => {
      state.activity.hotspotOrder = [];
      renderActivities();
    });
    root.querySelector('[data-hotspot-open-visuals]')?.addEventListener('click', () => activateView('visuals'));
    return;
  }
  const markingIndex = state.activity.hotspotOrder[state.activity.hotspotIndex];
  const target = targets[markingIndex];
  const feedback = state.activity.hotspotFeedback;
  root.innerHTML = `
    ${renderHotspotRegionChooser()}
    <section class="hotspot-layout">
      <article class="hotspot-question panel">
        <p class="eyebrow">Book-matched target | ${state.activity.hotspotIndex + 1} of ${state.activity.hotspotOrder.length}</p>
        <h3>Find the sticker for <strong>${escapeHtml(target.label)}</strong></h3>
        <p>${escapeHtml(target.sourceTitle)}. Click the exact place where you would put the sticker.</p>
        <div class="hotspot-score">${state.activity.hotspotCorrect} correct | ${state.activity.hotspotMissed} missed</div>
        ${feedback ? `
          <div class="hotspot-feedback ${feedback.correct ? 'correct' : 'missed'}">
            <strong>${feedback.correct ? 'Correct location' : 'Not quite'}</strong>
            <span>${feedback.correct ? 'You placed the sticker on the book target.' : 'The green marker shows where the individual marking page points.'}</span>
          </div>
          <a class="secondary-button hotspot-source-link" href="${escapeHtml(target.markedImage)}" target="_blank" rel="noopener">Open individual marking page</a>
          <button id="nextHotspot" class="primary-button" type="button">${state.activity.hotspotIndex + 1 === state.activity.hotspotOrder.length ? 'Show results' : 'Next location'}</button>
        ` : '<span class="muted">Tap or click anywhere on the image. The source answer appears after your choice.</span>'}
      </article>
      <div class="hotspot-image-frame ${feedback ? 'answered' : ''}" id="hotspotCanvas" role="button" tabindex="${feedback ? '-1' : '0'}" aria-label="Place the sticker for ${escapeHtml(target.label)}">
        <img src="${escapeHtml(target.image)}" alt="${escapeHtml(target.sourceTitle)}">
        ${feedback ? `
          <span class="hotspot-marker selected ${feedback.correct ? 'correct' : 'missed'}" style="left:${feedback.x}%;top:${feedback.y}%;" aria-label="Your sticker"><span>${feedback.correct ? 'Correct' : 'You'}</span></span>
          ${feedback.correct ? '' : `<span class="hotspot-marker correct" style="left:${target.x}%;top:${target.y}%;" aria-label="Book target"><span>Book</span></span>`}
        ` : ''}
      </div>
    </section>
  `;
  bindHotspotChooser();
  const canvas = byId('hotspotCanvas');
  if (canvas && !feedback) {
    canvas.addEventListener('click', (event) => recordHotspotChoice(event, target));
    canvas.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      recordHotspotChoice({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, target);
    });
  }
  byId('nextHotspot')?.addEventListener('click', nextHotspotQuestion);
}

function renderHotspotRegionChooser() {
  const targets = bookHotspotTargets();
  const regions = unique(targets.map((target) => target.region));
  return `<section class="activity-chooser">
    <span>Book region</span>
    <div class="activity-choice-row">
      ${regions.map((region) => `<button class="secondary-button mini-button choice-button ${region === state.activity.hotspotRegion ? 'active' : ''}" type="button" data-hotspot-region="${escapeHtml(region)}">${escapeHtml(region)} <span>${targets.filter((target) => target.region === region).length}</span></button>`).join('')}
    </div>
  </section>`;
}

function bindHotspotChooser() {
  document.querySelectorAll('[data-hotspot-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.hotspotRegion = button.dataset.hotspotRegion;
      state.activity.hotspotOrder = [];
      renderActivities();
    });
  });
}

function recordHotspotChoice(event, target) {
  if (state.activity.hotspotFeedback) return;
  const frame = byId('hotspotCanvas');
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
  const distance = Math.hypot(x - target.x, y - target.y);
  const correct = distance <= 7.5;
  state.activity.hotspotFeedback = { x, y, distance, correct };
  if (correct) state.activity.hotspotCorrect += 1;
  if (!correct) state.activity.hotspotMissed += 1;
  recordLearningAttempt({
    ...target,
    id: `hotspot-${target.id}`,
    variantId: `hotspot-${target.id}`,
    conceptId: boneConcept(target.label),
    mode: 'hotspot'
  }, correct ? 'good' : 'again', 'hotspot');
  renderActivities();
  renderDashboard();
}

function nextHotspotQuestion() {
  if (state.activity.hotspotIndex + 1 >= state.activity.hotspotOrder.length) {
    state.activity.complete = true;
  } else {
    state.activity.hotspotIndex += 1;
    state.activity.hotspotFeedback = null;
  }
  renderActivities();
  renderDashboard();
  scrollSectionToTop('activities');
}

function activeClickLabelQuestions() {
  const questions = clickLabelQuestions();
  const selected = questions.filter((question) => question.region === state.activity.clickLabelRegion);
  if (selected.length) return selected;
  state.activity.clickLabelRegion = questions[0]?.region || '';
  return questions.filter((question) => question.region === state.activity.clickLabelRegion);
}

function ensureClickLabelSession() {
  const questions = activeClickLabelQuestions();
  if (!state.activity.clickLabelOrder.length || state.activity.clickLabelOrder.some((index) => index >= questions.length)) {
    state.activity.clickLabelOrder = shuffledDeckOrder(questions);
    state.activity.clickLabelIndex = 0;
    state.activity.clickLabelFeedback = null;
    state.activity.clickLabelCorrect = 0;
    state.activity.clickLabelMissed = 0;
    state.activity.complete = false;
  }
}

function renderClickLabelActivity() {
  const root = byId('activityRoot');
  if (!root) return;
  ensureClickLabelSession();
  const questions = activeClickLabelQuestions();
  if (!questions.length) {
    root.innerHTML = '<section class="panel"><span class="muted">No click-label questions are available for this image set.</span></section>';
    return;
  }
  if (state.activity.complete) {
    const total = state.activity.clickLabelOrder.length;
    const percent = total ? Math.round((state.activity.clickLabelCorrect / total) * 100) : 0;
    root.innerHTML = `
      ${renderClickLabelRegionChooser()}
      <section class="activity-results panel">
        <p class="eyebrow">Click-label sprint complete</p>
        <div class="activity-score-ring"><strong>${percent}%</strong><span>${state.activity.clickLabelCorrect} of ${total}</span></div>
        <h3>${state.activity.clickLabelCorrect} labels selected</h3>
        <p>Each marker comes from the same book-matched coordinate set used by Find the Sticker.</p>
        <div class="activity-rating-actions">
          <button id="restartClickLabel" class="primary-button" type="button">Try this region again</button>
          <button class="secondary-button" type="button" data-click-label-open-hotspot>Open Find the Sticker</button>
        </div>
      </section>
    `;
    bindClickLabelChooser();
    byId('restartClickLabel')?.addEventListener('click', () => {
      state.activity.clickLabelOrder = [];
      renderActivities();
    });
    root.querySelector('[data-click-label-open-hotspot]')?.addEventListener('click', () => {
      setActivityMode('hotspot');
      renderActivities();
    });
    return;
  }
  const questionIndex = state.activity.clickLabelOrder[state.activity.clickLabelIndex];
  const question = questions[questionIndex];
  const feedback = state.activity.clickLabelFeedback;
  root.innerHTML = `
    ${renderClickLabelRegionChooser()}
    <section class="hotspot-layout click-label-layout">
      <article class="hotspot-question panel">
        <p class="eyebrow">Click-label target | ${state.activity.clickLabelIndex + 1} of ${state.activity.clickLabelOrder.length}</p>
        <h3>Click the label for <strong>${escapeHtml(question.label)}</strong></h3>
        <p>${escapeHtml(question.sourceTitle)}. Choose the marker that points to the named structure.</p>
        <div class="hotspot-score">${state.activity.clickLabelCorrect} correct | ${state.activity.clickLabelMissed} missed</div>
        ${feedback ? `
          <div class="hotspot-feedback ${feedback.correct ? 'correct' : 'missed'}">
            <strong>${feedback.correct ? 'Correct marker' : 'Not quite'}</strong>
            <span>${feedback.correct ? 'You selected the book-matched marker.' : 'The green marker shows the correct target.'}</span>
          </div>
          <button id="nextClickLabel" class="primary-button" type="button">${state.activity.clickLabelIndex + 1 === state.activity.clickLabelOrder.length ? 'Show results' : 'Next label'}</button>
        ` : '<span class="muted">Choose one of the visible markers. Use Find the Sticker when you are ready to place it without choices.</span>'}
      </article>
      <div class="hotspot-image-frame click-label-frame ${feedback ? 'answered' : ''}">
        <img src="${escapeHtml(question.image)}" alt="${escapeHtml(question.sourceTitle)}">
        ${question.choices.map((choice) => {
          const isCorrectChoice = feedback && choice.id === question.id;
          const isWrongChoice = feedback && choice.id === feedback.chosenId && choice.id !== question.id;
          const label = isCorrectChoice ? 'Correct' : isWrongChoice ? 'You' : '?';
          return `<button class="hotspot-marker click-label-marker ${isCorrectChoice ? 'correct' : ''} ${isWrongChoice ? 'missed' : ''}" type="button" style="left:${choice.x}%;top:${choice.y}%;" data-click-label-id="${escapeHtml(choice.id)}" aria-label="${escapeHtml(choice.label)} marker" ${feedback ? 'disabled' : ''}><span>${label}</span></button>`;
        }).join('')}
      </div>
    </section>
  `;
  bindClickLabelChooser();
  document.querySelectorAll('[data-click-label-id]').forEach((button) => {
    button.addEventListener('click', () => recordClickLabelChoice(button.dataset.clickLabelId, question));
  });
  byId('nextClickLabel')?.addEventListener('click', nextClickLabelQuestion);
}

function renderClickLabelRegionChooser() {
  const questions = clickLabelQuestions();
  const regions = unique(questions.map((question) => question.region));
  return `<section class="activity-chooser">
    <span>Book region</span>
    <div class="activity-choice-row">
      ${regions.map((region) => `<button class="secondary-button mini-button choice-button ${region === state.activity.clickLabelRegion ? 'active' : ''}" type="button" data-click-label-region="${escapeHtml(region)}">${escapeHtml(region)} <span>${questions.filter((question) => question.region === region).length}</span></button>`).join('')}
    </div>
  </section>`;
}

function bindClickLabelChooser() {
  document.querySelectorAll('[data-click-label-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activity.clickLabelRegion = button.dataset.clickLabelRegion;
      state.activity.clickLabelOrder = [];
      renderActivities();
    });
  });
}

function recordClickLabelChoice(choiceId, question) {
  if (state.activity.clickLabelFeedback) return;
  const correct = choiceId === question.id;
  state.activity.clickLabelFeedback = { chosenId: choiceId, correct };
  if (correct) state.activity.clickLabelCorrect += 1;
  if (!correct) state.activity.clickLabelMissed += 1;
  recordLearningAttempt({
    ...question,
    id: `click-label-${question.id}`,
    variantId: `click-label-${question.id}`,
    conceptId: boneConcept(question.label),
    mode: 'click-label'
  }, correct ? 'good' : 'again', 'click-label');
  renderActivities();
  renderDashboard();
}

function nextClickLabelQuestion() {
  if (state.activity.clickLabelIndex + 1 >= state.activity.clickLabelOrder.length) {
    state.activity.complete = true;
  } else {
    state.activity.clickLabelIndex += 1;
    state.activity.clickLabelFeedback = null;
  }
  renderActivities();
  renderDashboard();
  scrollSectionToTop('activities');
}

const PRACTICAL_TYPE_CONFIG = {
  sticker: {
    label: 'Sticker practical',
    description: 'Bone, marking, and muscle questions with sticker-style prompts.'
  },
  leftRight: {
    label: 'Left/right ID',
    description: 'Side recognition with anterior/posterior views and foot top/bottom views.'
  },
  model: {
    label: 'Muscles to ID',
    description: 'Highlighted muscle questions from source-labeled practice banks. PAL images are substitutes, not lab-model photos.'
  },
  oia: {
    label: 'OIA recall',
    description: 'Muscle-to-origin, insertion, and action prompts without a dropdown bank.'
  }
};

const PRACTICAL_PRESETS = {
  warmup: {
    label: '5-question warmup',
    description: 'A quick mixed readiness check.',
    size: 5,
    types: ['sticker', 'leftRight', 'model', 'oia']
  },
  bones: {
    label: 'Bones and sides',
    description: 'Sticker questions plus left/right identification.',
    size: 10,
    types: ['sticker', 'leftRight']
  },
  muscles: {
    label: 'Muscles and OIAs',
    description: 'Model identification plus OIA recall.',
    size: 10,
    types: ['model', 'oia']
  },
  full: {
    label: 'Full practical',
    description: 'A twenty-question mixed simulation.',
    size: 20,
    types: ['sticker', 'leftRight', 'model', 'oia']
  }
};

function defaultPracticalModeState(overrides = {}) {
  return {
    active: false,
    complete: false,
    size: 10,
    selectedTypes: ['sticker', 'leftRight', 'model', 'oia'],
    order: [],
    index: 0,
    results: [],
    revealed: false,
    answers: {},
    sideChoices: {},
    viewChoices: {},
    confidenceChoices: {},
    ...overrides
  };
}

function practicalModeCard(card, type) {
  const clone = {
    ...card,
    practicalType: type,
    practicalTypeLabel: PRACTICAL_TYPE_CONFIG[type]?.label || type,
    practicalId: `practical-${type}-${card.id}`,
    sourceCardId: card.id
  };
  if (type === 'oia') {
    clone.banks = null;
    clone.correctSelections = null;
    clone.textResponse = true;
    clone.responsePlaceholder = 'Type the origin, insertion, and action before submitting.';
  }
  if (type === 'leftRight') {
    clone.responsePlaceholder = 'Type the side and view, or use the side/view buttons below.';
  }
  clone.responsePlaceholder = String(clone.responsePlaceholder || 'Type your answer before submitting.').replace('before revealing', 'before submitting');
  return clone;
}

function practicalModeSourceCards(selectedTypes = state.practicalMode.selectedTypes) {
  const selected = new Set(selectedTypes);
  const decks = drillDecks();
  const cards = [];
  const addDeck = (type, deckName) => {
    if (!selected.has(type) || !decks[deckName]) return;
    decks[deckName].forEach((card) => cards.push(practicalModeCard(card, type)));
  };
  addDeck('sticker', 'Sticker Practical: Mixed');
  if (!decks['Sticker Practical: Mixed']) {
    addDeck('sticker', 'Sticker Practical: Bones and Markings');
    addDeck('sticker', 'Sticker Practical: Muscles');
  }
  addDeck('leftRight', 'Left/Right ID: Full Bones');
  addDeck('model', 'Model Image ID');
  addDeck('oia', 'OIA Practice');
  return cards;
}

function practicalTypeCounts() {
  return Object.fromEntries(Object.keys(PRACTICAL_TYPE_CONFIG).map((type) => [
    type,
    practicalModeSourceCards([type]).length
  ]));
}

function practicalModeCountOptions(max) {
  if (!max) return [];
  const options = [5, 10, 20, 30, 50].filter((count) => count < max);
  options.push(max);
  return unique(options);
}

function balancedPracticalOrder(cards, size, selectedTypes) {
  const buckets = new Map();
  selectedTypes.forEach((type) => buckets.set(type, []));
  cards.forEach((card, index) => {
    if (buckets.has(card.practicalType)) buckets.get(card.practicalType).push({ card, index });
  });
  buckets.forEach((entries, type) => {
    const randomized = shuffledDeckOrder(entries).map((index) => entries[index]);
    if (type !== 'model') {
      buckets.set(type, randomized);
      return;
    }
    const seen = new Set();
    const firstViews = [];
    const extraViews = [];
    randomized.forEach((entry) => {
      const key = normalize(entry.card.samplingKey || entry.card.statusLabel || entry.card.id);
      if (!key || !seen.has(key)) {
        if (key) seen.add(key);
        firstViews.push(entry);
      } else {
        extraViews.push(entry);
      }
    });
    buckets.set(type, [...firstViews, ...extraViews]);
  });
  const order = [];
  const target = Math.min(size, cards.length);
  while (order.length < target) {
    let added = false;
    selectedTypes.forEach((type) => {
      if (order.length >= target) return;
      const next = buckets.get(type)?.shift();
      if (!next) return;
      order.push(next.index);
      added = true;
    });
    if (!added) break;
  }
  return order;
}

function renderPracticalMode() {
  const root = byId('practicalModeRoot');
  if (!root) return;
  if (state.practicalMode.complete) {
    renderPracticalModeResults(root);
  } else if (state.practicalMode.active) {
    renderPracticalModeCard(root);
  } else {
    renderPracticalModeSetup(root);
  }
}

function renderPracticalModeSetup(root) {
  const counts = practicalTypeCounts();
  const selected = new Set(state.practicalMode.selectedTypes);
  const available = practicalModeSourceCards(state.practicalMode.selectedTypes).length;
  const countOptions = practicalModeCountOptions(available);
  root.innerHTML = `
    <section class="panel practical-simulation-setup">
      <div class="simulation-intro">
        <p class="eyebrow">Readiness check</p>
        <h2>Practical simulation</h2>
        <p>Build a mixed run across bones, markings, muscles, and OIAs. Commit to each answer before reviewing your results.</p>
        <div class="simulation-stats">
          <div><strong>${available}</strong><span>Available items</span></div>
          <div><strong>${state.practicalMode.selectedTypes.length}</strong><span>Item types</span></div>
          <div><strong>No</strong><span>Answers during run</span></div>
        </div>
      </div>
      <div class="preset-section">
        <div class="panel-heading">
          <h3>Start with a preset</h3>
          <span class="muted">One click and go</span>
        </div>
        <div class="preset-grid">
          ${Object.entries(PRACTICAL_PRESETS).map(([preset, config]) => `
            <button class="preset-card" type="button" data-practical-preset="${escapeHtml(preset)}">
              <strong>${escapeHtml(config.label)}</strong>
              <span>${escapeHtml(config.description)}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="panel-heading">
        <h3>Build your check</h3>
        <span class="muted">${available} available items selected</span>
      </div>
      <div class="practical-setup-grid">
        ${Object.entries(PRACTICAL_TYPE_CONFIG).map(([type, config]) => `
          <label class="practical-option">
            <input type="checkbox" data-practical-type="${escapeHtml(type)}" ${selected.has(type) ? 'checked' : ''} ${counts[type] ? '' : 'disabled'}>
            <span>
              <strong>${escapeHtml(config.label)}</strong>
              <span>${escapeHtml(config.description)} ${counts[type]} items available.</span>
            </span>
          </label>
        `).join('')}
      </div>
      <p class="muted practical-sampling-note">Mixed checks are balanced across the selected question types. Extra image views do not give muscle ID extra weight.</p>
      <div class="practical-control-row">
        <label class="filter-select-label">
          <span>Question count</span>
          <select id="practicalModeSize" class="filter-select" ${available ? '' : 'disabled'}>
            ${countOptions.map((count) => `<option value="${count}" ${count === Math.min(state.practicalMode.size, available) ? 'selected' : ''}>${count === available ? `All ${available}` : count}</option>`).join('')}
          </select>
        </label>
        <button id="startPracticalMode" class="primary-button" type="button" ${available ? '' : 'disabled'}>Start Practical Mode</button>
      </div>
    </section>
  `;
  bindPracticalModeSetup();
}

function bindPracticalModeSetup() {
  document.querySelectorAll('[data-practical-type]').forEach((input) => {
    input.addEventListener('change', () => {
      const selectedTypes = [...document.querySelectorAll('[data-practical-type]:checked')].map((item) => item.dataset.practicalType);
      state.practicalMode = defaultPracticalModeState({
        selectedTypes,
        size: state.practicalMode.size
      });
      renderPracticalMode();
    });
  });
  const start = byId('startPracticalMode');
  if (start) start.addEventListener('click', startPracticalMode);
  document.querySelectorAll('[data-practical-preset]').forEach((button) => {
    button.addEventListener('click', () => startPracticalPreset(button.dataset.practicalPreset));
  });
}

function startPracticalMode() {
  const selectedTypes = [...document.querySelectorAll('[data-practical-type]:checked')].map((item) => item.dataset.practicalType);
  const cards = practicalModeSourceCards(selectedTypes);
  if (!cards.length) return;
  const size = Number(byId('practicalModeSize')?.value || 10);
  state.practicalMode = defaultPracticalModeState({
    active: true,
    size,
    selectedTypes,
    order: balancedPracticalOrder(cards, size, selectedTypes)
  });
  renderPracticalMode();
  scrollSectionToTop('practicalMode');
}

function startPracticalPreset(presetName) {
  const preset = PRACTICAL_PRESETS[presetName];
  if (!preset) return;
  const cards = practicalModeSourceCards(preset.types);
  if (!cards.length) return;
  state.practicalMode = defaultPracticalModeState({
    active: true,
    size: Math.min(preset.size, cards.length),
    selectedTypes: [...preset.types],
    order: shuffledDeckOrder(cards).slice(0, Math.min(preset.size, cards.length))
  });
  renderPracticalMode();
  scrollSectionToTop('practicalMode');
}

function practicalModeDeck() {
  return practicalModeSourceCards(state.practicalMode.selectedTypes);
}

function practicalModeCurrentCard() {
  const deck = practicalModeDeck();
  return deck[state.practicalMode.order[state.practicalMode.index]] || deck[0] || null;
}

function renderPracticalModeResponse(card) {
  const value = state.practicalMode.answers[card.practicalId] || '';
  return `<div class="drill-response-card">
    <label>
      <span>Your answer</span>
      <textarea id="practicalAnswerInput" placeholder="${escapeHtml(card.responsePlaceholder || 'Type your answer before submitting.')}">${escapeHtml(value)}</textarea>
    </label>
  </div>`;
}

function renderPracticalModeChoices(card) {
  if (card.practicalType !== 'leftRight') return '';
  const sideChoice = state.practicalMode.sideChoices[card.practicalId] || '';
  const viewChoice = state.practicalMode.viewChoices[card.practicalId] || '';
  const sideChoices = ['Left', 'Right', 'Unsure'];
  const viewChoices = ['Anterior', 'Posterior', 'Superior', 'Inferior', 'Unsure'];
  return `<div class="choice-group">
    <span>View</span>
    <div class="choice-button-row">
      ${viewChoices.map((choice) => `<button class="secondary-button mini-button choice-button ${choice === viewChoice ? 'active' : ''}" type="button" data-practical-view="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join('')}
    </div>
    <span>Side</span>
    <div class="choice-button-row">
      ${sideChoices.map((choice) => `<button class="secondary-button mini-button choice-button ${choice === sideChoice ? 'active' : ''}" type="button" data-practical-side="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join('')}
    </div>
  </div>`;
}

function practicalAnswerHtml(card) {
  const baseAnswer = card.answerHtml || renderTextLinks(card.answer);
  const sideSummary = card.practicalType === 'leftRight'
    ? `<p>${card.view ? `<strong>Correct view:</strong> ${escapeHtml(card.view)} | ` : ''}<strong>Correct side:</strong> ${escapeHtml(card.side || 'Review image')}</p>`
    : '';
  return `${baseAnswer}${sideSummary}${renderDrillImages(card.answerImages, card.answerImage, `Labeled answer image for ${card.label || card.prompt}`, { showCaptions: false })}`;
}

function renderPracticalModeCard(root) {
  const deck = practicalModeDeck();
  if (!deck.length) {
    state.practicalMode = defaultPracticalModeState();
    renderPracticalMode();
    return;
  }
  const card = practicalModeCurrentCard();
  const displayIndex = state.practicalMode.index + 1;
  const total = state.practicalMode.order.length;
  root.innerHTML = `
    <article class="drill-card practical-mode-card">
      <div class="drill-topbar">
        <div>
          <div class="muted">${escapeHtml(card.practicalTypeLabel)} | Question ${displayIndex} of ${total}</div>
          <h3>${renderTextLinks(card.prompt)}</h3>
        </div>
        <div class="drill-actions">
          <button id="cancelPracticalMode" class="secondary-button mini-button" type="button">End check</button>
        </div>
      </div>
      ${confidencePrompt(state.practicalMode.confidenceChoices[card.practicalId] || '', 'data-practical-confidence')}
      ${renderPracticalModeResponse(card)}
      ${renderPracticalModeChoices(card)}
      ${renderImageSourceNotice(card)}
      <div class="drill-visual">${renderDrillImages(card.images, card.image, card.label || card.prompt, { showCaptions: false, hideAnswerMetadata: true })}</div>
      <div class="drill-actions">
        <button id="submitPracticalAnswer" class="primary-button" type="button">${displayIndex === total ? 'Submit and show results' : 'Submit answer'}</button>
      </div>
    </article>
  `;
  bindPracticalModeCard(card);
}

function bindPracticalModeCard(card) {
  const answerInput = byId('practicalAnswerInput');
  if (answerInput) answerInput.addEventListener('input', () => {
    state.practicalMode.answers[card.practicalId] = answerInput.value;
  });
  byId('cancelPracticalMode')?.addEventListener('click', () => {
    state.practicalMode = defaultPracticalModeState({
      selectedTypes: state.practicalMode.selectedTypes,
      size: state.practicalMode.size
    });
    renderPracticalMode();
  });
  document.querySelectorAll('[data-practical-side]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalMode.sideChoices[card.practicalId] = button.dataset.practicalSide;
      renderPracticalMode();
    });
  });
  document.querySelectorAll('[data-practical-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalMode.viewChoices[card.practicalId] = button.dataset.practicalView;
      renderPracticalMode();
    });
  });
  document.querySelectorAll('[data-practical-confidence]').forEach((button) => {
    button.addEventListener('click', () => {
      state.practicalMode.confidenceChoices[card.practicalId] = button.dataset.practicalConfidence;
      renderPracticalMode();
    });
  });
  byId('submitPracticalAnswer')?.addEventListener('click', recordPracticalModeResult);
}

function recordPracticalModeResult() {
  const card = practicalModeCurrentCard();
  if (!card) return;
  const answer = state.practicalMode.answers[card.practicalId] || '';
  const sideChoice = state.practicalMode.sideChoices[card.practicalId] || '';
  const viewChoice = state.practicalMode.viewChoices[card.practicalId] || '';
  const status = practicalModeInitialStatus(card, sideChoice, viewChoice);
  const result = {
    cardId: card.sourceCardId,
    conceptId: card.conceptId,
    variantId: card.variantId || card.id,
    mode: card.mode || card.practicalType,
    label: deckStatusLabel(card),
    type: card.practicalTypeLabel,
    status,
    confidence: state.practicalMode.confidenceChoices[card.practicalId] || '',
    recorded: status !== 'review',
    answer,
    correctAnswer: card.answer,
    correctAnswerHtml: card.answerHtml || '',
    answerImage: card.answerImage || '',
    answerImages: card.answerImages || [],
    sourceKind: card.sourceKind || '',
    sourceTypeLabel: card.sourceTypeLabel || '',
    sourceDescription: card.sourceDescription || '',
    sideChoice,
    viewChoice,
    correctSide: card.side || '',
    correctView: card.view || '',
    statusLinkType: card.statusLinkType,
    statusLinkTarget: card.statusLinkTarget
  };
  state.practicalMode.results.push(result);
  if (result.recorded) recordLearningAttempt(result, status, `practical-${card.practicalType}`, result.confidence);
  if (state.practicalMode.index + 1 >= state.practicalMode.order.length) {
    state.practicalMode.active = false;
    state.practicalMode.complete = true;
  } else {
    state.practicalMode.index += 1;
    state.practicalMode.revealed = false;
  }
  renderPracticalMode();
  scrollSectionToTop('practicalMode');
}

function practicalModeInitialStatus(card, sideChoice, viewChoice) {
  if (card.practicalType !== 'leftRight') return 'review';
  if (!sideChoice || !viewChoice || sideChoice === 'Unsure' || viewChoice === 'Unsure') return 'unsure';
  return sideChoice === card.side && (!card.view || viewChoice === card.view) ? 'correct' : 'missed';
}

function renderPracticalModeResults(root) {
  const results = state.practicalMode.results;
  const correct = results.filter((result) => result.status === 'correct').length;
  const missed = results.filter((result) => result.status === 'missed').length;
  const unsure = results.filter((result) => result.status === 'unsure').length;
  const review = results.filter((result) => result.status === 'review').length;
  const graded = results.length - review;
  const confidentlyMissed = results.filter((result) => result.confidence === 'certain' && result.status !== 'correct').length;
  const uncertainCorrect = results.filter((result) => result.confidence === 'unsure' && result.status === 'correct').length;
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2>Practical Mode Results</h2>
        <span class="muted">Score ${graded ? `${correct} / ${graded}` : 'not graded yet'} | missed ${missed} | unsure ${unsure} | review ${review}</span>
      </div>
      <div class="practical-result-actions">
        <button id="restartPracticalMode" class="primary-button" type="button">Start another check</button>
        <button id="clearPracticalMode" class="secondary-button" type="button">Clear results</button>
      </div>
      <div class="calibration-summary">
        <div><strong>${confidentlyMissed}</strong><span>confident misses to revisit</span></div>
        <div><strong>${uncertainCorrect}</strong><span>uncertain correct answers to strengthen</span></div>
      </div>
      <div class="practical-result-list">
        ${results.map((result, index) => renderPracticalResultRow(result, index)).join('')}
      </div>
    </section>
  `;
  byId('restartPracticalMode')?.addEventListener('click', () => {
    state.practicalMode = defaultPracticalModeState({
      selectedTypes: state.practicalMode.selectedTypes,
      size: state.practicalMode.size
    });
    renderPracticalMode();
  });
  byId('clearPracticalMode')?.addEventListener('click', () => {
    state.practicalMode = defaultPracticalModeState();
    renderPracticalMode();
  });
  document.querySelectorAll('.practical-drill-jump').forEach((button) => {
    button.addEventListener('click', () => jumpToDrillCard(button.dataset.cardId));
  });
  document.querySelectorAll('[data-practical-result-status]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.practicalResultIndex);
      const status = button.dataset.practicalResultStatus;
      if (!state.practicalMode.results[index]) return;
      const result = state.practicalMode.results[index];
      result.status = status;
      if (!result.recorded) {
        recordLearningAttempt(result, status, `practical-${result.mode || 'review'}`, result.confidence);
        result.recorded = true;
        renderDashboard();
      }
      renderPracticalMode();
    });
  });
  bindJumps();
}

function renderPracticalResultRow(result, index) {
  const statusClass = result.status === 'missed' || result.status === 'unsure' ? 'missed' : (result.status === 'review' ? 'review' : '');
  const response = result.answer ? `You wrote: ${result.answer}` : 'No typed answer recorded.';
  const sideView = result.correctSide
    ? `View: ${result.viewChoice || 'not selected'} / ${result.correctView || 'not listed'}; Side: ${result.sideChoice || 'not selected'} / ${result.correctSide}.`
    : '';
  const answerHtml = result.correctAnswerHtml || renderTextLinks(result.correctAnswer || '');
  return `<div class="practical-result-row">
    <span class="status-pill ${statusClass}">${escapeHtml(result.status)}</span>
    <div>
      <strong>${deckStatusLink(result)}</strong>
      <p>${escapeHtml(result.type)} | ${escapeHtml(response)}</p>
      ${sideView ? `<p>${escapeHtml(sideView)}</p>` : ''}
      ${renderImageSourceNotice(result)}
      <p>Answer: ${answerHtml}</p>
      ${renderDrillImages(result.answerImages, result.answerImage, `Labeled answer image for ${result.label}`, { showCaptions: false })}
      <div class="practical-result-actions">
        <button class="secondary-button mini-button" type="button" data-practical-result-index="${index}" data-practical-result-status="missed">Mark missed</button>
        <button class="secondary-button mini-button" type="button" data-practical-result-index="${index}" data-practical-result-status="unsure">Mark unsure</button>
        <button class="primary-button mini-button" type="button" data-practical-result-index="${index}" data-practical-result-status="correct">Mark correct</button>
      </div>
      <button class="link-button practical-drill-jump" type="button" data-card-id="${escapeHtml(result.cardId)}">Open source drill card</button>
    </div>
  </div>`;
}

function renderDashboard() {
  const totalBones = data.bones.length;
  const totalMuscles = data.muscles.length;
  const totalModels = data.modelKey.length;
  const doneBones = data.bones.filter((bone) => isChecked('bone', bone.id)).length;
  const doneMuscles = data.muscles.filter((muscle) => isChecked('muscle', muscle.muscle)).length;
  const doneModels = data.modelKey.filter((row) => isChecked('model', row.number)).length;
  const coverageTotal = totalBones + totalMuscles + totalModels;
  const coverageDone = doneBones + doneMuscles + doneModels;
  const coveragePercent = coverageTotal ? Math.round((coverageDone / coverageTotal) * 100) : 0;
  const summary = learningCoach?.getReadinessSummary(learningVariants) || {
    total: 0,
    ready: 0,
    due: 0,
    learning: 0,
    new: 0,
    readinessPercent: 0,
    weakConceptIds: [],
    upcoming: []
  };
  byId('overallProgress').style.width = `${summary.readinessPercent}%`;
  byId('overallProgressText').textContent = `${summary.readinessPercent}%`;
  byId('coverageMetric').textContent = `${coveragePercent}%`;
  byId('coverageCounts').textContent = `${coverageDone} of ${coverageTotal} studied`;
  byId('readinessMetric').textContent = `${summary.readinessPercent}%`;
  byId('readinessCounts').textContent = `${summary.ready} of ${summary.total} prompts ready`;
  byId('dueTodayCount').textContent = summary.due;
  byId('dashboardCounts').textContent = `${summary.total} prompts`;
  byId('dashboardCountsNote').textContent = `${coverageTotal} structures across ${summary.total} recall prompts`;
  if (summary.due) {
    byId('coachPrimary').textContent = `Review ${summary.due} due prompt${summary.due === 1 ? '' : 's'}`;
    byId('coachPrimaryNote').textContent = 'Today’s queue starts with due reviews and recent misses, then adds weak and new material.';
  } else if (summary.ready) {
    byId('coachPrimary').textContent = 'Keep recall moving forward';
    byId('coachPrimaryNote').textContent = 'Nothing is overdue. A short session will strengthen learning prompts and introduce a few new ones.';
  } else {
    byId('coachPrimary').textContent = 'Start building durable recall';
    byId('coachPrimaryNote').textContent = 'Your first adaptive session introduces a few prompts and schedules them to return.';
  }
  const examDate = learningCoach?.getStore().settings.examDate || '';
  byId('examDateStatus').textContent = examDate
    ? new Date(`${examDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'Not set';
  const weakRoot = byId('weakList');
  weakRoot.innerHTML = summary.weakConceptIds.length
    ? summary.weakConceptIds.map((conceptId) => `<button class="status-pill missed weak-concept-jump" type="button" data-concept-id="${escapeHtml(conceptId)}">${escapeHtml(conceptDisplayLabel(conceptId))}</button>`).join('')
    : '<span class="muted">Complete practice to identify weak prompts.</span>';
  weakRoot.querySelectorAll('.weak-concept-jump').forEach((button) => {
    button.addEventListener('click', () => {
      setActivityMode('today');
      activateView('activities');
    });
  });
  byId('upcomingList').innerHTML = summary.upcoming.map((item) => `
    <div><strong>${item.count}</strong><span>within ${item.days} day${item.days === 1 ? '' : 's'}</span></div>
  `).join('');
  renderRegionMap();
}

function conceptDisplayLabel(conceptId) {
  const variant = learningVariants.find((item) => item.conceptId === conceptId);
  return deckStatusLabel(variant) || conceptId.replace(/^[^:]+:/, '').replace(/-/g, ' ');
}

function renderRegionMap() {
  const regions = [
    { label: 'Coxal Bone', icon: 'CX', note: 'pelvic landmarks' },
    { label: 'Femur', icon: 'FM', note: 'proximal, shaft, distal landmarks' },
    { label: 'Tibia', icon: 'TB', note: 'medial leg and knee landmarks' },
    { label: 'Fibula', icon: 'FB', note: 'lateral leg and ankle landmarks' },
    { label: 'Foot', icon: 'FT', note: 'tarsals, metatarsals, phalanges' }
  ];
  byId('regionMap').innerHTML = regions.map((region) => {
    const bones = data.bones.filter((bone) => bone.region === region.label);
    const count = bones.length;
    const ready = bones.filter((bone) => learningCoach?.getConcept(boneConcept(bone.term))?.ready).length;
    const percent = count ? Math.round((ready / count) * 100) : 0;
    return `<button class="region-card" type="button" data-region="${escapeHtml(region.label)}">
      <span class="region-icon">${escapeHtml(region.icon)}</span>
      <span>
        <span class="region-name">${escapeHtml(region.label)}</span>
        <span class="region-meta">${escapeHtml(region.note)}</span>
        <span class="region-progress-track"><span style="width:${percent}%"></span></span>
      </span>
      <span class="region-count"><strong>${percent}%</strong>${ready} / ${count} ready</span>
    </button>`;
  }).join('');
  document.querySelectorAll('.region-card').forEach((button) => {
    button.addEventListener('click', () => {
      state.boneRegion = button.dataset.region;
      activateView('bones');
    });
  });
}

function bindChecks() {
  document.querySelectorAll('[data-check-kind]').forEach((input) => {
    input.addEventListener('change', () => setChecked(input.dataset.checkKind, input.dataset.checkId, input.checked));
  });
}

function bindJumps() {
  document.querySelectorAll('.visual-jump').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      jumpToVisual(link.dataset.visualId);
    });
  });
  document.querySelectorAll('.bone-jump').forEach((button) => {
    button.addEventListener('click', () => {
      state.boneRegion = 'All';
      activateView('bones');
      setTimeout(() => document.querySelector(`[data-bone-row="${CSS.escape(button.dataset.bone)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    });
  });
  document.querySelectorAll('.muscle-jump').forEach((button) => {
    button.addEventListener('click', () => jumpToMuscle(button.dataset.muscle));
  });
}

function jumpToMuscle(muscle) {
  state.muscleGroup = 'All';
  activateView('muscles');
  setTimeout(() => document.querySelector(`[data-muscle-row="${CSS.escape(muscle)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
}

function jumpToModel(number) {
  activateView('models');
  setTimeout(() => document.querySelector(`[data-model-row="${CSS.escape(number)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
}

function jumpToPracticalLabeling(cardId) {
  const cards = data.practicalLabelingCards || [];
  const targetIndex = cards.findIndex((card) => card.id === cardId);
  if (targetIndex < 0) return;
  state.practicalLabelingRegion = 'All';
  state.practicalLabelingOrder = cards.map((_card, index) => index);
  state.practicalLabelingIndex = targetIndex;
  state.practicalLabelingKey = `${state.practicalLabelingRegion}|${state.search}|${cards.map((card) => card.id).join(',')}`;
  activateView('practicalLabeling');
  scrollSectionToTop('practicalLabeling');
}

function activateView(view, options = {}) {
  if (!options.skipHistory && state.view !== view) pushNavigationHistory();
  state.view = view;
  document.body.dataset.view = view;
  document.body.dataset.navGroup = currentNavGroup(view);
  updateNavActive();
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active-view', section.id === view));
  renderCurrentView();
  updateBackButton();
}

function currentNavGroup(view = state.view) {
  if (view === 'dashboard') return 'home';
  if (['learnHub', 'bones', 'models', 'muscles', 'labeling'].includes(view)) return 'learn';
  if (['practiceLibrary', 'activities', 'practicalLabeling', 'drills'].includes(view)) return 'practice';
  if (view === 'practicalMode') return 'test';
  return 'reference';
}

function updateNavActive() {
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    const itemView = item.dataset.view;
    const itemDrillMode = item.dataset.drillMode;
    const itemActivityMode = item.dataset.activityMode;
    const navGroup = item.dataset.navGroup;
    const isActive = navGroup
      ? navGroup === currentNavGroup()
      : state.view === 'drills' && itemView === 'drills'
      ? itemDrillMode === state.drillMode
      : state.view === 'activities' && itemView === 'activities'
        ? !itemActivityMode || itemActivityMode === state.activity.mode
        : itemView === state.view && !itemDrillMode && !itemActivityMode;
    item.classList.toggle('active', isActive);
  });
}

function renderCurrentView() {
  renderDashboard();
  if (state.view === 'activities') renderActivities();
  if (state.view === 'bones') renderBones();
  if (state.view === 'labeling') renderLabeling();
  if (state.view === 'practicalLabeling') renderPracticalLabeling();
  if (state.view === 'practicalMode') renderPracticalMode();
  if (state.view === 'models') renderModels();
  if (state.view === 'muscles') renderMuscles();
  if (state.view === 'visuals') renderVisuals();
  if (state.view === 'drills') renderDrills();
  if (state.view === 'differentiation') renderDifferentiation();
  if (state.view === 'cram') renderCram();
}

function isMobileNavLayout() {
  return window.matchMedia('(max-width: 680px)').matches;
}

function setMobileNavOpen(open) {
  const sidebar = document.querySelector('.sidebar');
  const toggle = byId('mobileNavToggle');
  if (!sidebar || !toggle) return;
  const label = toggle.querySelector('.mobile-nav-toggle-label');
  sidebar.classList.toggle('mobile-nav-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? 'Close study navigation' : 'Open study navigation');
  if (label) label.textContent = open ? 'Close' : 'Menu';
}

function closeMobileNavOnSmallScreen() {
  if (isMobileNavLayout()) setMobileNavOpen(false);
}

function collapseStudyGuide(root) {
  if (!root || root.dataset.collapsed === 'true' || !root.children.length) return;
  const blocks = [...root.children];
  const howBlock = blocks.find((block) => normalize(block.querySelector('strong')?.textContent).includes('how to use'));
  const summary = howBlock?.querySelector('span')?.textContent || blocks[0]?.querySelector('span')?.textContent || '';
  root.innerHTML = `
    <p class="guide-summary">${escapeHtml(summary)}</p>
    <details>
      <summary>Study guidance</summary>
      <div class="page-guide-content">${blocks.map((block) => block.outerHTML).join('')}</div>
    </details>
  `;
  root.dataset.collapsed = 'true';
}

function prepareStudyGuides() {
  document.querySelectorAll('.page-guide').forEach(collapseStudyGuide);
}

function bindProgressTools() {
  const dialog = byId('progressDialog');
  const status = byId('progressDialogStatus');
  const open = () => {
    byId('examDateInput').value = learningCoach?.getStore().settings.examDate || '';
    status.textContent = '';
    dialog.showModal();
  };
  byId('progressTools')?.addEventListener('click', open);
  document.querySelectorAll('[data-open-progress-tools]').forEach((button) => button.addEventListener('click', open));
  byId('saveExamDate')?.addEventListener('click', () => {
    const value = learningCoach.setExamDate(byId('examDateInput').value);
    status.textContent = value ? 'Practical date saved. Future reviews will be capped before that date.' : 'Practical date cleared.';
    renderDashboard();
  });
  byId('exportProgress')?.addEventListener('click', () => {
    const backup = JSON.parse(learningCoach.exportProgress());
    backup.legacy = {
      checked: state.checked,
      drill: state.drill,
      drillAnswers: state.drillAnswers,
      oiaSelections: state.oiaSelections
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bio-2230-lower-limb-progress-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    status.textContent = 'Progress backup exported.';
  });
  byId('importProgress')?.addEventListener('click', () => byId('importProgressFile').click());
  byId('importProgressFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      learningCoach.importProgress(backup);
      state.checked = { ...(backup.legacy?.checked || learningCoach.getStore().coverage || {}) };
      state.drill = { ...(backup.legacy?.drill || {}) };
      state.drillAnswers = { ...(backup.legacy?.drillAnswers || {}) };
      state.oiaSelections = { ...(backup.legacy?.oiaSelections || {}) };
      saveJson('ll_checked', state.checked);
      saveJson('ll_drill', state.drill);
      saveJson('ll_drill_answers', state.drillAnswers);
      saveJson('ll_oia_selections', state.oiaSelections);
      status.textContent = 'Progress backup imported.';
      renderCurrentView();
    } catch (error) {
      status.textContent = error.message;
    }
    event.target.value = '';
  });
  byId('resetProgress')?.addEventListener('click', () => {
    if (!confirm('Clear coverage, readiness history, typed answers, drill scores, and quiz progress for this browser?')) return;
    state.checked = {};
    state.drill = {};
    state.drillAnswers = {};
    state.oiaSelections = {};
    state.practicalMode = defaultPracticalModeState();
    state.activity = defaultActivityState();
    learningCoach.resetProgress();
    saveJson('ll_checked', state.checked);
    saveJson('ll_drill', state.drill);
    saveJson('ll_drill_answers', state.drillAnswers);
    saveJson('ll_oia_selections', state.oiaSelections);
    status.textContent = 'All saved work has been cleared.';
    renderCurrentView();
  });
}

function init() {
  learningVariants = allLearningVariants();
  learningCoach = window.LearningEngine.create({ storage: localStorage, variants: learningVariants });
  learningCoach.loadAndMigrate();
  learningCoach.setVariants(learningVariants);
  document.body.dataset.view = state.view;
  document.body.dataset.navGroup = currentNavGroup();
  prepareStudyGuides();
  bindProgressTools();
  byId('mobileNavToggle')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    setMobileNavOpen(!sidebar?.classList.contains('mobile-nav-open'));
  });
  window.addEventListener('resize', () => {
    if (!isMobileNavLayout()) setMobileNavOpen(false);
  });
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      const drillMode = item.dataset.drillMode;
      const activityMode = item.dataset.activityMode;
      const drillModeChanged = view === 'drills' && drillMode && state.view === 'drills' && state.drillMode !== drillMode;
      if (drillModeChanged) pushNavigationHistory();
      if (drillMode) setDrillMode(drillMode);
      if (activityMode) setActivityMode(activityMode);
      activateView(view, { skipHistory: drillModeChanged });
      closeMobileNavOnSmallScreen();
    });
  });
  byId('appBack').addEventListener('click', goBackInSite);
  byId('globalSearch').addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderSearchResults();
    renderCurrentView();
  });
  document.querySelectorAll('[data-plan-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.planView;
      const drillMode = button.dataset.planDrillMode;
      const activityMode = button.dataset.planActivityMode;
      const drillModeChanged = view === 'drills' && drillMode && state.view === 'drills' && state.drillMode !== drillMode;
      if (drillModeChanged) pushNavigationHistory();
      if (drillMode) setDrillMode(drillMode);
      if (activityMode) setActivityMode(activityMode);
      activateView(view, { skipHistory: drillModeChanged });
    });
  });
  byId('revealAnswer').addEventListener('click', revealCurrentAnswer);
  byId('hideAnswer').addEventListener('click', hideCurrentAnswer);
  byId('toggleDeckStatus').addEventListener('click', toggleDeckStatus);
  byId('markCorrect').addEventListener('click', () => markCard('correct'));
  byId('markHard').addEventListener('click', () => markCard('hard'));
  byId('markMissed').addEventListener('click', () => markCard('missed'));
  byId('previousCard').addEventListener('click', previousCard);
  byId('nextCard').addEventListener('click', nextCard);
  byId('shuffleDeck').addEventListener('click', shuffleDeck);
  renderDashboard();
  updateNavActive();
  updateBackButton();
  const searchParams = new URLSearchParams(window.location.search);
  const requestedActivityMode = searchParams.get('activity');
  const requestedDrillMode = searchParams.get('drill');
  const hasRequestedActivity = Boolean(requestedActivityMode && ACTIVITY_MODES[requestedActivityMode]);
  const hasRequestedDrill = Boolean(requestedDrillMode && DRILL_MODES[requestedDrillMode]);
  if (hasRequestedActivity) setActivityMode(requestedActivityMode);
  if (hasRequestedDrill) setDrillMode(requestedDrillMode);
  const initialView = window.location.hash.slice(1)
    || (hasRequestedActivity ? 'activities' : '')
    || (hasRequestedDrill ? 'drills' : '');
  if (initialView && byId(initialView)?.classList.contains('view')) {
    activateView(initialView, { skipHistory: true });
  }
}

init();
