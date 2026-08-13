const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadSection(section) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['data.js', 'visual-data.js', 'muscle-visual-data.js']) {
    const fullPath = path.join(root, section, file);
    if (fs.existsSync(fullPath)) vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
  }
  const bankScript = path.join(root, 'model-image-banks.js');
  vm.runInContext(fs.readFileSync(bankScript, 'utf8'), context, { filename: bankScript });
  return context.window.STUDY_DATA;
}

const expected = {
  'lower-limb': {
    structures: 26,
    structuresWithQuestionImages: 24,
    questionImages: 44,
    courseImages: 0,
    courseModelReferences: 52,
    contexts: { 'single-leg-model': 26, 'arm-model': 0, 'face-image': 0, 'torso-fallback': 0 },
    missingQuestionImages: ['Long head of biceps femoris', 'Short head of biceps femoris']
  },
  'upper-limb': {
    structures: 29,
    structuresWithQuestionImages: 26,
    questionImages: 56,
    courseImages: 0,
    courseModelReferences: 0,
    contexts: { 'single-leg-model': 0, 'arm-model': 24, 'face-image': 0, 'torso-fallback': 5 },
    missingQuestionImages: ['Biceps brachii - long head', 'Biceps brachii - short head', 'Pronator quadratus']
  },
  axial: {
    structures: 17,
    structuresWithQuestionImages: 13,
    questionImages: 40,
    courseImages: 10,
    courseModelReferences: 0,
    contexts: { 'single-leg-model': 0, 'arm-model': 0, 'face-image': 10, 'torso-fallback': 7 },
    missingQuestionImages: ['Corrugator supercilii', 'Platysma', 'Semispinalis cervicis', 'Semispinalis thoracis']
  }
};

for (const [section, expectation] of Object.entries(expected)) {
  const data = loadSection(section);
  const stats = data.modelImageBankStats;
  assert.equal(stats.structures, expectation.structures, `${section}: model structure count`);
  assert.equal(stats.structuresWithQuestionImages, expectation.structuresWithQuestionImages, `${section}: question-ready coverage`);
  assert.equal(stats.questionImages, expectation.questionImages, `${section}: question-ready image count`);
  assert.equal(stats.sourceCounts['course-practical-image'], expectation.courseImages, `${section}: course image count`);
  assert.equal(stats.sourceCounts['course-model-reference'], expectation.courseModelReferences, `${section}: course model reference count`);
  assert.deepEqual({ ...stats.contextCounts }, expectation.contexts, `${section}: assessment context counts`);
  assert.equal(stats.sourceCounts['lab-model-photo'], 0, `${section}: must not fabricate lab-model photos`);
  assert.equal(stats.questionSourceCounts['pal-atlas-substitute'], expectation.questionImages, `${section}: current question bank should use PAL substitutes`);

  const missing = Array.from(data.modelKey)
    .filter((row) => !row.images.some((item) => item.questionReady !== false))
    .map((row) => row.item)
    .sort();
  assert.deepEqual(missing, expectation.missingQuestionImages.slice().sort(), `${section}: missing question-ready structures`);

  for (const row of data.modelKey) {
    assert.ok(Array.isArray(row.images), `${section}: ${row.item} should have an image bank array`);
    for (const item of row.images) {
      assert.equal(typeof item, 'object', `${section}: ${row.item} bank entries should carry metadata`);
      assert.ok(item.sourceKind, `${section}: ${row.item} image must declare its source kind`);
      assert.ok(item.sourceTypeLabel, `${section}: ${row.item} image must have a source label`);
      assert.ok(item.sourceDescription, `${section}: ${row.item} image must explain its provenance`);
      assert.equal(item.assessmentContext, row.assessmentContext, `${section}: ${row.item} image context must match the assessment target`);
      assert.ok(item.assessmentContextLabel, `${section}: ${row.item} image needs a student-facing context label`);
      assert.ok(fs.existsSync(path.join(root, section, item.image)), `${section}: missing asset ${item.image}`);
      if (item.sourceKind === 'pal-atlas-substitute') {
        assert.match(item.sourceDescription, /not a course lab-model photo/i, `${section}: PAL substitute disclaimer`);
      }
      if (item.sourceKind === 'course-practical-image') {
        assert.equal(item.questionReady, false, `${section}: multi-label course reference must not become a single-answer prompt`);
      }
      if (item.sourceKind === 'course-model-reference') {
        assert.equal(section, 'lower-limb', `${section}: course model references are only available for the single-leg model`);
        assert.equal(item.questionReady, false, `${section}: multi-label model views must remain reference-only`);
      }
    }
  }
}

const lower = loadSection('lower-limb');
assert.ok(lower.modelKey.every((row) => row.assessmentContext === 'single-leg-model'), 'lower-limb: every muscle ID should target the single-leg model');
assert.ok(lower.modelKey.every((row) => row.images.some((item) => item.sourceKind === 'course-model-reference')), 'lower-limb: every model ID should include an existing course single-leg reference');
assert.ok(lower.modelKey.every((row) => row.images[0]?.sourceKind === 'course-model-reference'), 'lower-limb: the course single-leg view should be the visible reference thumbnail');
for (const name of ['Long head of biceps femoris', 'Short head of biceps femoris']) {
  const row = lower.modelKey.find((item) => item.item === name);
  assert.ok(row.images.length, `lower-limb: reference bank for ${name}`);
  assert.ok(row.images.every((item) => item.questionReady === false), `lower-limb: ${name} must remain reference-only without a head-specific target`);
}

const axial = loadSection('axial');
const faceItems = new Set(['Orbicularis oris', 'Zygomaticus major', 'Zygomaticus minor', 'Buccinator', 'Platysma', 'Risorius', 'Corrugator supercilii', 'Orbicularis oculi', 'Masseter', 'Temporalis']);
for (const row of axial.modelKey) {
  assert.equal(row.assessmentContext, faceItems.has(row.item) ? 'face-image' : 'torso-fallback', `axial: ${row.item} context`);
  if (faceItems.has(row.item)) assert.equal(row.images[0]?.sourceKind, 'course-practical-image', `axial: ${row.item} should show the course face image first`);
}
for (const name of ['Platysma', 'Corrugator supercilii']) {
  const row = axial.modelKey.find((item) => item.item === name);
  assert.ok(row.images.some((item) => item.sourceKind === 'course-practical-image'), `axial: course reference for ${name}`);
  assert.ok(row.images.every((item) => item.questionReady === false), `axial: ${name} should remain reference-only`);
}

const upper = loadSection('upper-limb');
const upperTorsoFallback = new Set(['Trapezius', 'Subclavius', 'Pectoralis minor', 'Pectoralis major', 'Latissimus dorsi']);
for (const row of upper.modelKey) {
  assert.equal(row.assessmentContext, upperTorsoFallback.has(row.item) ? 'torso-fallback' : 'arm-model', `upper-limb: ${row.item} context`);
}

console.log('Model image bank coverage and provenance checks passed.');
