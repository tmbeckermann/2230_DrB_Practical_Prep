const data = window.STUDY_DATA;

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
  checked: loadJson('ll_checked', {}),
  drill: loadJson('ll_drill', {}),
  drillAnswers: loadJson('ll_drill_answers', {}),
  oiaSelections: loadJson('ll_oia_selections', {}),
  deckStatusVisible: false,
  drillMode: 'oiaReverse',
  deckName: 'OIA reverse recall',
  deckIndex: 0,
  deckOrder: [],
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
    viewChoices: {}
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
  const hasImages = data.modelKey.some((row) => row.image);
  const rows = data.modelKey
    .filter((row) => includesSearch(row.number, row.item, row.note))
    .map((row) => `<tr data-model-row="${escapeHtml(row.number)}">
      <td><strong>${escapeHtml(row.number)}</strong></td>
      ${hasImages ? `<td>${renderModelImage(row)}</td>` : ''}
      <td>${visualLink(row.visualId, data.muscleImageLookup[row.item], escapeHtml(row.item), row.item)}</td>
      <td>${row.note ? renderTextLinks(row.note) : '<span class="muted">-</span>'}</td>
      <td class="check-cell"><input class="row-check" type="checkbox" ${isChecked('model', row.number) ? 'checked' : ''} data-check-kind="model" data-check-id="${escapeHtml(row.number)}" aria-label="Mark muscle ID ${escapeHtml(row.number)} ${escapeHtml(row.item)} done"></td>
    </tr>`);
  const headers = hasImages ? ['Muscle ID #', 'Lab image', 'Structure', 'Study note', 'Done'] : ['Muscle ID #', 'Structure', 'Study note', 'Done'];
  const widths = hasImages ? ['8%', '18%', '30%', '34%', '10%'] : ['10%', '36%', '44%', '10%'];
  byId('modelKeyTable').innerHTML = tableHtml(headers, rows, { widths });
  bindChecks();
  bindJumps();
}

function renderModelImage(row) {
  if (!row.image) return '<span class="muted">No image</span>';
  const count = row.images?.length || 1;
  return `<div class="model-image-stack">
    <img class="model-thumb" src="${escapeHtml(row.image)}" alt="Model lookup image for ${escapeHtml(row.item)}">
    ${count > 1 ? `<span class="muted">${count} images</span>` : ''}
  </div>`;
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
  return `<div class="drill-image-grid">
    ${items.map((item) => `<figure>
      <span class="drill-image-frame">
        ${item.mirrored
          ? `<img class="mirrored-drill-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(label)}">`
          : renderImageAnchor(item.image, `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(label)}">`, label)}
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
  renderSimpleTable('cramTable', ['Cram cue', 'Say from memory', 'Why it matters'], data.cramSheet, ['cue', 'memory', 'why'], ['25%', '43%', '32%']);
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
      const fallbackImage = row.image || data.muscleImageLookup[row.item] || '';
      const images = (row.images || []).length ? row.images : (fallbackImage ? [fallbackImage] : []);
      const label = (row.images || []).length || row.image ? 'Model image' : 'Muscle ID image';
      return images.map((image, index) => ({
      id: `model-image-${row.number}-${index}`,
      label,
      prompt: 'Identify the tagged structure',
      answer: `${row.item}${row.note ? `; ${row.note}` : ''}`,
      image,
      textResponse: true,
      responsePlaceholder: 'Type the tagged structure before revealing.',
      statusLabel: row.item,
      statusLinkType: 'muscle',
      statusLinkTarget: row.item
    }));
    }).map((card, index) => ({ ...card, label: `${card.label} ${index + 1}` }));
  if (imageCards.length) decks['Model Image ID'] = imageCards;
  return decks;
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
  byId('drillModeTitle').textContent = config.label;
  byId('drillModeSubtitle').textContent = config.subtitle;
  byId('drillGuide').innerHTML = `
    <div><strong>What this is</strong><span>${escapeHtml(config.what)}</span></div>
    <div><strong>What to know</strong><span>${escapeHtml(config.know)}</span></div>
    <div><strong>How to use it</strong><span>${escapeHtml(config.use)}</span></div>
  `;
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
  byId('drillVisual').innerHTML = renderDrillImages(card.images, card.image, card.label || card.prompt, { showCaptions });
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
  state.drill[card.id] = status;
  saveJson('ll_drill', state.drill);
  nextCard();
}

function nextCard() {
  const deck = drillDecks()[state.deckName];
  state.deckIndex = (state.deckIndex + 1) % deck.length;
  renderDrills();
  renderDashboard();
  scrollSectionToTop('drills');
}

function previousCard() {
  const deck = drillDecks()[state.deckName];
  state.deckIndex = (state.deckIndex - 1 + deck.length) % deck.length;
  renderDrills();
  renderDashboard();
  scrollSectionToTop('drills');
}

function shuffleDeck() {
  const deck = drillDecks()[state.deckName];
  state.deckOrder = shuffledDeckOrder(deck);
  state.deckIndex = 0;
  renderDrills();
  scrollSectionToTop('drills');
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
    description: 'Tagged model-image questions for practical muscle identification.'
  },
  oia: {
    label: 'OIA recall',
    description: 'Muscle-to-origin, insertion, and action prompts without a dropdown bank.'
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
    <section class="panel">
      <div class="panel-heading">
        <h2>Build a Practical Check</h2>
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
    order: shuffledDeckOrder(cards).slice(0, Math.min(size, cards.length))
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
      ${renderPracticalModeResponse(card)}
      ${renderPracticalModeChoices(card)}
      <div class="drill-visual">${renderDrillImages(card.images, card.image, card.label || card.prompt, { showCaptions: false })}</div>
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
  byId('submitPracticalAnswer')?.addEventListener('click', recordPracticalModeResult);
}

function recordPracticalModeResult() {
  const card = practicalModeCurrentCard();
  if (!card) return;
  const answer = state.practicalMode.answers[card.practicalId] || '';
  const sideChoice = state.practicalMode.sideChoices[card.practicalId] || '';
  const viewChoice = state.practicalMode.viewChoices[card.practicalId] || '';
  const status = practicalModeInitialStatus(card, sideChoice, viewChoice);
  state.practicalMode.results.push({
    cardId: card.sourceCardId,
    label: deckStatusLabel(card),
    type: card.practicalTypeLabel,
    status,
    answer,
    correctAnswer: card.answer,
    correctAnswerHtml: card.answerHtml || '',
    answerImage: card.answerImage || '',
    answerImages: card.answerImages || [],
    sideChoice,
    viewChoice,
    correctSide: card.side || '',
    correctView: card.view || '',
    statusLinkType: card.statusLinkType,
    statusLinkTarget: card.statusLinkTarget
  });
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
      state.practicalMode.results[index].status = status;
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
  const total = totalBones + totalMuscles + totalModels;
  const done = doneBones + doneMuscles + doneModels;
  const percent = total ? Math.round((done / total) * 100) : 0;
  byId('overallProgress').style.width = `${percent}%`;
  byId('overallProgressText').textContent = `${percent}%`;
  byId('progressCounts').textContent = `${done} / ${total}`;
  byId('metricGrid').innerHTML = [
    ['Bones and markings', doneBones, totalBones],
    ['Muscles to ID', doneModels, totalModels],
    ['Muscle OIAs', doneMuscles, totalMuscles]
  ].map(([label, value, max]) => `<div class="metric-card"><strong>${value}</strong><span>${label} of ${max}</span></div>`).join('');
  byId('focusCount').textContent = `${data.practicalModelFocus.length} items | click a muscle for OIAs`;
  byId('focusList').innerHTML = data.practicalModelFocus.map((item) => `<button class="tag tag-button practical-focus-jump" type="button" data-muscle="${escapeHtml(item)}" title="Open ${escapeHtml(item)} in the muscle table">${escapeHtml(item)}</button>`).join('');
  byId('focusList').querySelectorAll('.practical-focus-jump').forEach((button) => {
    button.addEventListener('click', () => jumpToMuscle(button.dataset.muscle));
  });
  renderRegionMap();
  const validDrillIds = new Set(Object.values(drillDecks()).flat().map((card) => card.id));
  const missed = Object.entries(state.drill)
    .filter(([cardId, status]) => status === 'missed' && validDrillIds.has(cardId))
    .map(([cardId]) => cardId);
  byId('missedCount').textContent = `${missed.length}`;
  byId('missedList').innerHTML = missed.length ? missed.slice(0, 18).map((item) => `<button class="status-pill missed missed-jump" type="button" data-card-id="${escapeHtml(item)}">${escapeHtml(drillCardLabel(item))}</button>`).join('') : '<span class="muted">None</span>';
  byId('missedList').querySelectorAll('.missed-jump').forEach((button) => {
    button.addEventListener('click', () => jumpToDrillCard(button.dataset.cardId));
  });
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
    const count = data.bones.filter((bone) => bone.region === region.label).length;
    return `<button class="region-card" type="button" data-region="${escapeHtml(region.label)}">
      <span class="region-icon">${escapeHtml(region.icon)}</span>
      <span>
        <span class="region-name">${escapeHtml(region.label)}</span>
        <span class="region-meta">${escapeHtml(region.note)}</span>
      </span>
      <span class="region-count">${count} items</span>
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
  updateNavActive();
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active-view', section.id === view));
  renderCurrentView();
  updateBackButton();
}

function updateNavActive() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const itemView = item.dataset.view;
    const itemDrillMode = item.dataset.drillMode;
    const isActive = state.view === 'drills' && itemView === 'drills'
      ? itemDrillMode === state.drillMode
      : itemView === state.view && !itemDrillMode;
    item.classList.toggle('active', isActive);
  });
}

function renderCurrentView() {
  renderDashboard();
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
  sidebar.classList.toggle('mobile-nav-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.textContent = open ? 'Close' : 'Menu';
}

function closeMobileNavOnSmallScreen() {
  if (isMobileNavLayout()) setMobileNavOpen(false);
}

function init() {
  byId('mobileNavToggle')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    setMobileNavOpen(!sidebar?.classList.contains('mobile-nav-open'));
  });
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      const drillMode = item.dataset.drillMode;
      const drillModeChanged = view === 'drills' && drillMode && state.view === 'drills' && state.drillMode !== drillMode;
      if (drillModeChanged) pushNavigationHistory();
      if (drillMode) setDrillMode(drillMode);
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
  byId('resetProgress').addEventListener('click', () => {
    if (!confirm('Clear saved checkmarks, typed answers, drill scores, and quiz progress for this browser?')) return;
    state.checked = {};
    state.drill = {};
    state.drillAnswers = {};
    state.oiaSelections = {};
    state.practicalMode = defaultPracticalModeState();
    saveJson('ll_checked', state.checked);
    saveJson('ll_drill', state.drill);
    saveJson('ll_drill_answers', state.drillAnswers);
    saveJson('ll_oia_selections', state.oiaSelections);
    renderCurrentView();
  });
  document.querySelectorAll('[data-plan-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.planView;
      const drillMode = button.dataset.planDrillMode;
      const drillModeChanged = view === 'drills' && drillMode && state.view === 'drills' && state.drillMode !== drillMode;
      if (drillModeChanged) pushNavigationHistory();
      if (drillMode) setDrillMode(drillMode);
      activateView(view, { skipHistory: drillModeChanged });
    });
  });
  byId('revealAnswer').addEventListener('click', revealCurrentAnswer);
  byId('hideAnswer').addEventListener('click', hideCurrentAnswer);
  byId('toggleDeckStatus').addEventListener('click', toggleDeckStatus);
  byId('markCorrect').addEventListener('click', () => markCard('correct'));
  byId('markMissed').addEventListener('click', () => markCard('missed'));
  byId('previousCard').addEventListener('click', previousCard);
  byId('nextCard').addEventListener('click', nextCard);
  byId('shuffleDeck').addEventListener('click', shuffleDeck);
  renderDashboard();
  updateNavActive();
  updateBackButton();
}

init();
